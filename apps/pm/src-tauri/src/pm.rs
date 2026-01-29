use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::path::PathBuf;
use tauri::State;
use rusqlite::{Connection, params};
use tiny_http::{Server, Response, Header};
use chrono::Local;

// ============================================
// TYPES
// ============================================

pub type PmState = Mutex<Option<PmDashboard>>;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Developer {
    pub id: String,
    pub name: String,
    pub device_id: String,
    pub is_online: bool,
    pub last_seen_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActivityReport {
    pub id: Option<i64>,
    pub developer_id: String,
    pub developer_name: String,
    pub description: String,
    pub activity_type: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PmConfig {
    pub team_name: Option<String>,
    pub api_key: Option<String>,
    pub server_port: u16,
    pub retention_days: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Stats {
    pub total_developers: u32,
    pub online_developers: u32,
    pub total_reports: u32,
    pub reports_today: u32,
    pub activity_breakdown: std::collections::HashMap<String, u32>,
}

// ============================================
// PM DASHBOARD
// ============================================

pub struct PmDashboard {
    pub config: PmConfig,
    pub db_path: PathBuf,
    pub server_running: Arc<Mutex<bool>>,
}

impl Default for PmDashboard {
    fn default() -> Self {
        Self::new()
    }
}

impl PmDashboard {
    pub fn new() -> Self {
        let db_path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("FlowSight")
            .join("pm-dashboard.db");
        
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        let mut pm = Self {
            config: PmConfig {
                team_name: Some("My Team".to_string()),
                api_key: Some(generate_key()),
                server_port: 8080,
                retention_days: 7,
            },
            db_path,
            server_running: Arc::new(Mutex::new(false)),
        };
        
        pm.init_database();
        pm.load_config();
        pm
    }
    
    fn init_database(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS developers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    device_id TEXT UNIQUE,
                    is_online INTEGER DEFAULT 1,
                    last_seen_at TEXT
                );
                
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    developer_id TEXT NOT NULL,
                    description TEXT NOT NULL,
                    activity_type TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE INDEX IF NOT EXISTS idx_reports_dev ON reports(developer_id);
                CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(created_at DESC);"
            );
        }
    }
    
    fn load_config(&mut self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            if let Ok(value) = conn.query_row::<String, _, _>(
                "SELECT value FROM config WHERE key = 'api_key'", [], |r| r.get(0)
            ) {
                self.config.api_key = Some(value);
            }
            if let Ok(value) = conn.query_row::<String, _, _>(
                "SELECT value FROM config WHERE key = 'team_name'", [], |r| r.get(0)
            ) {
                self.config.team_name = Some(value);
            }
            if let Ok(value) = conn.query_row::<String, _, _>(
                "SELECT value FROM config WHERE key = 'server_port'", [], |r| r.get(0)
            ) {
                self.config.server_port = value.parse().unwrap_or(8080);
            }
        }
    }
    
    fn save_config(&self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            if let Some(key) = &self.config.api_key {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO config (key, value) VALUES ('api_key', ?)",
                    [key]
                );
            }
            if let Some(name) = &self.config.team_name {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO config (key, value) VALUES ('team_name', ?)",
                    [name]
                );
            }
            let _ = conn.execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES ('server_port', ?)",
                [self.config.server_port.to_string()]
            );
        }
    }
}

fn generate_key() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("fsk_{:x}", timestamp)
}

// ============================================
// HTTP SERVER (receives reports from DEV Agents)
// ============================================

