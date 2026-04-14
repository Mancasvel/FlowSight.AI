// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Dev: typical repo paths. Installed app: optional `.env` next to the executable (same keys as Vite).
  let _ = dotenv::from_filename(".env.local");
  let _ = dotenv::from_filename("../../.env.local");
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let _ = dotenv::from_filename(dir.join(".env"));
    }
  }

  app_lib::run();
}
