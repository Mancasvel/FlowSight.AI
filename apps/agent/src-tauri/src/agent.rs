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
                dev_name: Some(whoami::realname()),
                capture_interval: Some(30000),
                vision_model: Some("qwen3-vl:2b".to_string()),
            },
            is_running: false,
            reports_sent: 0,
            db_path,
        };
        
        agent.init_db();
        agent.load_config();
        
        // Start Background Sync (10m interval)
        crate::sync::start_sync_thread(agent.db_path.clone());
        
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
    
    #[allow(dead_code)]
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

// Capture and analyze screen
// (Logic moved to Frontend for cross-platform support)

fn capture_screen() -> Result<(String, std::path::PathBuf), String> {
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
    
    // Use original resolution (No Resizing) to ensure max clarity for OCR
    // let resized = img.resize(1280, 720, image::imageops::FilterType::Lanczos3);
    
    let mut png = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
        
    // println!("[Agent] Captured screenshot size: {} bytes", png.len());
    
    // Persist to tmp for debug (optional)
    let desktop = dirs::desktop_dir().unwrap_or(std::path::PathBuf::from("."));
    let debug_dir = desktop.join("flowsight_screenshots_tmp");
    if !debug_dir.exists() {
        let _ = std::fs::create_dir_all(&debug_dir);
    }
    
    let timestamp = chrono::Local::now().format("%H%M%S");
    let filename = format!("capture_{}.png", timestamp);
    let debug_path = debug_dir.join(filename);
    let _ = std::fs::write(&debug_path, &png);
    
    Ok((BASE64.encode(&png), debug_path))
}

#[derive(Serialize, Clone)]
pub struct CaptureResult {
    path: String,
    base64: String,
}

#[tauri::command]
pub fn capture_screen_command() -> Result<CaptureResult, String> {
    let (base64, path) = capture_screen()?;
    Ok(CaptureResult {
        path: path.to_string_lossy().to_string(),
        base64
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Fingerprint {
    pub vector: Vec<f32>,
    pub dimension: usize,
    pub model: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ContextSnapshot {
    pub vector: Vec<f32>,
    pub dimension: usize,
    pub description: String,
    pub category: String, // NEW
    pub metadata: SnapshotMetadata,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SnapshotMetadata {
    pub task: Option<String>,
    pub file: Option<String>,
    pub app: Option<String>,
    pub branch: Option<String>,
    pub language: Option<String>,
}

#[tauri::command]
pub fn capture_context_snapshot(user_task: Option<String>, jira_ticket: Option<String>) -> Result<ContextSnapshot, String> {
    use crate::context::{get_system_context, get_git_context};
    use std::path::PathBuf;

    // 1. Capture Screen
    let (base64, path_str) = capture_screen()?;
    let path = PathBuf::from(&path_str);

    // 2. Run Qwen2-VL (Visual Description + Category)
    // We now parse "Category: <Name>" from the response
    let raw_analysis = analyze_image_with_qwen(&base64).unwrap_or_else(|_| "Screen analysis failed".to_string());
    
    // Simple heuristic or prompt-based classification
    let (description, category) = parse_analysis(&raw_analysis);

    // 3. System Context (Window/App)
    let sys = get_system_context();
    
    // 4. Git Context (Project)
    let mut git = None;
    if let Some(_title) = &sys.window_title {
        let home = dirs::desktop_dir().unwrap_or(PathBuf::from("."));
        let possible_path = home.join("FlowSight.AI"); 
        if possible_path.exists() {
             git = get_git_context(possible_path.to_str().unwrap());
        }
    }
    if git.is_none() {
        git = get_git_context(".");
    }

    // McLean Config / Cleanup
    // Remove the temp file to protect privacy (as per plan)
    let _ = std::fs::remove_file(&path);

    Ok(ContextSnapshot {
        vector: vec![], // No vectors anymore
        dimension: 0,
        description,
        category,
        metadata: SnapshotMetadata {
            task: jira_ticket.or(user_task),
            file: sys.file_name,
            app: sys.app_name,
            branch: git.and_then(|g| g.branch),
            language: None,
        }
    })
}

// Helper to parse "Category: X" logic
fn parse_analysis(raw: &str) -> (String, String) {
    // This assumes the Prompt asks for "Category: [X]"
    // For now, default to "Unknown" if not found
    // Implementation of parsing logic:
    let mut category = "General".to_string();
    let lower = raw.to_lowercase();
    
    if lower.contains("category: coding") || lower.contains("category: development") { category = "Coding".to_string(); }
    else if lower.contains("category: design") { category = "Design".to_string(); }
    else if lower.contains("category: sales") || lower.contains("crm") { category = "Sales".to_string(); }
    else if lower.contains("category: communication") || lower.contains("slack") { category = "Communication".to_string(); }
    else if lower.contains("category: meeting") { category = "Meeting".to_string(); }
    
    (raw.to_string(), category)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActivityMetadata {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub window_title_hash: Option<String>, // Privacy
}

#[tauri::command]
pub fn get_semantic_fingerprint(image_path: String, _metadata: Option<ActivityMetadata>) -> Result<Fingerprint, String> {
    // Kept for backward compat or direct calls
    use crate::fingerprint::generate_fingerprint;
    use std::path::PathBuf;
    
    let path = PathBuf::from(&image_path);
    if !path.exists() {
        return Err(format!("File not found: {}", image_path));
    }
    
    let result = generate_fingerprint(&path).map_err(|e| e.to_string())?;
    
    Ok(Fingerprint {
        vector: result.vector,
        dimension: result.dimension,
        model: result.model
    })
}

#[tauri::command]
pub fn save_activity(state: State<'_, AgentState>, description: String, activity_type: String) -> Result<ActivityReport, String> {
    let mut agent = state.lock().unwrap();
    let report_id = if let Some(a) = agent.as_mut() {
        a.reports_sent += 1;
        a.save_report(&description, &activity_type)
    } else {
        None
    };
    
    Ok(ActivityReport {
        id: report_id,
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        description,
        activity_type,
        synced: false,
    })
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
            "reportsSent": a.reports_sent
        })
    } else {
        serde_json::json!({"isRunning": false, "reportsSent": 0})
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
            
            // Allow llava, moondream, OR qwen (assumed to be VL if selected, or just qwen2-vl explicitly)
            let has_vision = models.iter().any(|m| m.contains("llava") || m.contains("moondream") || m.contains("qwen"));
            
            Ok(serde_json::json!({"online": true, "models": models, "hasVisionModel": has_vision}))
        }
        _ => Ok(serde_json::json!({"online": false}))
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

// RESTORED AI ANALYSIS (Backend)
#[tauri::command]

fn analyze_image_with_qwen(base64_img: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    // Updated Generalist Prompt
    let prompt = "Describe the screen content. Then, explicitly classify the activity into exactly one of these Categories: Coding, Design, Sales, Communication, Meeting, Browsing, Other.
    
    Format:
    Description: <summary>
    Category: <Category>";
    
    let body = serde_json::json!({
        "model": "qwen3-vl:2b",
        "prompt": prompt,
        "images": [base64_img],
        "stream": false,
        "options": {
            "temperature": 0.1,
            "num_predict": 100
        }
    });
    
    let resp = client.post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .map_err(|e| format!("Ollama request failed: {}", e))?;
        
    if !resp.status().is_success() {
        return Err(format!("Ollama Error: {}", resp.status()));
    }
    
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    Ok(json["response"].as_str().unwrap_or("No response").to_string())
}
