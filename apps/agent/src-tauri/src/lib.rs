mod agent;

use agent::{
    AgentState, initialize_agent, get_config, update_config,
    get_status, start_monitoring, stop_monitoring,
    capture_and_analyze, get_activity_log, check_ollama, test_pm_connection,
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
            capture_and_analyze,
            get_activity_log,
            check_ollama,
            test_pm_connection,
            install_ollama,
            pull_model,
            start_ollama
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
