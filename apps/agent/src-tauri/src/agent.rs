use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::State;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::Local;
use rusqlite::{Connection, params};

pub type AgentState = Mutex<Option<FlowSightAgent>>;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActivityReport {
    pub id: Option<i64>,
    pub timestamp: String,
    pub description: String,
    pub activity_type: String,
    pub synced: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AgentConfig {
    #[serde(rename = "pmUrl")]
    pub pm_url: Option<String>,
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "devName")]
    pub dev_name: Option<String>,
    #[serde(rename = "captureInterval")]
    pub capture_interval: Option<u64>,
    #[serde(rename = "visionModel")]
    pub vision_model: Option<String>,
}

pub struct FlowSightAgent {
    pub config: AgentConfig,
    pub is_running: bool,
    pub reports_sent: u32,
    pub db_path: PathBuf,
}

impl Default for FlowSightAgent {
    fn default() -> Self { Self::new() }
}

impl FlowSightAgent {
    pub fn new() -> Self {
        let db_path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("FlowSight")
            .join("dev-agent.db");
        
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        let mut agent = Self {
            config: AgentConfig {
                pm_url: Some("http://localhost:8080".to_string()),
                api_key: None,
                dev_name: whoami::realname().ok(),
                capture_interval: Some(10000),
                vision_model: Some("moondream".to_string()),
            },
            is_running: false,
            reports_sent: 0,
            db_path,
        };
        
        agent.init_db();
        agent.load_config();
        agent
    }
    
    fn init_db(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
                 CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY,
                    description TEXT,
                    activity_type TEXT,
                    synced INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                 );"
            );
        }
    }
    
    fn load_config(&mut self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            for (key, field) in [
                ("pm_url", &mut self.config.pm_url),
                ("api_key", &mut self.config.api_key),
                ("dev_name", &mut self.config.dev_name),
                ("vision_model", &mut self.config.vision_model),
            ] {
                if let Ok(val) = conn.query_row::<String, _, _>(
                    "SELECT value FROM config WHERE key = ?", [key], |r| r.get(0)
                ) {
                    *field = Some(val);
                }
            }
        }
    }
    
    fn save_config(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            for (key, val) in [
                ("pm_url", &self.config.pm_url),
                ("api_key", &self.config.api_key),
                ("dev_name", &self.config.dev_name),
                ("vision_model", &self.config.vision_model),
            ] {
                if let Some(v) = val {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                        params![key, v]
                    );
                }
            }
        }
    }
    
    fn save_report(&self, desc: &str, activity_type: &str) -> Option<i64> {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute(
                "INSERT INTO reports (description, activity_type) VALUES (?, ?)",
                params![desc, activity_type]
            );
            return Some(conn.last_insert_rowid());
        }
        None
    }
    
    fn mark_synced(&self, id: i64) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute("UPDATE reports SET synced = 1 WHERE id = ?", [id]);
        }
    }
    
    fn get_recent(&self, limit: u32) -> Vec<ActivityReport> {
        let mut reports = Vec::new();
        if let Ok(conn) = Connection::open(&self.db_path) {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT id, description, activity_type, synced, created_at FROM reports ORDER BY id DESC LIMIT ?"
            ) {
                if let Ok(rows) = stmt.query_map([limit], |row| {
                    Ok(ActivityReport {
                        id: row.get(0).ok(),
                        description: row.get(1)?,
                        activity_type: row.get(2)?,
                        synced: row.get::<_, i32>(3).unwrap_or(0) == 1,
                        timestamp: row.get(4)?,
                    })
                }) {
                    for row_result in rows {
                        if let Ok(report) = row_result {
                            reports.push(report);
                        }
                    }
                }
            }
        }
        reports
    }
}

// Send report to PM Dashboard
fn send_to_pm(pm_url: &str, api_key: &str, dev_name: &str, desc: &str, activity_type: &str) -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build() {
        Ok(c) => c,
        Err(_) => return false,
    };
    
    let url = format!("{}/api/report", pm_url.trim_end_matches('/'));
    
    client.post(&url)
        .header("X-API-Key", api_key)
        .header("Content-Type", "application/json")
        .body(serde_json::json!({
            "developer_name": dev_name,
            "device_id": whoami::devicename().unwrap_or_else(|_| "unknown".to_string()),
            "description": desc,
            "activity_type": activity_type
        }).to_string())
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

