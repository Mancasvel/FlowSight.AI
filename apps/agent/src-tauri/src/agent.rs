use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::State;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::Local;
use rusqlite::{Connection, params};

// Export the AgentState type for use in lib.rs
pub type AgentState = Mutex<Option<FlowSightAgent>>;

// Activity report that gets sent to PM
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActivityReport {
    pub id: Option<i64>,
    pub timestamp: String,
    pub dev_id: String,
    pub description: String,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub activity_type: String,
    pub synced: bool,
}

// Config for the dev agent
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AgentConfig {
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "developerId")]
    pub developer_id: Option<String>,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
    #[serde(rename = "devId")]
    pub dev_id: Option<String>,
    #[serde(rename = "devName")]
    pub dev_name: Option<String>,
    #[serde(rename = "pmDashboardUrl")]
    pub pm_dashboard_url: Option<String>,
    #[serde(rename = "captureInterval")]
    pub capture_interval: Option<u64>,
    #[serde(rename = "visionModel")]
    pub vision_model: Option<String>,
    #[serde(rename = "enableScreenCapture")]
    pub enable_screen_capture: Option<bool>,
}

// Registration result from the dashboard
#[derive(Serialize, Deserialize, Debug)]
pub struct RegistrationResult {
    pub success: bool,
    #[serde(rename = "developerId")]
    pub developer_id: Option<String>,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
    pub message: Option<String>,
    pub error: Option<String>,
}

// FlowSight Dev Agent
pub struct FlowSightAgent {
    pub initialized: bool,
    pub config: AgentConfig,
    pub is_running: bool,
    pub reports_sent: u32,
    pub last_activity: Option<String>,
    pub db_path: PathBuf,
    pub is_registered: bool,
}

impl Default for FlowSightAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl FlowSightAgent {
    pub fn new() -> Self {
        let db_path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("FlowSight")
            .join("activity.db");
        
        // Create directory if not exists
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        let mut agent = Self {
            initialized: true,
            config: AgentConfig {
                api_key: None,
                developer_id: None,
                team_id: None,
                dev_id: Some(whoami::username()),
                dev_name: Some(whoami::realname()),
                pm_dashboard_url: Some("http://localhost:3000".to_string()),
                capture_interval: Some(30000),
                vision_model: Some("llava:7b".to_string()),
                enable_screen_capture: Some(true),
            },
            is_running: false,
            reports_sent: 0,
            last_activity: None,
            db_path,
            is_registered: false,
        };
        
        // Initialize SQLite database
        agent.init_database();
        
        // Load config from database
        agent.load_config();
        
        agent
    }
    