fn run_http_server(db_path: PathBuf, port: u16, api_key: String, running: Arc<Mutex<bool>>) {
    let addr = format!("0.0.0.0:{}", port);
    let server = match Server::http(&addr) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to start server: {}", e);
            return;
        }
    };
    
    println!("[PM] HTTP Server started on port {}", port);
    
    for request in server.incoming_requests() {
        // Check if we should stop
        if !*running.lock().unwrap() {
            break;
        }
        
        let url = request.url().to_string();
        let method = request.method().to_string();
        
        // CORS headers
        let cors_headers = vec![
            Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
            Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap(),
            Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, X-API-Key").unwrap(),
        ];
        
        // Handle OPTIONS (CORS preflight)
        if method == "OPTIONS" {
            let mut response = Response::empty(200);
            for h in cors_headers {
                response.add_header(h);
            }
            let _ = request.respond(response);
            continue;
        }
        
        // Check API key
        let req_api_key = request.headers()
            .iter()
            .find(|h| h.field.as_str().to_lowercase() == "x-api-key")
            .map(|h| h.value.as_str().to_string());
        
        if req_api_key.as_ref() != Some(&api_key) && !url.contains("/health") {
            let mut response = Response::from_string(r#"{"error":"Invalid API key"}"#)
                .with_status_code(401);
            for h in cors_headers {
                response.add_header(h);
            }
            let _ = request.respond(response);
            continue;
        }
        
        let response_body = match (method.as_str(), url.as_str()) {
            ("GET", "/health") => r#"{"status":"ok"}"#.to_string(),
            
            ("POST", "/api/report") => {
                // Read body
                let mut body = String::new();
                if let Ok(mut reader) = request.as_reader().take(1024 * 1024) {
                    use std::io::Read;
                    let _ = reader.read_to_string(&mut body);
                }
                
                handle_report(&db_path, &body)
            }
            
            ("GET", "/api/developers") => get_developers_json(&db_path),
            
            ("GET", "/api/stats") => get_stats_json(&db_path),
            
            _ => r#"{"error":"Not found"}"#.to_string(),
        };
        
        let mut response = Response::from_string(response_body)
            .with_header(Header::from_bytes("Content-Type", "application/json").unwrap());
        for h in cors_headers {
            response.add_header(h);
        }
        let _ = request.respond(response);
    }
    
    println!("[PM] HTTP Server stopped");
}

fn handle_report(db_path: &PathBuf, body: &str) -> String {
    #[derive(Deserialize)]
    struct ReportRequest {
        developer_id: Option<String>,
        developer_name: Option<String>,
        device_id: Option<String>,
        description: String,
        activity_type: String,
    }
    
    let req: ReportRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => return format!(r#"{{"error":"Invalid JSON: {}"}}"#, e),
    };
    
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => return format!(r#"{{"error":"DB error: {}"}}"#, e),
    };
    
    let dev_id = req.developer_id.unwrap_or_else(|| {
        req.device_id.clone().unwrap_or_else(|| "unknown".to_string())
    });
    let dev_name = req.developer_name.unwrap_or_else(|| "Unknown".to_string());
    
    // Upsert developer
    let _ = conn.execute(
        "INSERT INTO developers (id, name, device_id, is_online, last_seen_at)
         VALUES (?1, ?2, ?3, 1, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = ?2, is_online = 1, last_seen_at = datetime('now')",
        params![&dev_id, &dev_name, req.device_id]
    );
    
    // Insert report
    let result = conn.execute(
        "INSERT INTO reports (developer_id, description, activity_type) VALUES (?1, ?2, ?3)",
        params![&dev_id, &req.description, &req.activity_type]
    );
    
    match result {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            println!("[PM] Report from {}: {}", dev_name, req.description.chars().take(50).collect::<String>());
            format!(r#"{{"success":true,"id":{}}}"#, id)
        }
        Err(e) => format!(r#"{{"error":"{}"}}"#, e),
    }
}

fn get_developers_json(db_path: &PathBuf) -> String {
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return "[]".to_string(),
    };
    
    let mut stmt = match conn.prepare(
        "SELECT id, name, device_id, is_online, last_seen_at FROM developers ORDER BY last_seen_at DESC"
    ) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };
    
    let devs: Vec<Developer> = stmt.query_map([], |row| {
        Ok(Developer {
            id: row.get(0)?,
            name: row.get(1)?,
            device_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            is_online: row.get::<_, i32>(3)? == 1,
            last_seen_at: row.get(4)?,
        })
    }).map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default();
    
    serde_json::to_string(&devs).unwrap_or_else(|_| "[]".to_string())
}

fn get_stats_json(db_path: &PathBuf) -> String {
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return r#"{"error":"db"}"#.to_string(),
    };
    
    let total_devs: u32 = conn.query_row("SELECT COUNT(*) FROM developers", [], |r| r.get(0)).unwrap_or(0);
    let online_devs: u32 = conn.query_row("SELECT COUNT(*) FROM developers WHERE is_online = 1", [], |r| r.get(0)).unwrap_or(0);
    let total_reports: u32 = conn.query_row("SELECT COUNT(*) FROM reports", [], |r| r.get(0)).unwrap_or(0);
    let today = Local::now().format("%Y-%m-%d").to_string();
    let reports_today: u32 = conn.query_row(
        "SELECT COUNT(*) FROM reports WHERE created_at LIKE ?",
        [format!("{}%", today)],
        |r| r.get(0)
    ).unwrap_or(0);
    
    let stats = serde_json::json!({
        "total_developers": total_devs,
        "online_developers": online_devs,
        "total_reports": total_reports,
        "reports_today": reports_today
    });
    
    stats.to_string()
}

