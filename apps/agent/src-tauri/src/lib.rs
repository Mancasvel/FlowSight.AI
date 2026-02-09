mod agent;
mod jira;
mod sync;
mod auth;
mod linear;
pub mod context;

use agent::{
    AgentState, initialize_agent, get_config, update_config,
    get_status, start_monitoring, stop_monitoring,
    capture_screen_command, save_activity,
    get_activity_log, get_today_history, check_ollama,
    install_ollama, pull_model, start_ollama
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
            agent::capture_context_snapshot,
            jira::fetch_jira_tasks,
            jira::start_jira_oauth,
            jira::fetch_jira_profile,
            sync::force_sync_now,
            sync::save_user_session,
            sync::clear_user_session,
            sync::get_current_user,
            sync::upload_activity_report,
            sync::join_team,
            // Auth commands
            auth::start_auth,
            auth::get_auth_session,
            auth::logout,
            auth::is_logged_in,
            auth::login_with_code,
            // Linear commands
            linear::fetch_linear_tasks,
            linear::fetch_linear_profile,
            // History commands
            get_today_history
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