    fn init_database(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS activity_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    dev_id TEXT NOT NULL,
                    description TEXT NOT NULL,
                    app_name TEXT,
                    window_title TEXT,
                    activity_type TEXT NOT NULL,
                    synced INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE INDEX IF NOT EXISTS idx_reports_synced ON activity_reports(synced);
                CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON activity_reports(timestamp DESC);"
            );
        }
    }
    
    fn load_config(&mut self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let keys = ["api_key", "developer_id", "team_id", "dev_name", "pm_dashboard_url", "vision_model"];
            
            for key in keys {
                let result: Result<String, _> = conn.query_row(
                    "SELECT value FROM config WHERE key = ?",
                    [key],
                    |row| row.get(0),
                );
                
                if let Ok(value) = result {
                    match key {
                        "api_key" => self.config.api_key = Some(value),
                        "developer_id" => {
                            self.config.developer_id = Some(value);
                            self.is_registered = true;
                        }
                        "team_id" => self.config.team_id = Some(value),
                        "dev_name" => self.config.dev_name = Some(value),
                        "pm_dashboard_url" => self.config.pm_dashboard_url = Some(value),
                        "vision_model" => self.config.vision_model = Some(value),
                        _ => {}
                    }
                }
            }
        }
    }
    
    fn save_config(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let configs = [
                ("api_key", self.config.api_key.as_deref()),
                ("developer_id", self.config.developer_id.as_deref()),
                ("team_id", self.config.team_id.as_deref()),
                ("dev_name", self.config.dev_name.as_deref()),
                ("pm_dashboard_url", self.config.pm_dashboard_url.as_deref()),
                ("vision_model", self.config.vision_model.as_deref()),
            ];
            
            for (key, value) in configs {
                if let Some(val) = value {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                        params![key, val],
                    );
                }
            }
        }
    }
    
    pub fn save_report(&self, report: &ActivityReport) -> Result<i64, String> {
        let conn = Connection::open(&self.db_path).map_err(|e| e.to_string())?;
        
        conn.execute(
            "INSERT INTO activity_reports (timestamp, dev_id, description, app_name, window_title, activity_type, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                report.timestamp,
                report.dev_id,
                report.description,
                report.app_name,
                report.window_title,
                report.activity_type,
                report.synced as i32
            ],
        ).map_err(|e| e.to_string())?;
        
        Ok(conn.last_insert_rowid())
    }
    
    pub fn mark_report_synced(&self, id: i64) -> Result<(), String> {
        let conn = Connection::open(&self.db_path).map_err(|e| e.to_string())?;
        conn.execute("UPDATE activity_reports SET synced = 1 WHERE id = ?", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    
    pub fn get_unsynced_reports(&self) -> Vec<ActivityReport> {
        let mut reports = Vec::new();
        
        if let Ok(conn) = Connection::open(&self.db_path) {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT id, timestamp, dev_id, description, app_name, window_title, activity_type 
                 FROM activity_reports WHERE synced = 0 ORDER BY id LIMIT 50"
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(ActivityReport {
                        id: row.get(0).ok(),
                        timestamp: row.get(1)?,
                        dev_id: row.get(2)?,
                        description: row.get(3)?,
                        app_name: row.get(4).ok(),
                        window_title: row.get(5).ok(),
                        activity_type: row.get(6)?,
                        synced: false,
                    })
                }) {
                    for report in rows.flatten() {
                        reports.push(report);
                    }
                }
            }
        }
        
        reports
    }
    
    pub fn get_recent_reports(&self, limit: u32) -> Vec<ActivityReport> {
        let mut reports = Vec::new();
        
        if let Ok(conn) = Connection::open(&self.db_path) {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT id, timestamp, dev_id, description, app_name, window_title, activity_type, synced 
                 FROM activity_reports ORDER BY id DESC LIMIT ?"
            ) {
                if let Ok(rows) = stmt.query_map([limit], |row| {
                    Ok(ActivityReport {
                        id: row.get(0).ok(),
                        timestamp: row.get(1)?,
                        dev_id: row.get(2)?,
                        description: row.get(3)?,
                        app_name: row.get(4).ok(),
                        window_title: row.get(5).ok(),
                        activity_type: row.get(6)?,
                        synced: row.get::<_, i32>(7).unwrap_or(0) == 1,
                    })
                }) {
                    for report in rows.flatten() {
                        reports.push(report);
                    }
                }
            }
        }
        
        reports
    }

    pub fn get_config(&self) -> AgentConfig {
        self.config.clone()
    }

    pub fn update_config(&mut self, config: AgentConfig) -> AgentConfig {
        self.config = config;
        self.save_config();
        self.config.clone()
    }

    pub fn start_monitoring(&mut self) -> Result<bool, String> {
        self.is_running = true;
        Ok(true)
    }

    pub fn stop_monitoring(&mut self) -> Result<bool, String> {
        self.is_running = false;
        Ok(true)
    }

    pub fn get_status(&self) -> serde_json::Value {
        serde_json::json!({
            "isRunning": self.is_running,
            "reportsSent": self.reports_sent,
            "lastActivity": self.last_activity,
            "devId": self.config.dev_id,
            "devName": self.config.dev_name,
            "isRegistered": self.is_registered,
            "teamId": self.config.team_id
        })
    }

    pub fn increment_reports(&mut self) {
        self.reports_sent += 1;
    }

    pub fn set_last_activity(&mut self, activity: String) {
        self.last_activity = Some(activity);
    }
}

pub fn get_agent() -> FlowSightAgent {
    FlowSightAgent::new()
}

// Capture screenshot and return as base64
fn capture_screen_base64() -> Result<String, String> {
    use screenshots::Screen;
    
    let screens = Screen::all().map_err(|e| e.to_string())?;
    
    if let Some(screen) = screens.first() {
        let image = screen.capture().map_err(|e| e.to_string())?;
        let buffer = image.buffer();
        
        let img = image::load_from_memory(buffer).map_err(|e| e.to_string())?;
        let resized = img.resize(1024, 768, image::imageops::FilterType::Triangle);
        
        let mut png_data = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png_data);
        resized.write_to(&mut cursor, image::ImageFormat::Png).map_err(|e| e.to_string())?;
        
        Ok(BASE64.encode(&png_data))
    } else {
        Err("No screens found".to_string())
    }
}

