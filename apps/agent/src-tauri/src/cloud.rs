// FlowSight Cloud Configuration
// The DEV Agent connects to FlowSight's cloud API

/// FlowSight API Base URL
/// In production, this would be: https://api.flowsight.ai
/// For development, use your local dashboard
pub const FLOWSIGHT_API_URL: &str = "https://app.flowsight.ai";

/// Development/Local API URL (used when FLOWSIGHT_DEV_MODE is set)
pub const FLOWSIGHT_DEV_API_URL: &str = "http://localhost:3000";

/// Get the API URL based on environment
pub fn get_api_url() -> String {
    // Check for dev mode environment variable or config
    if std::env::var("FLOWSIGHT_DEV_MODE").is_ok() {
        FLOWSIGHT_DEV_API_URL.to_string()
    } else {
        // In production builds, always use the cloud API
        #[cfg(debug_assertions)]
        {
            FLOWSIGHT_DEV_API_URL.to_string()
        }
        #[cfg(not(debug_assertions))]
        {
            FLOWSIGHT_API_URL.to_string()
        }
    }
}

/// API Endpoints
pub mod endpoints {
    pub const REGISTER_DEVELOPER: &str = "/api/developers";
    pub const SUBMIT_REPORT: &str = "/api/reports";
    pub const VALIDATE_API_KEY: &str = "/api/teams";
    pub const HEALTH_CHECK: &str = "/api/health";
}

/// Data retention info
pub const RETENTION_DAYS: u32 = 30;

/// Rate limiting
pub const MAX_REPORTS_PER_MINUTE: u32 = 10;
pub const MIN_CAPTURE_INTERVAL_SECS: u32 = 10;