// Capture and analyze screen
fn capture_screen() -> Result<String, String> {
    use screenshots::Screen;
    
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.first().ok_or("No screen")?;
    let captured = screen.capture().map_err(|e| e.to_string())?;
    
    // Convert to DynamicImage
    let (width, height) = captured.dimensions();
    let img = image::DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(width, height, captured.into_raw())
            .ok_or("Failed to create image")?
    );
    
    let resized = img.resize(1024, 768, image::imageops::FilterType::Triangle);
    
    let mut png = Vec::new();
    resized.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    
    Ok(BASE64.encode(&png))
}

fn analyze_with_llava(screenshot: &str, model: &str, current_task: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build().map_err(|e| e.to_string())?;

    // Highly specific prompt for moondream/expert analysis
    let prompt = format!(
        "The developer states they are working on: '{}'. 
        Analyze the screen in high technical detail to verify this.
        If code is visible, extract:
        1. The Programming Language.
        2. The specific Class/Function/Component name being edited.
        3. The logic/algorithm being implemented.
        
        If a browser/tool is visible, describe exactly what is being viewed (e.g., 'StackOverflow - Rust Mutex', 'Jira Ticket PROJ-123').
        
        Output format: '[Task Status] | [Context] | [Details]' 
        Example: 'Aligned | Rust - AuthController | Implementing login verification logic'", 
        current_task
    );
    
    let response = client.post("http://localhost:11434/api/generate")
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "images": [screenshot],
            "stream": false,
            "options": { "temperature": 0.1, "num_predict": 150 } 
        }))
        .send().map_err(|e| e.to_string())?;
    
    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    json["response"].as_str().map(|s| s.trim().to_string())
        .ok_or_else(|| "No response".to_string())
}

fn detect_type(desc: &str) -> String {
    let d = desc.to_lowercase();
    if d.contains("code") || d.contains("ide") || d.contains("editor") || d.contains("rust") || d.contains("html") || d.contains("function") { "coding" }
    else if d.contains("browser") || d.contains("chrome") || d.contains("firefox") || d.contains("http") { "browsing" }
    else if d.contains("meeting") || d.contains("zoom") || d.contains("teams") { "meeting" }
    else if d.contains("terminal") || d.contains("command") || d.contains("powershell") { "terminal" }
    else { "other" }.to_string()
}

// ============== TAURI COMMANDS ==============

#[tauri::command]
pub fn initialize_agent(state: State<'_, AgentState>) -> Result<bool, String> {
    *state.lock().unwrap() = Some(FlowSightAgent::new());
    Ok(true)
}

#[tauri::command]
pub fn get_config(state: State<'_, AgentState>) -> Result<AgentConfig, String> {
    Ok(state.lock().unwrap().as_ref().map(|a| a.config.clone()).unwrap_or_default())
}

#[tauri::command]
pub fn update_config(state: State<'_, AgentState>, config: AgentConfig) -> Result<bool, String> {
    if let Some(agent) = state.lock().unwrap().as_mut() {
        agent.config = config;
        agent.save_config();
    }
    Ok(true)
}

#[tauri::command]
pub fn get_status(state: State<'_, AgentState>) -> Result<serde_json::Value, String> {
    let agent = state.lock().unwrap();
    Ok(if let Some(a) = agent.as_ref() {
        serde_json::json!({
            "isRunning": a.is_running,
            "reportsSent": a.reports_sent,
            "isConnected": a.config.api_key.is_some()
        })
    } else {
        serde_json::json!({"isRunning": false, "reportsSent": 0, "isConnected": false})
    })
}

#[tauri::command]
pub fn start_monitoring(state: State<'_, AgentState>) -> Result<bool, String> {
    if let Some(a) = state.lock().unwrap().as_mut() { a.is_running = true; }
    Ok(true)
}

#[tauri::command]
pub fn stop_monitoring(state: State<'_, AgentState>) -> Result<bool, String> {
    if let Some(a) = state.lock().unwrap().as_mut() { a.is_running = false; }
    Ok(true)
}