// Analyze screenshot with LLaVA vision model
fn analyze_screen_with_vision(screenshot_base64: &str, model: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    
    let prompt = "You are analyzing a developer's screen. Describe in 1-2 concise sentences what the developer is currently doing. Be specific about the application, task type (coding, debugging, reading docs, browsing, meeting, etc.), and any visible project or file names. Keep it brief and factual.";
    
    let response = client
        .post("http://localhost:11434/api/generate")
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "images": [screenshot_base64],
            "stream": false,
            "options": {
                "temperature": 0.3,
                "num_predict": 150
            }
        }))
        .send()
        .map_err(|e| format!("Vision model request failed: {}", e))?;
    
    let json: serde_json::Value = response.json().map_err(|e| format!("Parse error: {}", e))?;
    
    json["response"]
        .as_str()
        .map(|s| s.trim().to_string())
        .ok_or_else(|| "No response from vision model".to_string())
}

// Detect activity type from description
fn detect_activity_type(description: &str) -> String {
    let desc_lower = description.to_lowercase();
    
    if desc_lower.contains("code") || desc_lower.contains("programming") || 
       desc_lower.contains("ide") || desc_lower.contains("editor") ||
       desc_lower.contains("visual studio") || desc_lower.contains("vscode") ||
       desc_lower.contains("cursor") || desc_lower.contains("intellij") {
        "coding".to_string()
    } else if desc_lower.contains("browser") || desc_lower.contains("chrome") ||
              desc_lower.contains("firefox") || desc_lower.contains("edge") ||
              desc_lower.contains("safari") {
        "browsing".to_string()
    } else if desc_lower.contains("meeting") || desc_lower.contains("zoom") ||
              desc_lower.contains("teams") || desc_lower.contains("slack") ||
              desc_lower.contains("discord") {
        "meeting".to_string()
    } else if desc_lower.contains("terminal") || desc_lower.contains("command") ||
              desc_lower.contains("powershell") || desc_lower.contains("cmd") ||
              desc_lower.contains("bash") || desc_lower.contains("shell") {
        "terminal".to_string()
    } else if desc_lower.contains("documentation") || desc_lower.contains("reading") ||
              desc_lower.contains("docs") || desc_lower.contains("wiki") {
        "documentation".to_string()
    } else if desc_lower.contains("idle") || desc_lower.contains("desktop") ||
              desc_lower.contains("lock screen") {
        "idle".to_string()
    } else {
        "other".to_string()
    }
}

// ================== TAURI COMMANDS ==================

#[tauri::command]
pub fn initialize_agent(state: State<'_, AgentState>) -> Result<bool, String> {
    let mut agent = state.lock().unwrap();
    *agent = Some(get_agent());
    Ok(true)
}

#[tauri::command]
pub fn get_config(state: State<'_, AgentState>) -> Result<AgentConfig, String> {
    let agent = state.lock().unwrap();
    if let Some(agent) = &*agent {
        Ok(agent.get_config())
    } else {
        Ok(AgentConfig::default())
    }
}

#[tauri::command]
pub fn update_config(state: State<'_, AgentState>, config: AgentConfig) -> Result<AgentConfig, String> {
    let mut agent = state.lock().unwrap();
    if let Some(agent) = &mut *agent {
        Ok(agent.update_config(config))
    } else {
        Err("Agent not initialized".to_string())
    }
}

#[tauri::command]
pub fn start_monitoring(state: State<'_, AgentState>) -> Result<bool, String> {
    let mut agent = state.lock().unwrap();
    if let Some(agent) = &mut *agent {
        agent.start_monitoring()
    } else {
        Err("Agent not initialized".to_string())
    }
}

