// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Env loading strategy:
  // - No leemos `.env.local` ni rutas relativas del repo en runtime: no existen
  //   en otros PCs y no deben ser parte del comportamiento instalado.
  // - El `.exe` instalado solo acepta un `.env` junto al ejecutable como override
  //   opcional. La configuracion publica de Supabase tiene defaults en codigo.
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
