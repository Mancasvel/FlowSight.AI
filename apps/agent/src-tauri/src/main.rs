// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Load .env.local from project root (../../.env.local relative to src-tauri/target/debug usually, 
  // but dev command runs from src-tauri root, so ../../.env.local)
  // Actually, dotenv::dotenv() looks for .env in current dir or parents.
  // Since .env.local isn't standard .env, we might need specific load or just rename it.
  // BUT standard practice: Try loading parent .env.local
  let _ = dotenv::from_filename(".env.local"); 
  let _ = dotenv::from_filename("../../.env.local"); // Try root if running from backend dir

  app_lib::run();
}