#[tauri::command]
pub fn stop_monitoring(state: State<'_, AgentState>) -> Result<bool, String> {
    let mut agent = state.lock().unwrap();
    if let Some(agent) = &mut *agent {
        agent.stop_monitoring()
    } else {
        Err("Agent not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_status(state: State<'_, AgentState>) -> Result<serde_json::Value, String> {
    let agent = state.lock().unwrap();
    if let Some(agent) = &*agent {
        Ok(agent.get_status())
    } else {
        Ok(serde_json::json!({
            "isRunning": false,
            "reportsSent": 0,
            "isRegistered": false
        }))
    }
}

// Register developer with API key
#[tauri::command]
pub fn register_with_api_key(
    state: State<'_, AgentState>,
    api_key: String,
    dev_name: String,
) -> Result<RegistrationResult, String> {
    let device_id = format!("{}_{}", whoami::username(), whoami::devicename());
    
    let (pm_url,) = {
        let agent = state.lock().unwrap();
        if let Some(agent) = &*agent {
            (agent.config.pm_dashboard_url.clone().unwrap_or_else(|| "http://localhost:3000".to_string()),)
        } else {
            return Err("Agent not initialized".to_string());
        }
    };
    
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .post(format!("{}/api/developers", pm_url))
        .json(&serde_json::json!({
            "apiKey": api_key,
            "name": dev_name,
            "deviceId": device_id,
        }))
        .send()
        .map_err(|e| format!("Registration failed: {}", e))?;
    
    let result: RegistrationResult = response.json().map_err(|e| format!("Parse error: {}", e))?;
    
    if result.success {
        let mut agent = state.lock().unwrap();
        if let Some(agent) = &mut *agent {
            agent.config.api_key = Some(api_key);
            agent.config.developer_id = result.developer_id.clone();
            agent.config.team_id = result.team_id.clone();
            agent.config.dev_name = Some(dev_name);
            agent.is_registered = true;
            agent.save_config();
        }
    }
    
    Ok(result)
}

// Send report to PM dashboard
fn send_report_to_dashboard(
    pm_url: &str,
    api_key: &str,
    developer_id: &str,
    report: &ActivityReport,
) -> Result<bool, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .post(format!("{}/api/reports", pm_url))
        .json(&serde_json::json!({
            "apiKey": api_key,
            "developerId": developer_id,
            "description": report.description,
            "activityType": report.activity_type,
            "appName": report.app_name,
            "windowTitle": report.window_title,
        }))
        .send()
        .map_err(|e| format!("Failed to send report: {}", e))?;
    
    Ok(response.status().is_success())
}

// Sync unsynced reports to dashboard
#[tauri::command]
pub fn sync_reports(state: State<'_, AgentState>) -> Result<serde_json::Value, String> {
    let (api_key, developer_id, pm_url, unsynced) = {
        let agent = state.lock().unwrap();
        if let Some(agent) = &*agent {
            if !agent.is_registered {
                return Err("Not registered. Please enter your API key first.".to_string());
            }
            (
                agent.config.api_key.clone(),
                agent.config.developer_id.clone(),
                agent.config.pm_dashboard_url.clone(),
                agent.get_unsynced_reports(),
            )
        } else {
            return Err("Agent not initialized".to_string());
        }
    };
    
    let api_key = api_key.ok_or("API key not set")?;
    let developer_id = developer_id.ok_or("Developer ID not set")?;
    let pm_url = pm_url.unwrap_or_else(|| "http://localhost:3000".to_string());
    
    let mut synced_count = 0;
    let mut failed_count = 0;
    
    for report in &unsynced {
        if let Some(id) = report.id {
            match send_report_to_dashboard(&pm_url, &api_key, &developer_id, report) {
                Ok(true) => {
                    let agent = state.lock().unwrap();
                    if let Some(agent) = &*agent {
                        let _ = agent.mark_report_synced(id);
                    }
                    synced_count += 1;
                }
                _ => failed_count += 1,
            }
        }
    }
    
    Ok(serde_json::json!({
        "synced": synced_count,
        "failed": failed_count,
        "pending": failed_count
    }))
}

// Main command: Capture screen, analyze with vision model, save and send report
#[tauri::command]
pub fn capture_and_analyze(state: State<'_, AgentState>) -> Result<ActivityReport, String> {
    let (dev_id, vision_model, api_key, developer_id, pm_url, is_registered) = {
        let agent = state.lock().unwrap();
        if let Some(agent) = &*agent {
            (
                agent.config.dev_id.clone().unwrap_or_else(|| "unknown".to_string()),
                agent.config.vision_model.clone().unwrap_or_else(|| "llava:7b".to_string()),
                agent.config.api_key.clone(),
                agent.config.developer_id.clone(),
                agent.config.pm_dashboard_url.clone().unwrap_or_else(|| "http://localhost:3000".to_string()),
                agent.is_registered,
            )
        } else {
            return Err("Agent not initialized".to_string());
        }
    };
    
    // 1. Capture screenshot
    let screenshot = capture_screen_base64()?;
    
    // 2. Analyze with vision model
    let description = analyze_screen_with_vision(&screenshot, &vision_model)?;
    
    // 3. Detect activity type
    let activity_type = detect_activity_type(&description);
    
    // 4. Create report
    let mut report = ActivityReport {
        id: None,
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        dev_id: dev_id.clone(),
        description: description.clone(),
        app_name: None,
        window_title: None,
        activity_type,
        synced: false,
    };
    
    // 5. Save to local SQLite
    {
        let agent = state.lock().unwrap();
        if let Some(agent) = &*agent {
            if let Ok(id) = agent.save_report(&report) {
                report.id = Some(id);
            }
        }
    }
    
    // 6. Send to PM dashboard if registered
    if is_registered {
        if let (Some(api_key), Some(developer_id)) = (api_key, developer_id) {
            if send_report_to_dashboard(&pm_url, &api_key, &developer_id, &report).is_ok() {
                report.synced = true;
                if let Some(id) = report.id {
                    let agent = state.lock().unwrap();
                    if let Some(agent) = &*agent {
                        let _ = agent.mark_report_synced(id);
                    }
                }
            }
        }
    }
    
    // 7. Update agent stats
    {
        let mut agent = state.lock().unwrap();
        if let Some(agent) = &mut *agent {
            agent.increment_reports();
            agent.set_last_activity(description);
        }
    }
    
    Ok(report)
}

// Get local activity log
#[tauri::command]
pub fn get_activity_log(state: State<'_, AgentState>, limit: Option<u32>) -> Result<Vec<ActivityReport>, String> {
    let agent = state.lock().unwrap();
    if let Some(agent) = &*agent {
        Ok(agent.get_recent_reports(limit.unwrap_or(20)))
    } else {
        Ok(vec![])
    }
}

// Capture screenshot only (for preview)
#[tauri::command]
pub fn capture_screenshot() -> Result<String, String> {
    capture_screen_base64()
}

// Check Ollama and models status
#[tauri::command]
pub fn check_ollama() -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    match client.get("http://localhost:11434/api/tags").send() {
        Ok(response) => {
            if response.status().is_success() {
                let json: serde_json::Value = response.json().unwrap_or(serde_json::json!({}));
                let models = json["models"].as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|m| m["name"].as_str())
                        .map(|s| s.to_string())
                        .collect::<Vec<_>>()
                }).unwrap_or_default();
                
                let has_vision = models.iter().any(|m| m.contains("llava") || m.contains("bakllava"));
                let has_text = models.iter().any(|m| m.contains("phi") || m.contains("llama") || m.contains("mistral"));
                
                Ok(serde_json::json!({
                    "online": true,
                    "models": models,
                    "hasVisionModel": has_vision,
                    "hasTextModel": has_text
                }))
            } else {
                Ok(serde_json::json!({ "online": false }))
            }
        }
        Err(_) => Ok(serde_json::json!({ "online": false }))
    }
}

