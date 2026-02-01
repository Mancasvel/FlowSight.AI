mod pm;

use pm::{
    PmState, initialize_pm, get_config, update_config, get_developers,
    get_reports, get_stats, start_server, stop_server, get_server_status,
    generate_api_key, clear_old_reports, check_ollama, install_ollama, pull_model, start_ollama,
    save_remote_report, create_team, get_teams, validate_license_key, save_fingerprint_report,
    register_user, login_user, generate_test_data, register_developer_with_key
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PmState::default())
        .invoke_handler(tauri::generate_handler![
            initialize_pm,
            get_config,
            update_config,
            get_developers,
            get_reports,
            get_stats,
            start_server,
            stop_server,
            get_server_status,
            generate_api_key,
            clear_old_reports,
            check_ollama,
            install_ollama,
            pull_model,
            start_ollama,
            save_remote_report,
            create_team,
            get_teams,
            validate_license_key,
            save_fingerprint_report,
            register_user,
            login_user,
            generate_test_data,
            register_developer_with_key
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