// ============================================
// TAURI COMMANDS
// ============================================

#[tauri::command]
pub fn initialize_pm(state: State<'_, PmState>) -> Result<bool, String> {
    let mut pm = state.lock().unwrap();
    *pm = Some(PmDashboard::new());
    Ok(true)
}

#[tauri::command]
pub fn get_config(state: State<'_, PmState>) -> Result<PmConfig, String> {
    let pm = state.lock().unwrap();
    Ok(pm.as_ref().map(|p| p.config.clone()).unwrap_or_default())
}

#[tauri::command]
pub fn update_config(state: State<'_, PmState>, config: PmConfig) -> Result<PmConfig, String> {
    let mut pm = state.lock().unwrap();
    if let Some(pm) = pm.as_mut() {
        pm.config = config;
        pm.save_config();
        Ok(pm.config.clone())
    } else {
        Err("PM not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_developers(state: State<'_, PmState>) -> Result<Vec<Developer>, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let json = get_developers_json(&pm.db_path);
        serde_json::from_str(&json).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn get_reports(state: State<'_, PmState>, limit: Option<u32>) -> Result<Vec<ActivityReport>, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let conn = Connection::open(&pm.db_path).map_err(|e| e.to_string())?;
        let limit = limit.unwrap_or(50);
        
        let mut stmt = conn.prepare(
            "SELECT r.id, r.developer_id, d.name, r.description, r.activity_type, r.created_at
             FROM reports r
             LEFT JOIN developers d ON r.developer_id = d.id
             ORDER BY r.created_at DESC LIMIT ?"
        ).map_err(|e| e.to_string())?;
        
        let reports: Vec<ActivityReport> = stmt.query_map([limit], |row| {
            Ok(ActivityReport {
                id: row.get(0)?,
                developer_id: row.get(1)?,
                developer_name: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "Unknown".to_string()),
                description: row.get(3)?,
                activity_type: row.get(4)?,
                created_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
        
        Ok(reports)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn get_stats(state: State<'_, PmState>) -> Result<serde_json::Value, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let json = get_stats_json(&pm.db_path);
        serde_json::from_str(&json).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

#[tauri::command]
pub fn start_server(state: State<'_, PmState>) -> Result<String, String> {
    let mut pm = state.lock().unwrap();
    if let Some(pm) = pm.as_mut() {
        if *pm.server_running.lock().unwrap() {
            return Ok("Server already running".to_string());
        }
        
        let db_path = pm.db_path.clone();
        let port = pm.config.server_port;
        let api_key = pm.config.api_key.clone().unwrap_or_default();
        let running = pm.server_running.clone();
        
        *running.lock().unwrap() = true;
        
        thread::spawn(move || {
            run_http_server(db_path, port, api_key, running);
        });
        
        Ok(format!("Server started on port {}", port))
    } else {
        Err("PM not initialized".to_string())
    }
}

#[tauri::command]
pub fn stop_server(state: State<'_, PmState>) -> Result<bool, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        *pm.server_running.lock().unwrap() = false;
        Ok(true)
    } else {
        Err("PM not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_server_status(state: State<'_, PmState>) -> Result<serde_json::Value, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let running = *pm.server_running.lock().unwrap();
        Ok(serde_json::json!({
            "running": running,
            "port": pm.config.server_port,
            "apiKey": pm.config.api_key
        }))
    } else {
        Ok(serde_json::json!({"running": false}))
    }
}

#[tauri::command]
pub fn generate_api_key(state: State<'_, PmState>) -> Result<String, String> {
    let mut pm = state.lock().unwrap();
    if let Some(pm) = pm.as_mut() {
        let new_key = generate_key();
        pm.config.api_key = Some(new_key.clone());
        pm.save_config();
        Ok(new_key)
    } else {
        Err("PM not initialized".to_string())
    }
}

#[tauri::command]
pub fn clear_old_reports(state: State<'_, PmState>, days: Option<u32>) -> Result<u32, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let days = days.unwrap_or(pm.config.retention_days);
        let conn = Connection::open(&pm.db_path).map_err(|e| e.to_string())?;
        
        let result = conn.execute(
            "DELETE FROM reports WHERE created_at < datetime('now', ?)",
            [format!("-{} days", days)]
        ).map_err(|e| e.to_string())?;
        
        Ok(result as u32)
    } else {
        Err("PM not initialized".to_string())
    }
}