#[tauri::command]
pub fn capture_and_analyze(state: State<'_, AgentState>, current_task: Option<String>) -> Result<ActivityReport, String> {
    let (pm_url, api_key, dev_name, model) = {
        let agent = state.lock().unwrap();
        let a = agent.as_ref().ok_or("Not initialized")?;
        (
            a.config.pm_url.clone().unwrap_or_default(),
            a.config.api_key.clone().unwrap_or_default(),
            a.config.dev_name.clone().unwrap_or_else(|| "Dev".to_string()),
            a.config.vision_model.clone().unwrap_or_else(|| "moondream".to_string()),
        )
    };
    
    let task_context = current_task.unwrap_or_else(|| "General Work".to_string());
    
    let screenshot = capture_screen()?;
    let description = analyze_with_llava(&screenshot, &model, &task_context)?;
    let activity_type = detect_type(&description);
    
    let mut synced = false;
    let mut report_id = None;
    
    // Save locally
    {
        let agent = state.lock().unwrap();
        if let Some(a) = agent.as_ref() {
            report_id = a.save_report(&description, &activity_type);
        }
    }
    
    // Send to PM
    if !api_key.is_empty() && !pm_url.is_empty() {
        synced = send_to_pm(&pm_url, &api_key, &dev_name, &description, &activity_type);
        if synced {
            if let Some(id) = report_id {
                let agent = state.lock().unwrap();
                if let Some(a) = agent.as_ref() {
                    a.mark_synced(id);
                }
            }
        }
    }
    
    // Update stats
    {
        let mut agent = state.lock().unwrap();
        if let Some(a) = agent.as_mut() {
            a.reports_sent += 1;
        }
    }
    
    Ok(ActivityReport {
        id: report_id,
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        description,
        activity_type,
        synced,
    })
}

#[tauri::command]
pub fn get_activity_log(state: State<'_, AgentState>, limit: Option<u32>) -> Result<Vec<ActivityReport>, String> {
    Ok(state.lock().unwrap().as_ref().map(|a| a.get_recent(limit.unwrap_or(20))).unwrap_or_default())
}

#[tauri::command]
pub fn check_ollama() -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build().map_err(|e| e.to_string())?;
    
    match client.get("http://localhost:11434/api/tags").send() {
        Ok(r) if r.status().is_success() => {
            let json: serde_json::Value = r.json().unwrap_or_default();
            let models: Vec<String> = json["models"].as_array()
                .map(|arr| arr.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect())
                .unwrap_or_default();
            let has_vision = models.iter().any(|m| m.contains("llava"));
            Ok(serde_json::json!({"online": true, "models": models, "hasVisionModel": has_vision}))
        }
        _ => Ok(serde_json::json!({"online": false}))
    }
}

#[tauri::command]
pub fn test_pm_connection(state: State<'_, AgentState>) -> Result<serde_json::Value, String> {
    let (pm_url, _api_key) = {
        let agent = state.lock().unwrap();
        let a = agent.as_ref().ok_or("Not initialized")?;
        (a.config.pm_url.clone().unwrap_or_default(), a.config.api_key.clone().unwrap_or_default())
    };
    
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build().map_err(|e| e.to_string())?;
    
    let url = format!("{}/health", pm_url.trim_end_matches('/'));
    match client.get(&url).send() {
        Ok(r) if r.status().is_success() => Ok(serde_json::json!({"connected": true, "url": pm_url})),
        _ => Ok(serde_json::json!({"connected": false, "url": pm_url}))
    }
}

#[tauri::command]
pub fn install_ollama() -> Result<serde_json::Value, String> {
    use std::process::Command;
    
    // Check if Ollama is already installed
    let check = if cfg!(windows) {
        Command::new("where").arg("ollama").output()
    } else {
        Command::new("which").arg("ollama").output()
    };
    
    if let Ok(output) = check {
        if output.status.success() {
            return Ok(serde_json::json!({"installed": true, "message": "Ollama already installed"}));
        }
    }
    
    // Open download page (safest cross-platform approach)
    let url = "https://ollama.ai/download";
    let _ = if cfg!(windows) {
        Command::new("cmd").args(["/c", "start", url]).spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(url).spawn()
    } else {
        Command::new("xdg-open").arg(url).spawn()
    };
    
    Ok(serde_json::json!({
        "installed": false, 
        "message": "Opening Ollama download page. Please install and restart."
    }))
}

#[tauri::command]
pub fn pull_model(model: String) -> Result<serde_json::Value, String> {
    use std::process::Command;
    
    let output = Command::new("ollama")
        .args(["pull", &model])
        .output()
        .map_err(|e| format!("Failed to run ollama: {}", e))?;
    
    if output.status.success() {
        Ok(serde_json::json!({"success": true, "model": model}))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to pull {}: {}", model, stderr))
    }
}

#[tauri::command]
pub fn start_ollama() -> Result<serde_json::Value, String> {
    use std::process::Command;
    
    // Try to start Ollama in background
    let result = if cfg!(windows) {
        Command::new("cmd")
            .args(["/c", "start", "/b", "ollama", "serve"])
            .spawn()
    } else {
        Command::new("ollama")
            .arg("serve")
            .spawn()
    };
    
    match result {
        Ok(_) => Ok(serde_json::json!({"started": true})),
        Err(e) => Err(format!("Failed to start Ollama: {}", e))
    }
}
