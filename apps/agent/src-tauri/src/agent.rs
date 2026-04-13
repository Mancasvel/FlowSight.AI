use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri::State;
use tauri::Emitter;
use chrono::Local;
use rusqlite::{Connection, params};
use std::io::{Read, Write};
use std::fs::File;
use std::time::Duration;

pub type AgentState = Mutex<Option<FlowSightAgent>>;
const VISION_MODEL_ID: &str = "Qwen/Qwen3-VL-2B-Instruct";
const VISION_LOCAL_MODEL_FILE: &str = "Qwen3-VL-2B-Instruct-Q3_K_M.gguf";
const VISION_LOCAL_MMPROJ_FILE: &str = "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf";
const VISION_LOCAL_MODEL_NAME: &str = "Qwen3-VL-2B-Instruct";

/// Terminal logging for `pnpm run dev`: on in debug builds, or set `FLOWSIGHT_DEBUG=1`.
fn flowsight_terminal_debug() -> bool {
    use std::sync::OnceLock;
    static FLAG: OnceLock<bool> = OnceLock::new();
    *FLAG.get_or_init(|| {
        std::env::var("FLOWSIGHT_DEBUG")
            .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
            .unwrap_or(cfg!(debug_assertions))
    })
}

fn fs_log(line: impl AsRef<str>) {
    if flowsight_terminal_debug() {
        eprintln!("[FlowSight] {}", line.as_ref());
    }
}