// Placeholder commands for compatibility
#[tauri::command]
pub fn simulate_event(state: State<'_, AgentState>, _event_type: String) -> Result<serde_json::Value, String> {
    let mut agent = state.lock().unwrap();
    if let Some(agent) = &mut *agent {
        agent.reports_sent += 1;
    }
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn get_blockers() -> Result<Vec<serde_json::Value>, String> { Ok(vec![]) }
#[tauri::command]
pub fn resolve_blocker(_id: String, _action: Option<String>) -> Result<bool, String> { Ok(true) }
#[tauri::command]
pub fn get_blocker_stats() -> Result<serde_json::Value, String> { Ok(serde_json::json!({})) }
#[tauri::command]
pub fn get_recent_events(_limit: Option<u32>) -> Result<Vec<serde_json::Value>, String> { Ok(vec![]) }
#[tauri::command]
pub fn get_session_stats() -> Result<serde_json::Value, String> { Ok(serde_json::json!({})) }
#[tauri::command]
pub fn get_activity_stats() -> Result<serde_json::Value, String> { Ok(serde_json::json!({})) }
#[tauri::command]
pub fn detect_blockers() -> Result<Option<serde_json::Value>, String> { Ok(None) }
#[tauri::command]
pub fn get_status_summary() -> Result<serde_json::Value, String> { Ok(serde_json::json!({"initialized": true})) }
#[tauri::command]
pub fn add_activity_report() -> Result<serde_json::Value, String> { Ok(serde_json::json!({})) }
#[tauri::command]
pub fn analyze_with_text_model(_prompt: String, _model: Option<String>) -> Result<String, String> { 
    Ok("Not implemented".to_string()) 
}
