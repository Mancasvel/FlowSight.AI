use crate::agent_pure::parse_analysis;
use crate::vision_model::{
    CONFIG_VISION_MODEL_ID, LLAMA_CHAT_MODEL_ID, VISION_GGUF_FILENAME, VISION_MMPROJ_FILENAME,
    VISION_STATUS_LABEL,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::State;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::Local;
use rusqlite::{Connection, params};
use std::io::Write;

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
    #[serde(rename = "gpuLayers")]
    pub gpu_layers: Option<i32>,
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
                capture_interval: Some(60000),
                vision_model: Some(CONFIG_VISION_MODEL_ID.to_string()),
                gpu_layers: Some(16), // Default to Balanced Mode
            },
            is_running: false,
            reports_sent: 0,
            db_path,
        };
        
        agent.init_db();
        agent.load_config();
        
        // Start Background Sync (10m interval)
        crate::sync::start_sync_thread(agent.db_path.clone());
        // Proactive Supabase JWT refresh (~every 2m when near expiry)
        crate::sync::start_token_refresh_thread(agent.db_path.clone());
        
        agent
    }
    
    fn init_db(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            // Base table
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
            
            // Migrations (Add missing columns if they don't exist)
            // SQLite is forgiving with duplicate add column if we handle error or check first.
            // Simplest way: Try to add, ignore error.
            let _ = conn.execute("ALTER TABLE reports ADD COLUMN jira_ticket_id TEXT", []);
            let _ = conn.execute("ALTER TABLE reports ADD COLUMN duration_seconds INTEGER DEFAULT 30", []);
            // Rename activity_type to category? No, sync.rs maps it manually or we fix sync.rs. 
            // NOTE: sync.rs selects "category" but schema has "activity_type". 
            // We should ensure sync.rs uses correct column name or we rename here.
            // Let's assume sync.rs needs "activity_type" aliased as category or we just add category column?
            // Better: Let's stick to activity_type in DB and fix sync.rs query.
        }
    }
    
    fn load_config(&mut self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            // Load String configs
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
            
            // Load Integer configs (gpu_layers)
            if let Ok(val) = conn.query_row::<String, _, _>(
                "SELECT value FROM config WHERE key = 'gpu_layers'", [], |r| r.get(0)
            ) {
                if let Ok(parsed) = val.parse::<i32>() {
                    self.config.gpu_layers = Some(parsed);
                }
            }
        }
    }
    
    fn save_config(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            // Save String configs
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
            
            // Save Integer configs
            if let Some(layers) = self.config.gpu_layers {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                    params!["gpu_layers", layers.to_string()]
                );
            }
        }
    }
    
    fn save_report(&self, desc: &str, activity_type: &str, ticket: Option<String>, duration: u64) -> Option<i64> {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute(
                "INSERT INTO reports (description, activity_type, jira_ticket_id, duration_seconds) VALUES (?, ?, ?, ?)",
                params![desc, activity_type, ticket, duration]
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
    
    let img = img.resize(960, 540, image::imageops::FilterType::Lanczos3);

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
pub async fn capture_context_snapshot(
    state: State<'_, AgentState>,
    user_task: Option<String>, 
    jira_ticket: Option<String>
) -> Result<ContextSnapshot, String> {
    
    // Extract config (default to 16 if not set to ensure balanced load)
    let gpu_layers = {
        let guard = state.lock().unwrap();
        guard.as_ref()
            .and_then(|a| a.config.gpu_layers)
            .or(Some(16)) 
    };

    // Run ALL heavy work on a background thread to avoid blocking the main/UI thread
    tauri::async_runtime::spawn_blocking(move || {
        use crate::context::{get_system_context, get_git_context};
        use std::path::PathBuf;

        // 1. Capture Screen
        let (base64, path_str) = capture_screen()?;
        let path = PathBuf::from(&path_str);

        // 2. Local vision analysis (visual description + category)
        let task_context = jira_ticket.clone().or(user_task.clone()).unwrap_or_else(|| "General".to_string());
        
        let raw_analysis = match analyze_image_with_vision(&base64, &task_context, gpu_layers) {
            Ok(res) => res,
            Err(e) => {
                let err_msg = format!("[Agent] AI Analysis Failed: {}", e);
                println!("{}", err_msg);
                
                // Log to file for debugging (Current Dir)
                if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open("agent_error.log") {
                    let _ = writeln!(file, "{}", err_msg);
                }
                
                "Screen analysis failed. Category: General".to_string()
            }
        };
        
        // Parse category from response
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

        // Cleanup temp file
        let _ = std::fs::remove_file(&path);

        Ok(ContextSnapshot {
            vector: vec![],
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
    }).await.map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn save_activity(state: State<'_, AgentState>, description: String, activity_type: String, jira_ticket: Option<String>) -> Result<ActivityReport, String> {
    let mut agent = state.lock().unwrap();
    let report_id = if let Some(a) = agent.as_mut() {
        a.reports_sent += 1;
        // Default capture interval 30s
        a.save_report(&description, &activity_type, jira_ticket, 30)
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

#[derive(Serialize, Deserialize, Debug)]
pub struct DayHistoryEntry {
    pub time: String,
    pub description: String,
    pub category: String,
    pub ticket: Option<String>,
    pub duration_seconds: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CategoryBreakdown {
    pub category: String,
    pub total_seconds: i32,
    pub count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TicketBreakdown {
    pub ticket: String,
    pub total_seconds: i32,
    pub count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TodayHistory {
    pub entries: Vec<DayHistoryEntry>,
    pub total_seconds: i32,
    pub category_breakdown: Vec<CategoryBreakdown>,
    pub ticket_breakdown: Vec<TicketBreakdown>,
    pub date: String,
}

#[tauri::command]
pub fn get_today_history(state: State<'_, AgentState>) -> Result<TodayHistory, String> {
    let agent = state.lock().unwrap();
    let agent = agent.as_ref().ok_or("Agent not initialized")?;
    
    let conn = Connection::open(&agent.db_path).map_err(|e| e.to_string())?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    
    // Get all entries for today
    let mut stmt = conn.prepare(
        "SELECT created_at, description, activity_type, jira_ticket_id, duration_seconds 
         FROM reports 
         WHERE date(created_at) = date('now', 'localtime')
         ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let entries: Vec<DayHistoryEntry> = stmt.query_map([], |row| {
        Ok(DayHistoryEntry {
            time: row.get::<_, String>(0).unwrap_or_default(),
            description: row.get::<_, String>(1).unwrap_or_default(),
            category: row.get::<_, String>(2).unwrap_or_default(),
            ticket: row.get::<_, Option<String>>(3).unwrap_or(None),
            duration_seconds: row.get::<_, i32>(4).unwrap_or(30),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    
    // Calculate total
    let total_seconds: i32 = entries.iter().map(|e| e.duration_seconds).sum();
    
    // Category breakdown
    let mut cat_map: std::collections::HashMap<String, (i32, i32)> = std::collections::HashMap::new();
    for e in &entries {
        let entry = cat_map.entry(e.category.clone()).or_insert((0, 0));
        entry.0 += e.duration_seconds;
        entry.1 += 1;
    }
    let category_breakdown: Vec<CategoryBreakdown> = cat_map.into_iter()
        .map(|(category, (total_seconds, count))| CategoryBreakdown { category, total_seconds, count })
        .collect();
    
    // Ticket breakdown
    let mut ticket_map: std::collections::HashMap<String, (i32, i32)> = std::collections::HashMap::new();
    for e in &entries {
        if let Some(ref ticket) = e.ticket {
            let entry = ticket_map.entry(ticket.clone()).or_insert((0, 0));
            entry.0 += e.duration_seconds;
            entry.1 += 1;
        }
    }
    let ticket_breakdown: Vec<TicketBreakdown> = ticket_map.into_iter()
        .map(|(ticket, (total_seconds, count))| TicketBreakdown { ticket, total_seconds, count })
        .collect();
    
    Ok(TodayHistory {
        entries,
        total_seconds,
        category_breakdown,
        ticket_breakdown,
        date: today,
    })
}

fn get_ollama_bin() -> String {
    use std::process::Command;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    
    // 1. Try plain "ollama" (if in PATH)
    let mut which_cmd = Command::new(if cfg!(windows) { "where" } else { "which" });
    which_cmd.arg("ollama");
    #[cfg(windows)]
    which_cmd.creation_flags(CREATE_NO_WINDOW);
    if let Ok(o) = which_cmd.output() {
        if o.status.success() {
            return "ollama".to_string();
        }
    }

    // 2. Common Windows paths if not in PATH
    if cfg!(windows) {
        let mut paths = Vec::new();
        
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            paths.push(format!(r"{}\Programs\Ollama\ollama.exe", local_app_data));
        }
        
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            paths.push(format!(r"{}\AppData\Local\Programs\Ollama\ollama.exe", user_profile));
        }

        paths.push(r"C:\Program Files\Ollama\ollama.exe".to_string());
        paths.push(r"C:\Users\manue\AppData\Local\Programs\Ollama\ollama.exe".to_string()); // Hardcoded as fallback since we saw it there

        for p in paths {
            if std::path::Path::new(&p).exists() {
                println!("[Ollama] Found binary at: {}", p);
                return p;
            }
        }
    }

    println!("[Ollama] Using fallback 'ollama' command");
    "ollama".to_string()
}

#[tauri::command]
pub fn check_ollama() -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(1))
        .build().map_err(|e| e.to_string())?;
    
    // llama-server local health check (workflow compatibility)
    match client.get("http://localhost:8080/health").send() {
        Ok(r) if r.status().is_success() => Ok(serde_json::json!({
            "online": true,
            "installed": true,
            "models": [VISION_STATUS_LABEL],
            "hasVisionModel": true
        })),
        Ok(r) => Ok(serde_json::json!({
            "online": false,
            "installed": true,
            "error": format!("Local server status: {}", r.status())
        })),
        Err(_) => Ok(serde_json::json!({
            "online": false,
            "installed": true
        })),
    }
}

#[tauri::command]
pub fn install_ollama() -> Result<serde_json::Value, String> {
    use std::process::Command;
    
    if cfg!(windows) {
        // Use winget for silent install
        let output = Command::new("winget")
            .args(["install", "Ollama.Ollama", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
            .output()
            .map_err(|e| format!("Failed to run winget: {}", e))?;
        
        if output.status.success() {
            Ok(serde_json::json!({"success": true, "message": "Ollama installed successfully"}))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Winget failed: {}", stderr))
        }
    } else {
        // For non-windows, still open the link (manual)
        let url = "https://ollama.ai/download";
        let _ = if cfg!(target_os = "macos") {
            Command::new("open").arg(url).spawn()
        } else {
            Command::new("xdg-open").arg(url).spawn()
        };
        Ok(serde_json::json!({
            "success": false, 
            "message": "Manual installation required on this OS. Opening download page."
        }))
    }
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
}

#[tauri::command]
pub async fn pull_model(window: tauri::Window, model: String) -> Result<serde_json::Value, String> {
    use tauri::Emitter;
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    let ollama_bin = get_ollama_bin();
    let mut child = Command::new(&ollama_bin)
        .args(["pull", &model])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ollama ({}): {}", ollama_bin, e))?;

    let mut stderr_content = String::new();
    let stderr = child.stderr.take().unwrap();
    let reader = BufReader::new(stderr);

    for line in reader.lines() {
        if let Ok(l) = line {
            stderr_content.push_str(&l);
            stderr_content.push('\n');
            // Ollama prints progress to stderr. It's not stable JSON, but we can try to emit it as text
            let _ = window.emit("ollama-progress", ProgressPayload {
                status: l.clone(),
                completed: None,
                total: None,
            });
        }
    }

    let status = child.wait().map_err(|e| format!("Ollama failed: {}", e))?;
    
    if status.success() {
        Ok(serde_json::json!({"success": true, "model": model}))
    } else {
        Err(format!("Failed to pull model: {}", stderr_content))
    }
}

#[tauri::command]
pub fn start_ollama() -> Result<serde_json::Value, String> {
    use std::process::Command;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    
    let ollama_bin = get_ollama_bin();
    
    // Try to start Ollama in background
    let mut cmd = Command::new(&ollama_bin);
    cmd.arg("serve");
    
    // FORCE CPU MODE for testing low-end hardware
    // This makes Ollama ignore the GPU and run in system RAM
    // cmd.env("OLLAMA_NUM_GPU", "0");
    // println!("[Ollama] Starting in CPU-ONLY mode (OLLAMA_NUM_GPU=0)");
    
    // Ensure no window on Windows
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    match cmd.spawn() {
        Ok(_) => Ok(serde_json::json!({"started": true})),
        Err(e) => Err(format!("Failed to start Ollama ({}): {}", ollama_bin, e))
    }
}

// LLAMA SERVER COMMANDS

static SERVER_PROCESS: Mutex<Option<std::process::Child>> = Mutex::new(None);

fn find_project_root() -> Result<PathBuf, String> {
    let check = |dir: &std::path::Path| dir.join("local_llm").join("bin").exists();

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().unwrap_or(std::path::Path::new(".")).to_path_buf();
        for _ in 0..6 {
            if check(&dir) { return Ok(dir); }
            if !dir.pop() { break; }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = cwd;
        for _ in 0..4 {
            if check(&dir) { return Ok(dir); }
            if !dir.pop() { break; }
        }
    }

    let fallback = PathBuf::from(r"C:\Users\manue\FlowSight.AI");
    if check(&fallback) { return Ok(fallback); }

    Err("Could not find project root (local_llm/bin not found). Run setup_llm.py first.".to_string())
}

#[tauri::command]
pub fn start_server() -> Result<serde_json::Value, String> {
    let mut guard = SERVER_PROCESS.lock().unwrap();
    if guard.is_some() {
        return Ok(serde_json::json!({"status": "already_running", "message": "Server is already running"}));
    }

    let root = find_project_root()?;
    let local_llm_dir = root.join("local_llm");
    let bin_path = local_llm_dir.join("bin").join("llama-server.exe");
    let model_path = local_llm_dir.join(VISION_GGUF_FILENAME);
    let mmproj_path = local_llm_dir.join(VISION_MMPROJ_FILENAME);

    if !bin_path.exists() {
        return Err(format!("llama-server not found at {:?}. Run setup_llm.py first.", bin_path));
    }
    if !model_path.exists() {
        return Err(format!("Model not found at {:?}. Run setup_llm.py first.", model_path));
    }
    if !mmproj_path.exists() {
        return Err(format!("Vision projector not found at {:?}. Run setup_llm.py first.", mmproj_path));
    }

    use std::process::Command;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const BELOW_NORMAL_PRIORITY: u32 = 0x00004000;

    let mut cmd = Command::new(&bin_path);
    cmd.arg("-m").arg(&model_path)
       .arg("--mmproj").arg(&mmproj_path)
       .arg("--port").arg("8080")
       .arg("--ctx-size").arg("4096")
       .arg("--parallel").arg("2")
       .arg("--threads").arg("2")
       .arg("--n-gpu-layers").arg("50");

    if let Some(parent) = bin_path.parent() {
        cmd.current_dir(parent);
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY);

    let log_path = root.join("apps").join("agent").join("src-tauri").join("server.log");
    if let Ok(file) = std::fs::File::create(&log_path) {
        if let Ok(file_err) = file.try_clone() {
            cmd.stdout(std::process::Stdio::from(file));
            cmd.stderr(std::process::Stdio::from(file_err));
        }
    }

    match cmd.spawn() {
        Ok(mut child) => {
            std::thread::sleep(std::time::Duration::from_secs(2));
            if let Ok(Some(status)) = child.try_wait() {
                let log_tail = std::fs::read_to_string(&log_path)
                    .ok()
                    .map(|s| s.chars().rev().take(1200).collect::<String>().chars().rev().collect::<String>())
                    .unwrap_or_default();
                return Err(format!(
                    "llama-server exited during startup (code: {:?}). {}",
                    status.code(),
                    if log_tail.is_empty() { "See apps/agent/src-tauri/server.log".to_string() } else { format!("Log tail: {}", log_tail) }
                ));
            }

            *guard = Some(child);
            Ok(serde_json::json!({
                "status": "started",
                "pid": "managed",
                "model": VISION_STATUS_LABEL
            }))
        },
        Err(e) => Err(format!("Failed to start server: {}", e))
    }
}

#[tauri::command]
pub fn stop_server() -> Result<bool, String> {
    let mut guard = SERVER_PROCESS.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        return Ok(true);
    }

    use std::process::Command;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill").args(["/F", "/IM", "llama-server.exe"]).creation_flags(0x08000000).output();
    }

    Ok(true)
}

fn truncate_repetition(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() < 10 { return text.to_string(); }

    let mut result: Vec<&str> = Vec::with_capacity(words.len());
    let mut repeat_count = 0u32;

    for (i, word) in words.iter().enumerate() {
        if i > 0 && *word == words[i - 1] {
            repeat_count += 1;
            if repeat_count >= 4 { continue; }
        } else {
            repeat_count = 0;
        }
        result.push(word);
    }

    if result.len() < words.len() {
        println!("[Vision] Truncated {} repeated tokens from output", words.len() - result.len());
    }
    result.join(" ")
}

// RESTORED AI ANALYSIS (Backend)
#[tauri::command]
fn analyze_image_with_vision(base64_img: &str, current_task: &str, _gpu_layers: Option<i32>) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let url = "http://localhost:8080/v1/chat/completions";

    let system_msg = "You are a screenshot analysis assistant. You ALWAYS respond with a filled-in template. You NEVER refuse. You NEVER say you cannot see the image. You describe exactly what you observe in the screenshot.";

    let prompt = format!(
        r#"Look at this screenshot carefully and fill in EVERY field below. Do NOT skip any field. Do NOT use markdown. Write plain text only.

TASK CONTEXT: {}

Fill in this template exactly:

APP: [name of the application visible, e.g. Visual Studio Code, Chrome, Terminal]
WINDOW TITLE: [exact window title visible in the title bar]
VISIBLE CONTENT: [describe what is shown on screen in 2-3 sentences: files open, tabs, panels, text, UI elements]
FILES OR URLS: [list any file names, URLs, or document names visible, or write None if not readable]
CURRENT ACTION: [what the user appears to be doing right now in 1-2 sentences]
PROGRESS: [any errors, warnings, build status, test results visible, or write None visible]
NEXT STEP: [what the user will likely do next based on what is visible, in 1 sentence]
CATEGORY: [pick exactly ONE from: Coding, Debugging, CodeReview, Testing, Documentation, Design, Planning, Meeting, Communication, Research, Learning, DevOps, Database, Sales, Admin, Browsing, Idle, General]"#,
        current_task
    );

    // Retry up to 2 times on empty/refusal responses
    let max_attempts = 2;
    for attempt in 1..=max_attempts {
        let body = serde_json::json!({
            "model": LLAMA_CHAT_MODEL_ID,
            "messages": [
                {
                    "role": "system",
                    "content": system_msg
                },
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": prompt },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/png;base64,{}", base64_img)
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.1,
            "top_p": 0.9,
            "max_tokens": 800,
            "repeat_penalty": 1.3,
            "frequency_penalty": 0.5,
            "presence_penalty": 0.5,
            "stream": false
        });

        let resp = client.post(url)
            .json(&body)
            .send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Server Error: {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").trim();

        // Detect empty or refusal responses
        let is_empty = content.is_empty();
        let is_refusal = content.to_lowercase().contains("i'm unable to")
            || content.to_lowercase().contains("i cannot")
            || content.to_lowercase().contains("i am unable")
            || content.to_lowercase().contains("unable to view")
            || content.to_lowercase().contains("unable to analyze");

        if is_empty || is_refusal {
            println!("[Vision] Attempt {}/{}: empty or refusal response, retrying...", attempt, max_attempts);
            if attempt < max_attempts {
                std::thread::sleep(std::time::Duration::from_secs(1));
                continue;
            }
            if is_empty {
                return Err("Model returned empty response after retries".to_string());
            }
        }

        let content = truncate_repetition(content);
        return Ok(content);
    }

    Err("Model analysis failed after retries".to_string())
}

#[cfg(test)]
mod agent_struct_tests {
    use super::*;

    #[test]
    fn agent_config_json_roundtrip() {
        let c = AgentConfig {
            dev_name: Some("Tester".into()),
            capture_interval: Some(42_000),
            vision_model: Some("model-id".into()),
            gpu_layers: Some(4),
        };
        let json = serde_json::to_string(&c).unwrap();
        let back: AgentConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.dev_name, c.dev_name);
        assert_eq!(back.gpu_layers, c.gpu_layers);
    }

    #[test]
    fn activity_report_serializes() {
        let r = ActivityReport {
            id: Some(1),
            timestamp: "t".into(),
            description: "d".into(),
            activity_type: "coding".into(),
            synced: false,
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["activity_type"], "coding");
    }
}

#[cfg(test)]
mod repetition_tests {
    use super::truncate_repetition;

    #[test]
    fn truncate_short_text_noop() {
        let s = "a b c d e f g h i";
        assert_eq!(truncate_repetition(s), s);
    }

    #[test]
    fn truncate_collapses_many_repeated_words() {
        let spam: String = std::iter::repeat("spam ").take(25).collect();
        let out = truncate_repetition(spam.trim());
        assert!(out.len() < spam.len());
    }
}
