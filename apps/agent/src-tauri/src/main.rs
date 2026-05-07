// --- Windows subsystem note ---
//
// We intentionally do NOT use `#![windows_subsystem = "windows"]` here.
//
// For GUI-subsystem binaries Windows loads user32.dll — and therefore fires
// AppInit_DLLs — *before* main() is ever called.  VPN / proxy software such as
// Astrill (ASProxy64.dll) uses that mechanism to inject a network-intercept DLL
// into every GUI process.  When that DLL tries to hook WebView2's virtual URI
// scheme it hits a bad memory access (0xc0000005) and kills the app before the
// window even appears.
//
// By using SUBSYSTEM:CONSOLE (the default when the attribute is absent) user32
// is NOT a static loader dependency, so it is never pulled in before main().
// The very first thing main() does is call SetProcessMitigationPolicy
// (ProcessExtensionPointDisablePolicy) using only kernel32.dll.  After that flag
// is set, when Tauri/WebView2 eventually loads user32.dll the OS skips
// AppInit_DLLs entirely — ASProxy64.dll never enters the process.
//
// The only side-effect of SUBSYSTEM:CONSOLE is that the OS allocates a console
// window.  We call FreeConsole() immediately (also kernel32, no user32 needed)
// in release builds so no console is ever visible.  Debug builds keep the
// console so log output is readable during development.

/// Must be the very first call in `main()` on Windows, before any user32 import.
///
/// kernel32 is guaranteed to be resident before main(); user32 is not (for console
/// subsystem apps).  Setting the mitigation policy here means user32.DllMain will
/// see the flag and skip AppInit_DLLs when it eventually loads via Tauri/WebView2.
#[cfg(windows)]
fn harden_process_early() {
    use std::ffi::c_void;

    extern "system" {
        fn SetProcessMitigationPolicy(policy: u32, buf: *const c_void, len: u32) -> i32;
        fn FreeConsole() -> i32;
    }

    unsafe {
        // ProcessExtensionPointDisablePolicy = 6, DisableExtensionPoints = bit 0.
        // Blocks AppInit_DLLs from loading when user32.dll is subsequently imported.
        let policy: u32 = 1u32;
        SetProcessMitigationPolicy(6, &policy as *const u32 as *const c_void, 4);

        // Release builds: detach the console the OS created for the CONSOLE subsystem.
        // FreeConsole is in kernel32, so this is safe before user32 loads.
        // The console window is deallocated before it ever paints — no visible flash.
        #[cfg(not(debug_assertions))]
        FreeConsole();
    }
}

fn main() {
  // Must be first: blocks AppInit_DLLs before user32.dll is loaded.
  // See the module-level comment above for the full rationale.
  #[cfg(windows)]
  harden_process_early();

  // No leemos `.env.local` ni rutas relativas del repo en runtime: no existen
  // en otros PCs y no deben ser parte del comportamiento instalado.
  // El `.exe` instalado solo acepta un `.env` junto al ejecutable como override
  // opcional. La configuracion publica de Supabase tiene defaults en codigo.
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let _ = dotenv::from_filename(dir.join(".env"));
    }
  }

  // Panic hook: en release el .exe no tiene stdout, así que cualquier panic
  // (incluido el que esté cerrando la ventana al loguear con Google) se
  // perdía. Lo volcamos a %LOCALAPPDATA%\FlowSight\crash.log y al logger de
  // tauri-plugin-log cuando ya está instalado.
  std::panic::set_hook(Box::new(|info| {
    let msg = format!(
      "[{}] PANIC: {}\nLocation: {}\n\n",
      chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
      info.payload()
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
        .unwrap_or("<non-string panic>"),
      info.location()
        .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
        .unwrap_or_else(|| "<unknown>".into()),
    );
    eprintln!("{}", msg);
    log::error!("{}", msg);
    let path = app_lib::paths::crash_log_path_or_fallback();
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
      let _ = f.write_all(msg.as_bytes());
    }
  }));

  app_lib::run();
}
