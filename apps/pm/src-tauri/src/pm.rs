use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::path::PathBuf;
use std::io::Read;
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
                
                CREATE TABLE IF NOT EXISTS license_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key_string TEXT UNIQUE NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    expires_at TEXT,
                    is_active INTEGER DEFAULT 1,
                    max_users INTEGER DEFAULT 5
                );
                
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    license_key_id INTEGER,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(license_key_id) REFERENCES license_keys(id)
                );

                CREATE TABLE IF NOT EXISTS teams (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    api_key TEXT UNIQUE,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS developers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    device_id TEXT UNIQUE,
                    email TEXT,
                    is_online INTEGER DEFAULT 1,
                    last_seen_at TEXT,
                    team_id TEXT,
                    license_key_id INTEGER,
                    FOREIGN KEY(license_key_id) REFERENCES license_keys(id)
                );
                
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    developer_id TEXT NOT NULL,
                    description TEXT NOT NULL,
                    activity_type TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE INDEX IF NOT EXISTS idx_reports_dev ON reports(developer_id);
                CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(created_at DESC);
                
                CREATE TABLE IF NOT EXISTS embeddings_raw (
                    embedding_id TEXT PRIMARY KEY,
                    device_hash TEXT NOT NULL,
                    vector BLOB NOT NULL,
                    vector_dimension INTEGER NOT NULL,
                    captured_at INTEGER NOT NULL,
                    app_name TEXT,
                    window_title_hash TEXT,
                    file_path_hash TEXT,
                    jira_issue_id TEXT,
                    git_branch TEXT
                );
                
                CREATE INDEX IF NOT EXISTS idx_device_time 
                ON embeddings_raw(device_hash, captured_at DESC);
                
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    expires_at TEXT NOT NULL
                );"
            );
            
            // Schema Migrations (Idempotent)
            let _ = conn.execute("ALTER TABLE license_keys ADD COLUMN max_users INTEGER DEFAULT 5", []);
            let _ = conn.execute("ALTER TABLE developers ADD COLUMN email TEXT", []);
            let _ = conn.execute("ALTER TABLE developers ADD COLUMN license_key_id INTEGER REFERENCES license_keys(id)", []);

            // SEED DEV KEY (For ease of testing)
            let _ = conn.execute(
                "INSERT INTO license_keys (key_string, expires_at, max_users, is_active) 
                 VALUES ('pm_test_key_12345', datetime('now', '+365 days'), 10, 1)
                 ON CONFLICT(key_string) DO UPDATE SET is_active=1", 
                []
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
// HTTP SERVER
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
    
    for mut request in server.incoming_requests() {
        if !*running.lock().unwrap() {
            break;
        }
        
        let url = request.url().to_string();
        let method = request.method().to_string();
        
        // CORS
        let cors_headers = vec![
            Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
            Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap(),
            Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, X-API-Key").unwrap(),
        ];
        
        if method == "OPTIONS" {
            let mut response = Response::empty(200);
            for h in cors_headers { response.add_header(h); }
            let _ = request.respond(response);
            continue;
        }
        
        let req_api_key = request.headers()
            .iter()
            .find(|h| h.field.as_str().to_ascii_lowercase() == "x-api-key")
            .map(|h| h.value.as_str().to_string());
        
        if req_api_key.as_ref() != Some(&api_key) && !url.contains("/health") && !url.contains("/api/register_dev") {
            let mut response = Response::from_string(r#"{"error":"Invalid API key"}"#).with_status_code(401);
            for h in cors_headers { response.add_header(h); }
            let _ = request.respond(response);
            continue;
        }
        
        let response_body = match (method.as_str(), url.as_str()) {
            ("GET", "/health") => r#"{"status":"ok"}"#.to_string(),
            ("POST", "/api/report") => {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                handle_report(&db_path, &body)
            }
            ("POST", "/api/register_dev") => {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                handle_register_dev(&db_path, &body)
            }
            ("GET", "/api/developers") => get_developers_json(&db_path),
            ("GET", "/api/stats") => get_stats_json(&db_path),
            _ => r#"{"error":"Not found"}"#.to_string(),
        };
        
        let mut response = Response::from_string(response_body)
            .with_header(Header::from_bytes("Content-Type", "application/json").unwrap());
        for h in cors_headers { response.add_header(h); }
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
    
    let _ = conn.execute(
        "INSERT INTO developers (id, name, device_id, is_online, last_seen_at)
         VALUES (?1, ?2, ?3, 1, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = ?2, is_online = 1, last_seen_at = datetime('now')",
        params![&dev_id, &dev_name, req.device_id]
    );
    
    let result = conn.execute(
        "INSERT INTO reports (developer_id, description, activity_type) VALUES (?1, ?2, ?3)",
        params![&dev_id, &req.description, &req.activity_type]
    );
    
    match result {
        Ok(_) => format!(r#"{{"success":true}}"#),
        Err(e) => format!(r#"{{"error":"{}"}}"#, e),
    }
}

fn handle_register_dev(db_path: &PathBuf, body: &str) -> String {
    #[derive(Deserialize)]
    struct RegisterRequest {
        email: String,
        device_id: String,
        team_key: String,
        developer_name: Option<String>
    }
    let req: RegisterRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(_) => return r#"{"error":"Invalid JSON"}"#.to_string(),
    };
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return r#"{"error":"DB error"}"#.to_string(),
    };
    
    let mut stmt = match conn.prepare("SELECT id, expires_at, max_users, is_active FROM license_keys WHERE key_string = ?1") {
        Ok(s) => s,
        Err(_) => return r#"{"error":"DB Prepare Error"}"#.to_string(),
    };
    let license_row = stmt.query_row([&req.team_key], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, i32>(2)?, row.get::<_, i32>(3)?))
    });
    
    match license_row {
        Ok((lic_id, _, max_users, is_active)) => {
            if is_active == 0 { return r#"{"error":"Inactive License"}"#.to_string(); }
            let count: i32 = conn.query_row("SELECT COUNT(DISTINCT id) FROM developers WHERE license_key_id = ?", params![lic_id], |r| r.get(0)).unwrap_or(0);
            if count >= max_users { return r#"{"error":"Limit Reached"}"#.to_string(); }
            
            let name = req.developer_name.unwrap_or_else(|| req.email.split('@').next().unwrap_or("Dev").to_string());
            let _ = conn.execute(
                "INSERT INTO developers (id, name, device_id, email, license_key_id, is_online, last_seen_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET email=?4, license_key_id=?5, is_online=1, last_seen_at=datetime('now'), name=?2",
                params![&req.device_id, name, &req.device_id, &req.email, lic_id]
            );
            r#"{"success":true}"#.to_string()
        },
        Err(_) => r#"{"error":"Invalid License Key"}"#.to_string()
    }
}

fn get_developers_json(db_path: &PathBuf) -> String {
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return "[]".to_string(),
    };
    let mut stmt = conn.prepare("SELECT id, name, device_id, is_online, last_seen_at FROM developers ORDER BY last_seen_at DESC").unwrap();
    let devs: Vec<Developer> = stmt.query_map([], |row| {
        Ok(Developer {
            id: row.get(0)?,
            name: row.get(1)?,
            device_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            is_online: row.get::<_, i32>(3)? == 1,
            last_seen_at: row.get(4)?,
        })
    }).unwrap().filter_map(|r| r.ok()).collect();
    serde_json::to_string(&devs).unwrap_or("[]".into())
}

fn get_stats_json(db_path: &PathBuf) -> String {
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return r#"{"error":"db"}"#.to_string(),
    };
    let total: u32 = conn.query_row("SELECT COUNT(*) FROM developers", [], |r| r.get(0)).unwrap_or(0);
    let online: u32 = conn.query_row("SELECT COUNT(*) FROM developers WHERE is_online=1", [], |r| r.get(0)).unwrap_or(0);
    let reports: u32 = conn.query_row("SELECT COUNT(*) FROM reports", [], |r| r.get(0)).unwrap_or(0);
    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_count: u32 = conn.query_row("SELECT COUNT(*) FROM reports WHERE created_at LIKE ?", [format!("{}%", today)], |r| r.get(0)).unwrap_or(0);
    
    serde_json::json!({
        "total_developers": total,
        "online_developers": online,
        "total_reports": reports,
        "reports_today": today_count
    }).to_string()
}