/// Same sources as `setup_llm.py`; stored under app data `FlowSight/local_llm/`.
const MODEL_DOWNLOAD_URL: &str = "https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3-VL-2B-Instruct-Q3_K_M.gguf";
const MMPROJ_DOWNLOAD_URL: &str = "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf";

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
                vision_model: Some(VISION_MODEL_ID.to_string()),
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
            let id = conn.last_insert_rowid();
            let preview: String = desc.chars().take(120).collect();
            fs_log(format!(
                "report INSERT id={} category={} ticket={:?} duration_s={} | {}",
                id, activity_type, ticket, duration, preview
            ));
            return Some(id);
        }
        fs_log("report INSERT failed: could not open DB".to_string());
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
    crate::screen_capture::capture_screen()
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
    fs_log(format!(
        "capture_context_snapshot START task={:?} ticket={:?}",
        user_task, jira_ticket
    ));

    // Extract config (default to 16 if not set to ensure balanced load)
    let gpu_layers = {
        let guard = state.lock().unwrap();
        guard.as_ref()
            .and_then(|a| a.config.gpu_layers)
            .or(Some(16)) 
    };

    // Run ALL heavy work on a background thread to avoid blocking the main/UI thread
    let out = tauri::async_runtime::spawn_blocking(move || {
        use crate::context::{get_system_context, get_git_context};
        use std::path::PathBuf;

        // 1. Capture Screen
        let (base64, path_str) = capture_screen()?;
        let path = PathBuf::from(&path_str);

        // 2. Local vision model analysis (description + category)
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

        let snap = ContextSnapshot {
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
        };
        fs_log(format!(
            "capture_context_snapshot OK category={} desc_preview={}",
            snap.category,
            snap.description.chars().take(80).collect::<String>()
        ));
        Ok(snap)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    match &out {
        Ok(_) => {}
        Err(e) => fs_log(format!("capture_context_snapshot ERR {e}")),
    }
    out
}

// Helper to parse "Category: X" logic
fn parse_analysis(raw: &str) -> (String, String) {
    let lower = raw.to_lowercase();

    // --- Extract category from structured "CATEGORY:" field first ---
    let category = extract_category_from_field(&lower)
        .unwrap_or_else(|| infer_category_from_content(&lower));

    // --- Build clean description from structured fields ---
    let description = build_structured_description(raw);

    (description, category)
}

/// Extract category from an explicit "CATEGORY: Xyz" line in the model output.
fn extract_category_from_field(lower: &str) -> Option<String> {
    let valid_categories = [
        "coding", "debugging", "codereview", "testing", "documentation",
        "design", "planning", "meeting", "communication", "research",
        "learning", "devops", "database", "sales", "admin", "browsing",
        "idle", "general",
    ];

    // Find the last "category:" occurrence
    if let Some(idx) = lower.rfind("category:") {
        let after = lower[idx + 9..].trim();
        // Take first word (the category value)
        let cat_word = after.split_whitespace().next().unwrap_or("")
            .trim_matches(|c: char| !c.is_alphanumeric());

        for valid in &valid_categories {
            if cat_word.starts_with(valid) {
                // Return properly cased version
                return Some(match *valid {
                    "coding" => "Coding",
                    "debugging" => "Debugging",
                    "codereview" => "CodeReview",
                    "testing" => "Testing",
                    "documentation" => "Documentation",
                    "design" => "Design",
                    "planning" => "Planning",
                    "meeting" => "Meeting",
                    "communication" => "Communication",
                    "research" => "Research",
                    "learning" => "Learning",
                    "devops" => "DevOps",
                    "database" => "Database",
                    "sales" => "Sales",
                    "admin" => "Admin",
                    "browsing" => "Browsing",
                    "idle" => "Idle",
                    _ => "General",
                }.to_string());
            }
        }
    }
    None
}

/// Fallback: infer category from keywords in the full content.
fn infer_category_from_content(lower: &str) -> String {
    if lower.contains("debugger") || lower.contains("breakpoint") { "Debugging" }
    else if lower.contains("pull request") || lower.contains("reviewing code") || lower.contains("code review") { "CodeReview" }
    else if lower.contains("running tests") || lower.contains("test results") || lower.contains("test suite") { "Testing" }
    else if lower.contains("writing code") || lower.contains("editor") || lower.contains("visual studio code") || lower.contains("vs code") || lower.contains("ide") { "Coding" }
    else if lower.contains("writing docs") || lower.contains("readme") { "Documentation" }
    else if lower.contains("figma") || lower.contains("sketch") || lower.contains("design tool") { "Design" }
    else if lower.contains("jira") || lower.contains("trello") || lower.contains("backlog") { "Planning" }
    else if lower.contains("zoom") || lower.contains("google meet") || lower.contains("teams meeting") { "Meeting" }
    else if lower.contains("slack") || lower.contains("discord") || lower.contains("email") { "Communication" }
    else if lower.contains("stackoverflow") || lower.contains("searching") || lower.contains("google search") { "Research" }
    else if lower.contains("tutorial") || lower.contains("course") || lower.contains("learning") { "Learning" }
    else if lower.contains("docker") || lower.contains("kubernetes") || lower.contains("pipeline") || lower.contains("ci/cd") { "DevOps" }
    else if lower.contains("sql") || lower.contains("database") || lower.contains("supabase") { "Database" }
    else if lower.contains("crm") || lower.contains("hubspot") { "Sales" }
    else if lower.contains("settings") || lower.contains("configuration") { "Admin" }
    else if lower.contains("browser") || lower.contains("chrome") || lower.contains("firefox") || lower.contains("linkedin") || lower.contains("github.com") { "Browsing" }
    else if lower.contains("idle") || lower.contains("no activity") || lower.contains("lock screen") { "Idle" }
    else { "General" }
    .to_string()
}

/// Build a clean human-readable description from the structured fields.
fn build_structured_description(raw: &str) -> String {
    // Known field labels from our template
    let fields = ["APP:", "WINDOW TITLE:", "VISIBLE CONTENT:", "FILES OR URLS:",
                   "CURRENT ACTION:", "PROGRESS:", "NEXT STEP:", "CATEGORY:"];

    let mut parts: Vec<String> = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        // Skip the CATEGORY line (parsed separately)
        if trimmed.to_uppercase().starts_with("CATEGORY:") { continue; }

        // Clean markdown artifacts just in case
        let clean = trimmed
            .replace("###", "")
            .replace("##", "")
            .replace("**", "")
            .replace("####", "");
        let clean = clean.trim();
        if clean.is_empty() { continue; }

        // Check if it matches a known field pattern to keep structured output
        let is_field = fields.iter().any(|f| clean.to_uppercase().starts_with(f));
        if is_field {
            parts.push(clean.to_string());
        } else {
            // Free text line — keep as-is
            parts.push(clean.to_string());
        }
    }

    if parts.is_empty() {
        return "No analysis available".to_string();
    }

    parts.join("\n")
}
#[tauri::command]
pub fn save_activity(state: State<'_, AgentState>, description: String, activity_type: String, jira_ticket: Option<String>) -> Result<ActivityReport, String> {
    let mut agent = state.lock().unwrap();
    let report_id = if let Some(a) = agent.as_mut() {
        a.reports_sent += 1;
        // Default capture interval 30s
        a.save_report(&description, &activity_type, jira_ticket, 30)
    } else {
        fs_log("save_activity: agent not initialized — report not stored");
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

/// Starts periodic activity capture. Emits `auto-capture-tick` on an OS thread so the interval is not
/// throttled when the WebView is in the background (unreliable `setInterval` in Chromium).
#[tauri::command]
pub fn start_monitoring(app: tauri::AppHandle, state: State<'_, AgentState>) -> Result<bool, String> {
    let mut g = state.lock().unwrap();
    let Some(agent) = g.as_mut() else {
        return Err("Agent not initialized".to_string());
    };
    if agent.is_running {
        return Ok(true);
    }
    agent.is_running = true;
    let app_handle = app.clone();
    drop(g);

    fs_log("start_monitoring: OS thread started (emits auto-capture-tick + sleep)");

    std::thread::spawn(move || {
        let mut tick: u64 = 0;
        loop {
            let interval_ms = {
                let state = app_handle.state::<AgentState>();
                let guard = state.lock().unwrap();
                let Some(agent) = guard.as_ref() else {
                    fs_log("monitor thread exit: no agent");
                    return;
                };
                if !agent.is_running {
                    fs_log("monitor thread exit: is_running=false");
                    return;
                }
                agent.config.capture_interval.unwrap_or(60000)
            };
            tick += 1;
            fs_log(format!(
                "monitor tick #{tick} → emit auto-capture-tick (next sleep {}ms)",
                interval_ms
            ));
            if let Err(e) = app_handle.emit("auto-capture-tick", serde_json::json!({})) {
                fs_log(format!("emit auto-capture-tick FAILED: {e}"));
                log::warn!("[Monitoring] emit auto-capture-tick: {e}");
            }
            std::thread::sleep(Duration::from_millis(interval_ms));
        }
    });

    Ok(true)
}

#[tauri::command]
pub fn stop_monitoring(state: State<'_, AgentState>) -> Result<bool, String> {
    if let Some(a) = state.lock().unwrap().as_mut() {
        a.is_running = false;
    }
    fs_log("stop_monitoring: is_running=false (monitor thread will exit)");
    Ok(true)
}

/// Print recent rows from `reports` to stderr (terminal). Always prints when invoked (not gated by FLOWSIGHT_DEBUG).
#[tauri::command]
pub fn debug_dump_reports(state: State<'_, AgentState>, limit: Option<u32>) -> Result<String, String> {
    let lim = limit.unwrap_or(25).min(200);
    let db_path = {
        let guard = state.lock().unwrap();
        guard
            .as_ref()
            .map(|a| a.db_path.clone())
            .ok_or("Agent not initialized")?
    };
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, synced, activity_type, jira_ticket_id, duration_seconds, created_at, substr(description,1,200) FROM reports ORDER BY id DESC LIMIT ?",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([lim], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    eprintln!("[FlowSight] ========== reports (last {lim}) ==========");
    let mut n = 0usize;
    for r in rows {
        let (id, synced, cat, ticket, dur, created, preview) = r.map_err(|e| e.to_string())?;
        n += 1;
        eprintln!(
            "[FlowSight] id={} synced={} cat={} ticket={:?} dur={}s at={} | {}",
            id, synced, cat, ticket, dur, created, preview
        );
    }
    eprintln!("[FlowSight] ========== end ({n} rows) ==========");
    Ok(format!("Printed {n} report row(s) to the terminal (stderr)."))
}

#[tauri::command]
pub fn debug_log_line(line: String) {
    if flowsight_terminal_debug() {
        eprintln!("[FlowSight][UI] {}", line);
    }
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

/// True if llama-server is already answering on port 8080 (avoids spawning a second instance: bind fails with exit 1).
fn local_llama_http_healthy() -> bool {
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    else {
        return false;
    };
    client
        .get("http://127.0.0.1:8080/health")
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn read_server_log_tail_chars(max_chars: usize) -> String {
    let Ok(path) = server_log_path() else {
        return String::new();
    };
    std::fs::read_to_string(&path)
        .ok()
        .map(|s| {
            s.chars()
                .rev()
                .take(max_chars)
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn check_ollama() -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build().map_err(|e| e.to_string())?;
    
    // llama-server local health check (workflow compatibility)
    match client.get("http://127.0.0.1:8080/health").send() {
        Ok(r) if r.status().is_success() => Ok(serde_json::json!({
            "online": true,
            "installed": true,
            "models": [VISION_LOCAL_MODEL_NAME],
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
    let check = |dir: &Path| dir.join("local_llm").join("bin").exists();

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().unwrap_or(Path::new(".")).to_path_buf();
        for _ in 0..8 {
            if check(&dir) {
                return Ok(dir);
            }
            if !dir.pop() {
                break;
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = cwd;
        for _ in 0..6 {
            if check(&dir) {
                return Ok(dir);
            }
            if !dir.pop() {
                break;
            }
        }
    }

    Err("Could not find project root (local_llm/bin not found). Run setup_llm.py once for llama-server, or place llama-server in app data.".to_string())
}

fn local_llm_storage_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| "Could not resolve application data directory".to_string())?
        .join("FlowSight")
        .join("local_llm");
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

fn server_log_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| "Could not resolve application data directory".to_string())?
        .join("FlowSight");
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join("server.log"))
}

fn is_valid_gguf(path: &Path, min_bytes: u64) -> bool {
    std::fs::metadata(path)
        .ok()
        .map(|m| m.len() >= min_bytes)
        .unwrap_or(false)
}

/// Download a large file with progress events (`local-ai-progress`) for the UI.
fn download_http_file(
    app: &tauri::AppHandle,
    url: &str,
    dest: &Path,
    phase_user_label: &str,
    min_bytes: u64,
) -> Result<(), String> {
    if is_valid_gguf(dest, min_bytes) {
        return Ok(());
    }

    let parent = dest.parent().ok_or("Invalid destination path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let fname = dest
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("download");
    let partial = parent.join(format!("{fname}.part"));
    let _ = std::fs::remove_file(&partial);

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(7200))
        .connect_timeout(Duration::from_secs(120))
        .user_agent("FlowSight-Agent/1.0 (local inference)")
        .build()
        .map_err(|e| e.to_string())?;

    let mut resp = client
        .get(url)
        .send()
        .map_err(|e| format!("Download failed ({phase_user_label}): {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "HTTP {} while downloading {} — check your network",
            resp.status(),
            phase_user_label
        ));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = File::create(&partial).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 65536];
    let mut downloaded: u64 = 0;

    loop {
        let n = resp.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        let pct: u8 = if total > 0 {
            (((downloaded.min(total)) * 100) / total).min(100) as u8
        } else {
            0
        };
        let _ = app.emit(
            "local-ai-progress",
            serde_json::json!({
                "phase": phase_user_label,
                "message": format!(
                    "{} — {:.1} MB{}",
                    phase_user_label,
                    downloaded as f64 / 1_048_576.0,
                    if total > 0 {
                        format!(" / {:.1} MB", total as f64 / 1_048_576.0)
                    } else {
                        String::new()
                    }
                ),
                "percent": pct,
                "downloaded": downloaded,
                "total": total,
            }),
        );
    }

    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&partial, dest).map_err(|e| {
        let _ = std::fs::remove_file(&partial);
        e.to_string()
    })?;
    Ok(())
}

/// Prefer dev checkout if both GGUFs exist; otherwise download into app data and use those paths.
fn ensure_vision_model_files(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if let Ok(root) = find_project_root() {
        let dm = root.join("local_llm").join(VISION_LOCAL_MODEL_FILE);
        let dmm = root.join("local_llm").join(VISION_LOCAL_MMPROJ_FILE);
        if is_valid_gguf(&dm, 1_000_000) && is_valid_gguf(&dmm, 100_000) {
            let _ = app.emit(
                "local-ai-progress",
                serde_json::json!({
                    "phase": "ready",
                    "message": "Using local AI files from development folder",
                    "percent": 100u8,
                }),
            );
            return Ok((dm, dmm));
        }
    }

    let storage = local_llm_storage_dir()?;
    let st_model = storage.join(VISION_LOCAL_MODEL_FILE);
    let st_mmproj = storage.join(VISION_LOCAL_MMPROJ_FILE);

    if !is_valid_gguf(&st_model, 1_000_000) {
        let _ = app.emit(
            "local-ai-progress",
            serde_json::json!({
                "phase": "download-model",
                "message": "Downloading local AI model (first run only, may take a while)...",
                "percent": 0u8,
            }),
        );
        download_http_file(
            app,
            MODEL_DOWNLOAD_URL,
            &st_model,
            "Downloading local AI model",
            1_000_000,
        )?;
    }

    if !is_valid_gguf(&st_mmproj, 100_000) {
        let _ = app.emit(
            "local-ai-progress",
            serde_json::json!({
                "phase": "download-mmproj",
                "message": "Downloading local AI vision module...",
                "percent": 0u8,
            }),
        );
        download_http_file(
            app,
            MMPROJ_DOWNLOAD_URL,
            &st_mmproj,
            "Downloading local AI vision module",
            100_000,
        )?;
    }

    Ok((st_model, st_mmproj))
}

fn spawn_llama_server(
    bin_path: &Path,
    model_path: &Path,
    mmproj_path: &Path,
) -> Result<std::process::Child, String> {
    use std::process::Command;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    // Windows builds often ship with CUDA; Linux/macOS release tarballs are typically CPU-only.
    // Using --n-gpu-layers > 0 without a matching GPU backend makes llama-server exit with code 1.
    let n_gpu_layers = if cfg!(windows) { "50" } else { "0" };

    let mut cmd = Command::new(bin_path);
    cmd.arg("-m").arg(model_path)
        .arg("--mmproj").arg(mmproj_path)
        .arg("--host").arg("127.0.0.1")
        .arg("--port").arg("8080")
        .arg("--ctx-size").arg("4096")
        .arg("--parallel")
        .arg(if cfg!(windows) { "2" } else { "1" })
        .arg("--threads").arg("2")
        .arg("--n-gpu-layers").arg(n_gpu_layers);

    #[cfg(unix)]
    {
        // Default mmproj GPU offload breaks on typical CPU-only Unix builds (exit code 1).
        cmd.arg("--no-mmproj-offload")
            .arg("--no-mmap")
            .arg("--no-warmup")
            .arg("--image-min-tokens")
            .arg("1024");
    }

    if let Some(parent) = bin_path.parent() {
        cmd.current_dir(parent);
        #[cfg(target_os = "linux")]
        {
            let path_str = parent.to_string_lossy();
            let ld = match std::env::var("LD_LIBRARY_PATH") {
                Ok(ref s) if !s.is_empty() => format!("{path_str}:{s}"),
                _ => path_str.into_owned(),
            };
            cmd.env("LD_LIBRARY_PATH", ld);
        }
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000000u32 | 0x00004000u32);

    let log_path = server_log_path()?;
    if let Ok(file) = std::fs::File::create(&log_path) {
        if let Ok(file_err) = file.try_clone() {
            cmd.stdout(std::process::Stdio::from(file));
            cmd.stderr(std::process::Stdio::from(file_err));
        }
    }

    cmd.spawn().map_err(|e| format!("Failed to start llama-server: {e}"))
}

fn prepare_and_start_server_inner(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    {
        let guard = SERVER_PROCESS.lock().unwrap();
        if guard.is_some() {
            return Ok(serde_json::json!({
                "status": "already_running",
                "message": "Local AI server is already running"
            }));
        }
    }

    // Port 8080 already serving (e.g. leftover llama-server): spawning again fails on bind (exit 1).
    if local_llama_http_healthy() {
        return Ok(serde_json::json!({
            "status": "already_running",
            "message": "Local AI already responding on http://127.0.0.1:8080"
        }));
    }

    let _ = app.emit(
        "local-ai-progress",
        serde_json::json!({
            "phase": "prepare",
            "message": "Preparing local AI...",
            "percent": 5u8,
        }),
    );

    let (model_path, mmproj_path) = ensure_vision_model_files(&app)?;
    let bin_path = crate::llama_bin::ensure_llama_server(&app, local_llm_storage_dir()?.join("bin"))?;

    let _ = app.emit(
        "local-ai-progress",
        serde_json::json!({
            "phase": "start",
            "message": "Starting local AI server...",
            "percent": 92u8,
        }),
    );

    let mut guard = SERVER_PROCESS.lock().unwrap();
    if guard.is_some() {
        return Ok(serde_json::json!({"status": "already_running"}));
    }
    if local_llama_http_healthy() {
        return Ok(serde_json::json!({
            "status": "already_running",
            "message": "Local AI already responding on http://127.0.0.1:8080"
        }));
    }

    let log_path = server_log_path().unwrap_or_else(|_| PathBuf::from("server.log"));

    let mut child = match spawn_llama_server(&bin_path, &model_path, &mmproj_path) {
        Ok(c) => c,
        Err(e) => return Err(e),
    };

    const HEALTH_WAIT: Duration = Duration::from_secs(120);
    const POLL_MS: Duration = Duration::from_millis(400);
    let deadline = std::time::Instant::now() + HEALTH_WAIT;
    let mut last_progress = std::time::Instant::now();
    let wait_start = std::time::Instant::now();

    loop {
        if let Ok(Some(status)) = child.try_wait() {
            let log_tail = read_server_log_tail_chars(8000);
            return Err(format!(
                "llama-server exited during startup (code: {:?}). {}",
                status.code(),
                if log_tail.is_empty() {
                    format!("See log: {:?}", log_path)
                } else {
                    format!("Log tail: {}", log_tail)
                }
            ));
        }
        if local_llama_http_healthy() {
            *guard = Some(child);
            return Ok(serde_json::json!({
                "status": "started",
                "pid": "managed",
                "model": VISION_LOCAL_MODEL_NAME
            }));
        }
        if std::time::Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            let log_tail = read_server_log_tail_chars(8000);
            return Err(format!(
                "Local AI did not become ready within {}s. {}",
                HEALTH_WAIT.as_secs(),
                if log_tail.is_empty() {
                    format!("See log: {:?}", log_path)
                } else {
                    format!("Log tail: {}", log_tail)
                }
            ));
        }
        if last_progress.elapsed() >= Duration::from_secs(3) {
            last_progress = std::time::Instant::now();
            let elapsed = wait_start.elapsed().as_secs();
            let pct = (92u8).saturating_add((elapsed.min(25)) as u8).min(99);
            let _ = app.emit(
                "local-ai-progress",
                serde_json::json!({
                    "phase": "warmup",
                    "message": format!("Waiting for local AI ({elapsed}s)..."),
                    "percent": pct,
                }),
            );
        }
        std::thread::sleep(POLL_MS);
    }
}

/// Downloads vision model files to app data if needed, resolves `llama-server`, then starts it. Use this from **Start** in the UI.
#[tauri::command]
pub async fn prepare_and_start_server(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || prepare_and_start_server_inner(app))
        .await
        .map_err(|e| format!("Task join: {e}"))?
}


#[tauri::command]
pub fn stop_server() -> Result<bool, String> {
    let mut guard = SERVER_PROCESS.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        return Ok(true);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
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
        println!("[LocalAI] Truncated {} repeated tokens from output", words.len() - result.len());
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
            "model": VISION_LOCAL_MODEL_NAME,
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
            println!("[LocalAI] Attempt {}/{}: empty or refusal response, retrying...", attempt, max_attempts);
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
