use std::sync::Mutex;
use tauri::State;

mod agent;

// Define a state type for our agent
type AgentState = Mutex<Option<FlowSightAgent>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AgentState::default())
    .invoke_handler(tauri::generate_handler![
      initialize_agent,
      get_config,
      update_config,
      start_monitoring,
      stop_monitoring,
      get_status,
      simulate_event,
      get_blockers,
      resolve_blocker,
      get_blocker_stats,
      get_recent_events,
      get_session_stats,
      get_activity_stats,
      detect_blockers,
      get_status_summary
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