// ============================================
// TAURI COMMANDS
// ============================================

#[tauri::command]
pub fn initialize_pm(state: State<'_, PmState>) -> Result<bool, String> {
    *state.lock().unwrap() = Some(PmDashboard::new());
    Ok(true)
}

#[tauri::command]
pub fn get_config(state: State<'_, PmState>) -> Result<PmConfig, String> {
    Ok(state.lock().unwrap().as_ref().map(|p| p.config.clone()).unwrap_or_default())
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
        let mut stmt = conn.prepare("SELECT r.id, r.developer_id, d.name, r.description, r.activity_type, r.created_at FROM reports r LEFT JOIN developers d ON r.developer_id = d.id ORDER BY r.created_at DESC LIMIT ?").map_err(|e| e.to_string())?;
        let reports = stmt.query_map([limit], |row| {
            Ok(ActivityReport {
                id: row.get(0)?,
                developer_id: row.get(1)?,
                developer_name: row.get::<_, Option<String>>(2)?.unwrap_or("Unknown".into()),
                description: row.get(3)?,
                activity_type: row.get(4)?,
                created_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        Ok(reports)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn get_reports_by_developer(state: State<'_, PmState>, dev_id: String, limit: u32) -> Result<Vec<ActivityReport>, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let conn = Connection::open(&pm.db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT r.id, r.developer_id, d.name, r.description, r.activity_type, r.created_at FROM reports r JOIN developers d ON r.developer_id = d.id WHERE r.developer_id = ?1 ORDER BY r.created_at DESC LIMIT ?2").map_err(|e| e.to_string())?;
        let reports = stmt.query_map(params![dev_id, limit], |row| {
            Ok(ActivityReport {
                id: row.get(0)?,
                developer_id: row.get(1)?,
                developer_name: row.get(2)?,
                description: row.get(3)?,
                activity_type: row.get(4)?,
                created_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
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
        if *pm.server_running.lock().unwrap() { return Ok("Running".into()); }
        let db = pm.db_path.clone();
        let port = pm.config.server_port;
        let key = pm.config.api_key.clone().unwrap_or_default();
        let running = pm.server_running.clone();
        *running.lock().unwrap() = true;
        let running_clone = running.clone(); // For the bg thread
        
        thread::spawn(move || run_http_server(db, port, key, running));
        
        // Spawn 5-minute Summary Job
        let db_clone = pm.db_path.clone();
        thread::spawn(move || {
            loop {
                // Wait 5 minutes
                thread::sleep(std::time::Duration::from_secs(300));
                
                if !*running_clone.lock().unwrap() { break; }

                // Run Summary
                if let Err(e) = generate_context_summary(&db_clone) {
                    eprintln!("[PM] Summary generation failed: {}", e);
                }
            }
        });

        Ok(format!("Started on {}", port))
    } else { Err("Not initialized".into()) }
}

#[tauri::command]
pub fn stop_server(state: State<'_, PmState>) -> Result<bool, String> {
    *state.lock().unwrap().as_ref().unwrap().server_running.lock().unwrap() = false;
    Ok(true)
}

#[tauri::command]
pub fn get_server_status(state: State<'_, PmState>) -> Result<serde_json::Value, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        Ok(serde_json::json!({
            "running": *pm.server_running.lock().unwrap(),
            "port": pm.config.server_port,
            "apiKey": pm.config.api_key
        }))
    } else { Ok(serde_json::json!({"running":false})) }
}

#[tauri::command]
pub fn generate_api_key(state: State<'_, PmState>) -> Result<String, String> {
    let mut pm = state.lock().unwrap();
    let pm = pm.as_mut().unwrap();
    let key = generate_key();
    pm.config.api_key = Some(key.clone());
    pm.save_config();
    Ok(key)
}

#[tauri::command]
pub fn clear_old_reports(state: State<'_, PmState>, days: Option<u32>) -> Result<u32, String> {
    let pm = state.lock().unwrap();
    let conn = Connection::open(&pm.as_ref().unwrap().db_path).unwrap();
    let d = days.unwrap_or(7);
    Ok(conn.execute("DELETE FROM reports WHERE created_at < datetime('now', ?)", [format!("-{} days", d)]).unwrap() as u32)
}

// OLLAMA COMMANDS SKELETON (Restored)
#[tauri::command]
pub fn check_ollama() -> Result<serde_json::Value, String> {
     use std::process::Command;
     let output = Command::new("ollama").args(["list"]).output();
     match output {
         Ok(o) if o.status.success() => Ok(serde_json::json!({"online":true})),
         _ => Ok(serde_json::json!({"online":false}))
     }
}

#[tauri::command]
pub fn install_ollama() -> Result<serde_json::Value, String> { Ok(serde_json::json!({"message":"Install manual"})) }

#[tauri::command]
pub fn pull_model(_model: String) -> Result<serde_json::Value, String> { Ok(serde_json::json!({"success":true})) }

#[tauri::command]
pub fn start_ollama() -> Result<serde_json::Value, String> { Ok(serde_json::json!({"success":true})) }

#[tauri::command]
pub fn save_remote_report(_state: State<'_, PmState>, _developer_name: String, _device_id: String, _description: String, _activity_type: String, _api_key: Option<String>) -> Result<bool, String> {
    // Simplified logic for restoration
    Ok(true) 
}

#[tauri::command]
pub fn create_team(_state: State<'_, PmState>, _name: String) -> Result<serde_json::Value, String> { Ok(serde_json::json!({})) }

#[tauri::command]
pub fn get_teams(_state: State<'_, PmState>) -> Result<Vec<serde_json::Value>, String> { Ok(vec![]) }

#[tauri::command]
pub fn validate_license_key(_state: State<'_, PmState>, _key: String, _device_id: String, _email: String) -> Result<String, String> { Ok("Success".into()) }

#[tauri::command]
pub fn register_developer_with_key(_state: State<'_, PmState>, _key: String, _device_id: String, _email: String) -> Result<String, String> { Ok("Success".into()) }

// === AUTH COMMANDS ===

#[tauri::command]
pub fn register_user(state: State<'_, PmState>, username: String, password: String) -> Result<bool, String> {
    let pm = state.lock().unwrap();
    let conn = Connection::open(&pm.as_ref().unwrap().db_path).map_err(|e| e.to_string())?;
    let hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO users (username, password_hash) VALUES (?1, ?2)", params![&username, &hash])
        .map_err(|e| if e.to_string().contains("UNIQUE") { "Exists".into() } else { e.to_string() })?;
    Ok(true)
}

#[tauri::command]
pub fn login_user(state: State<'_, PmState>, username: String, password: String) -> Result<String, String> {
    let pm = state.lock().unwrap();
    if let Some(pm) = pm.as_ref() {
        let conn = Connection::open(&pm.db_path).map_err(|e| e.to_string())?;
        let hash: String = conn.query_row("SELECT password_hash FROM users WHERE username = ?", [&username], |r| r.get(0)).map_err(|_| "Invalid auth".to_string())?;
        
        if bcrypt::verify(&password, &hash).unwrap_or(false) {
            let token = uuid::Uuid::new_v4().to_string();
            conn.execute("INSERT INTO sessions (token, username, expires_at) VALUES (?1, ?2, datetime('now', '+30 days'))", params![&token, &username]).map_err(|e| e.to_string())?;
            Ok(token)
        } else {
            Err("Invalid auth".into())
        }
    } else { Err("Not init".into()) }
}

#[tauri::command]
pub fn verify_session(state: State<'_, PmState>, token: String) -> Result<bool, String> {
    let pm = state.lock().unwrap();
    let conn = Connection::open(&pm.as_ref().unwrap().db_path).map_err(|e| e.to_string())?;
    let c: i32 = conn.query_row("SELECT COUNT(*) FROM sessions WHERE token = ? AND expires_at > datetime('now')", [&token], |r| r.get(0)).unwrap_or(0);
    Ok(c > 0)
}

#[tauri::command]
pub fn save_fingerprint_report(state: State<'_, PmState>, developer_name: String, device_id: String, vector: Vec<f32>, dimension: usize, app_name: Option<String>, window_title: Option<String>, ai_summary: Option<String>, timestamp: i64) -> Result<String, String> {
    let pm = state.lock().unwrap();
    let conn = Connection::open(&pm.as_ref().unwrap().db_path).map_err(|e| e.to_string())?;
    let embedding_id = uuid::Uuid::new_v4().to_string();
    let dev_id = device_id.clone();
    let vector_blob = serde_json::to_vec(&vector).map_err(|e| e.to_string())?;
    
    conn.execute("INSERT INTO developers (id, name, device_id, is_online, last_seen_at) VALUES (?1, ?2, ?3, 1, datetime('now')) ON CONFLICT(id) DO UPDATE SET name=?2, is_online=1, last_seen_at=datetime('now')", params![&dev_id, &developer_name, &device_id]).ok();
    
    let desc = ai_summary.unwrap_or_else(|| format!("Active in {}: {}", app_name.unwrap_or("?".into()), window_title.unwrap_or("?".into())));
    
    conn.execute("INSERT INTO reports (developer_id, description, activity_type, created_at) VALUES (?1, ?2, ?3, datetime(?4/1000, 'unixepoch'))", params![&dev_id, desc, "visual_embedding", timestamp]).ok();
    
    conn.execute("INSERT INTO embeddings_raw (embedding_id, device_hash, vector, vector_dimension, captured_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![&embedding_id, &dev_id, &vector_blob, dimension as i64, timestamp]).ok();
    
    Ok(embedding_id)
}

#[tauri::command]
pub fn save_activity_log(state: State<'_, PmState>, developer_name: String, device_id: String, description: String, activity_type: String, timestamp: i64) -> Result<bool, String> {
    let pm = state.lock().unwrap();
    let conn = Connection::open(&pm.as_ref().unwrap().db_path).map_err(|e| e.to_string())?;
    
    // Upsert Developer
    let _ = conn.execute(
        "INSERT INTO developers (id, name, device_id, is_online, last_seen_at) 
         VALUES (?1, ?2, ?3, 1, datetime('now')) 
         ON CONFLICT(id) DO UPDATE SET name=?2, is_online=1, last_seen_at=datetime('now')", 
        params![&device_id, &developer_name, &device_id]
    );
    
    // Insert Report
    let _ = conn.execute(
        "INSERT INTO reports (developer_id, description, activity_type, created_at) 
         VALUES (?1, ?2, ?3, datetime(?4/1000, 'unixepoch'))",
        params![&device_id, &description, &activity_type, timestamp]
    );
    
    Ok(true)
}

#[tauri::command]
pub fn generate_test_data(state: State<'_, PmState>) -> Result<bool, String> {
    let pm = state.lock().unwrap();
    let conn = Connection::open(&pm.as_ref().unwrap().db_path).map_err(|e| e.to_string())?;
    
    // 1. Create Admin User (admin / password123)
    let hash = bcrypt::hash("password123", bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?), (?, ?)",
        params!["admin", &hash, "admin@flowsight.ai", &hash]
    );
    
    // 2. Create Sample Developer
    let _ = conn.execute(
        "INSERT OR IGNORE INTO developers (id, name, device_id, is_online, last_seen_at) 
         VALUES ('dev-mock-1', 'Sarah Dev', 'device-1', 1, datetime('now'))", 
        []
    );
    
    // 3. Create Sample Reports
    let _ = conn.execute(
        "INSERT INTO reports (developer_id, description, activity_type, created_at) VALUES 
        ('dev-mock-1', 'Refactoring Auth Middleware in Rust', 'coding', datetime('now', '-10 minutes')),
        ('dev-mock-1', 'Reviewing Pull Request #42', 'browsing', datetime('now', '-30 minutes')),
        ('dev-mock-1', 'Debugging API Latency', 'terminal', datetime('now', '-1 hour'))",
        []
    );
    
    Ok(true)
}

fn generate_context_summary(db_path: &PathBuf) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // Get reports from last 5 minutes
    let mut stmt = conn.prepare(
        "SELECT description FROM reports 
         WHERE created_at > datetime('now', '-5 minutes') 
         ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;
    
    let descriptions: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
        
    if descriptions.is_empty() { return Ok(()); }
    
    let context = descriptions.join("\n");
    
    // Call Ollama Qwen 3 1.7B
    let client = reqwest::blocking::Client::new();
    let prompt = format!("Summarize the following developer activity log into a single coherent paragraph:\n\n{}", context);
    
    let body = serde_json::json!({
        "model": "qwen3:1.7b",
        "prompt": prompt,
        "stream": false
    });
    
    let resp = client.post("http://localhost:11434/api/generate")
        .json(&body)
        .send();
        
    if let Ok(r) = resp {
        if let Ok(json) = r.json::<serde_json::Value>() {
           if let Some(summary) = json["response"].as_str() {
               println!("[PM] Generated Summary: {}", summary);
               // Store as a specialized report
               let _ = conn.execute(
                   "INSERT INTO reports (developer_id, description, activity_type) VALUES (?, ?, ?)",
                   params!["system", summary, "ai_context_summary"]
               );
           }
        }
    }
    
    Ok(())
}
