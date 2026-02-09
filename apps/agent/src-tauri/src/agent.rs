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
                capture_interval: Some(60000),
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
    // Pass task context to the analysis
    let task_context = jira_ticket.clone().or(user_task.clone()).unwrap_or_else(|| "General".to_string());
    let raw_analysis = analyze_image_with_qwen(&base64, &task_context).unwrap_or_else(|_| "Screen analysis failed. Category: General".to_string());
    
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
    let lower = raw.to_lowercase();
    
    // Extended category detection - order matters (more specific first)
    let category = if lower.contains("category: debugging") || lower.contains("debugger") || lower.contains("breakpoint") {
        "Debugging"
    } else if lower.contains("category: code review") || lower.contains("pull request") || lower.contains("reviewing code") {
        "CodeReview"
    } else if lower.contains("category: testing") || lower.contains("running tests") || lower.contains("test results") {
        "Testing"
    } else if lower.contains("category: coding") || lower.contains("category: development") || lower.contains("writing code") {
        "Coding"
    } else if lower.contains("category: documentation") || lower.contains("writing docs") || lower.contains("readme") {
        "Documentation"
    } else if lower.contains("category: design") || lower.contains("figma") || lower.contains("sketch") {
        "Design"
    } else if lower.contains("category: planning") || lower.contains("jira") || lower.contains("trello") || lower.contains("backlog") {
        "Planning"
    } else if lower.contains("category: meeting") || lower.contains("zoom") || lower.contains("google meet") || lower.contains("teams") {
        "Meeting"
    } else if lower.contains("category: communication") || lower.contains("slack") || lower.contains("discord") || lower.contains("email") {
        "Communication"
    } else if lower.contains("category: research") || lower.contains("stackoverflow") || lower.contains("searching") {
        "Research"
    } else if lower.contains("category: learning") || lower.contains("tutorial") || lower.contains("course") || lower.contains("documentation") {
        "Learning"
    } else if lower.contains("category: devops") || lower.contains("docker") || lower.contains("kubernetes") || lower.contains("pipeline") {
        "DevOps"
    } else if lower.contains("category: database") || lower.contains("sql") || lower.contains("database") {
        "Database"
    } else if lower.contains("category: sales") || lower.contains("crm") || lower.contains("hubspot") {
        "Sales"
    } else if lower.contains("category: admin") || lower.contains("settings") || lower.contains("configuration") {
        "Admin"
    } else if lower.contains("category: browsing") || lower.contains("browser") {
        "Browsing"
    } else if lower.contains("category: idle") || lower.contains("idle") || lower.contains("no activity") {
        "Idle"
    } else {
        "General"
    };
    
    (raw.to_string(), category.to_string())
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
    
    // 1. Try plain "ollama" (if in PATH)
    if let Ok(o) = Command::new(if cfg!(windows) { "where" } else { "which" }).arg("ollama").output() {
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
    let ollama_bin = get_ollama_bin();
    let has_exe = if ollama_bin == "ollama" {
        // Double check via command if it's just "ollama"
        use std::process::Command;
        if cfg!(windows) {
            Command::new("where").arg("ollama").output().map(|o| o.status.success()).unwrap_or(false)
        } else {
            Command::new("which").arg("ollama").output().map(|o| o.status.success()).unwrap_or(false)
        }
    } else {
        std::path::Path::new(&ollama_bin).exists()
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build().map_err(|e| e.to_string())?;
    
    match client.get("http://localhost:11434/api/tags").send() {
        Ok(r) if r.status().is_success() => {
            let json: serde_json::Value = r.json().unwrap_or_default();
            let models: Vec<String> = json["models"].as_array()
                .map(|arr| arr.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect())
                .unwrap_or_default();
            
            let has_vision = models.iter().any(|m| {
                let m_lower = m.to_lowercase();
                m_lower.contains("llava") || 
                m_lower.contains("moondream") || 
                (m_lower.contains("qwen") && m_lower.contains("vl"))
            });
            
            println!("[Ollama] Full models list: {:?}", models);
            println!("[Ollama] Has vision model (qwen*vl): {}", has_vision);
            
            Ok(serde_json::json!({
                "online": true, 
                "installed": true,
                "models": models, 
                "hasVisionModel": has_vision
            }))
        }
        _ => Ok(serde_json::json!({
            "online": false,
            "installed": has_exe
        }))
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
    
    // Ensure no window on Windows
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    match cmd.spawn() {
        Ok(_) => Ok(serde_json::json!({"started": true})),
        Err(e) => Err(format!("Failed to start Ollama ({}): {}", ollama_bin, e))
    }
}

// RESTORED AI ANALYSIS (Backend)
#[tauri::command]

fn analyze_image_with_qwen(base64_img: &str, current_task: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    
    // Detailed but direct prompt with extended categories
    let prompt = format!(
        "Current Task: {}

Analyze this screenshot in detail but be direct. Report:
- Application in use and window title
- Specific files open (exact names if visible)
- Code/content being edited (language, functions, classes)
- User's current action (writing, debugging, reviewing, etc.)
- Progress indicators (errors, test results, build status)
- How this work relates to the current task

You have 600 tokens. Provide a complete, detailed analysis.

End with exactly ONE of these categories:
Category: Coding | Debugging | CodeReview | Testing | Documentation | Design | Planning | Meeting | Communication | Research | Learning | DevOps | Database | Sales | Admin | Browsing | Idle | General",
        current_task
    );
    
    let body = serde_json::json!({
        "model": "qwen3-vl:2b",
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [base64_img]
            }
        ],
        "stream": false,
        "options": {
            "temperature": 0.3,
            "num_predict": 600
        }
    });
    
    // Switch to Chat API
    let resp = client.post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .map_err(|e| format!("Ollama request failed: {}", e))?;
        
    if !resp.status().is_success() {
        return Err(format!("Ollama Error: {}", resp.status()));
    }
    
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    
    // Debug Log (Print full JSON to be safe)
    // println!("Ollama JSON: {:?}", json);
    
    // Parse Chat Response
    // Qwen3-VL sometimes puts reasoning in "thinking" field and content might be empty or partial
    let msg = &json["message"];
    let content = msg["content"].as_str().unwrap_or("");
    let thinking = msg["thinking"].as_str().unwrap_or("");
    
    let response_text = if !content.is_empty() {
        content.to_string()
    } else if !thinking.is_empty() {
        // Fallback to thinking if content is empty (common in Qwen)
        println!("Using THINKING field as content was empty.");
        thinking.to_string()
    } else {
        println!("RAW OLLAMA RESP IS EMPTY. Full JSON: {:?}", json);
        "No content returned".to_string()
    };

    println!("RAW OLLAMA RESP: {}", response_text);
    
    Ok(response_text)
}
