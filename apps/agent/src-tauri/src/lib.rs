mod agent;
mod jira;
mod sync;
pub mod fingerprint;
pub mod context;

use agent::{
    AgentState, initialize_agent, get_config, update_config,
    get_status, start_monitoring, stop_monitoring,
    capture_screen_command, save_activity,
    get_activity_log, check_ollama,
    install_ollama, pull_model, start_ollama,
    get_semantic_fingerprint
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
        .manage(AgentState::default())
        .invoke_handler(tauri::generate_handler![
            initialize_agent,
            get_config,
            update_config,
            get_status,
            start_monitoring,
            stop_monitoring,
    capture_screen_command,
    save_activity,
    get_activity_log,
    check_ollama,
    install_ollama,
            pull_model,
            start_ollama,
            get_semantic_fingerprint,
            agent::capture_context_snapshot,
            jira::fetch_jira_tasks,
            jira::start_jira_oauth,
            jira::fetch_jira_profile
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
