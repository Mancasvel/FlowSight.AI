mod agent;
mod agent_pure;
mod anonymous_analytics;
mod auth;
mod coach_chat;
pub mod context;
mod crash_guard;
mod entitlements;
mod focus_semantics;
mod insights_local;
mod jira;
mod linear;
mod llama_port;
mod llama_windows_job;
mod notion;
mod oauth_env;
pub mod paths;
mod privacy;
mod secure_config;
mod sync;
mod sync_env;
mod sync_pure;
mod telemetry;
mod user_preferences;
mod vision_model;

use tauri::Manager;

use agent::{
    check_local_server, get_config, get_status, get_today_history, get_week_summary,
    initialize_agent, llama_managed_process_status, llama_server_log_tail,
    restart_llama_server_cpu_only, set_task_context, start_monitoring, stop_monitoring,
    update_config, AgentState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Must be the very first thing `run()` does: installs the Vectored Exception
    // Handler that contains hardware faults from third-party DLLs (e.g. a broken
    // Winsock LSP such as an old VPN's network-intercept driver) so they can
    // only ever take down the specific background thread that touched them,
    // never the whole process. See `crash_guard` module docs.
    crash_guard::install();

    tauri::Builder::default()
        .manage(AgentState::default())
        .invoke_handler(tauri::generate_handler![
            initialize_agent,
            get_config,
            update_config,
            get_status,
            start_monitoring,
            stop_monitoring,
            check_local_server,
            jira::fetch_jira_tasks,
            jira::fetch_jira_profile,
            sync::save_user_session,
            sync::clear_user_session,
            sync::get_current_user,
            sync::join_team,
            sync::get_user_teams,
            sync::set_active_team,
            entitlements::get_entitlements,
            entitlements::save_entitlements_command,
            entitlements::refresh_entitlements,
            notion::get_notion_status,
            notion::start_notion_oauth,
            notion::disconnect_notion,
            notion::search_notion_destinations,
            notion::save_notion_destination,
            notion::create_notion_report_destination,
            notion::publish_notion_report,
            coach_chat::get_coach_chat_messages,
            coach_chat::get_coach_chat_usage,
            coach_chat::send_coach_chat_message,
            insights_local::generate_local_status_report,
            user_preferences::get_user_preferences,
            user_preferences::save_user_preferences_command,
            anonymous_analytics::get_analytics_consent,
            anonymous_analytics::set_analytics_consent,
            anonymous_analytics::sync_anonymous_analytics,
            anonymous_analytics::submit_product_feedback,
            privacy::get_privacy_settings,
            privacy::update_privacy_settings,
            privacy::export_personal_data,
            privacy::delete_local_data,
            privacy::delete_cloud_account,
            agent::start_server,
            agent::stop_server,
            llama_managed_process_status,
            llama_server_log_tail,
            restart_llama_server_cpu_only,
            // Auth commands
            auth::start_auth,
            auth::get_auth_session,
            auth::logout,
            auth::login_with_code,
            // Linear commands
            linear::fetch_linear_tasks,
            // History commands
            get_today_history,
            get_week_summary,
            set_task_context,
            paths::get_flowsight_user_paths,
            paths::save_pdf_to_downloads,
            paths::open_path_in_file_manager,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Light));
            }

            // Self-update support (GitHub Releases). Desktop-only; mobile targets skip it.
            // `process` provides relaunch() so the frontend can restart after installing.
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_process::init())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            // Log a archivo en TODOS los builds. En release el usuario no ve stderr,
            // así que sin esto no hay forma de diagnosticar crashes post-login.
            // Los archivos quedan en %LOCALAPPDATA%\ai.flowsight.agent\logs\ (Windows)
            // o equivalente del OS según tauri-plugin-log.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .max_file_size(1024 * 1024)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                            file_name: None,
                        }),
                    ])
                    .build(),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
