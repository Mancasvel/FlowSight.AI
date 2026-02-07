use reqwest::blocking::Client;
use std::thread;
use std::time::Duration;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

const SYNC_INTERVAL_MINS: u64 = 10;
const SUPABASE_URL: &str = "https://dzpyrdxelcgfpmcdojvb.supabase.co";
const SUPABASE_KEY: &str = "sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ";

// User session stored locally after login
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub user_id: String,
    pub team_id: Option<String>,
    pub access_token: String,
    pub email: String,
}

pub fn start_sync_thread(db_path: std::path::PathBuf) {
    let path_clone = db_path.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(SYNC_INTERVAL_MINS * 60));
            let _ = perform_sync(&path_clone);
        }
    });
}

#[tauri::command]
pub fn force_sync_now() -> Result<String, String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    match perform_sync(&db_path) {
        Ok(summary) => Ok(format!("Sync Report:\n\n{}", summary)),
        Err(e) => Err(format!("Sync failed: {}", e))
    }
}

// Get user session from local config
fn get_user_session(conn: &Connection) -> Option<UserSession> {
    let mut stmt = conn.prepare(
        "SELECT value FROM config WHERE key = 'user_session'"
    ).ok()?;
    
    let json_str: String = stmt.query_row([], |row| row.get(0)).ok()?;
    serde_json::from_str(&json_str).ok()
}

// Save user session to local config
#[tauri::command]
pub fn save_user_session(user_id: String, team_id: Option<String>, access_token: String, email: String) -> Result<(), String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let session = UserSession { user_id, team_id, access_token, email };
    let json = serde_json::to_string(&session).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('user_session', ?1)",
        [&json]
    ).map_err(|e| e.to_string())?;
    
    println!("[Sync] User session saved for: {}", session.email);
    Ok(())
}

// Clear user session (logout)
#[tauri::command]
pub fn clear_user_session() -> Result<(), String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM config WHERE key = 'user_session'", [])
        .map_err(|e| e.to_string())?;
    
    println!("[Sync] User session cleared");
    Ok(())
}

// Check if user is logged in
#[tauri::command]
pub fn get_current_user() -> Result<Option<UserSession>, String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    Ok(get_user_session(&conn))
}

fn perform_sync(db_path: &std::path::PathBuf) -> Result<String, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // Check if user is logged in
    let session = match get_user_session(&conn) {
        Some(s) => s,
        None => {
            println!("[CloudSync] No user session found. Sync disabled.");
            return Ok("Not logged in - sync disabled".to_string());
        }
    };
    
    // 1. Get Unsynced Reports
    let mut stmt = conn.prepare(
        "SELECT id, description, activity_type, duration_seconds, jira_ticket_id FROM reports WHERE synced = 0 LIMIT 50"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, Option<String>>(4)?
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut ids = Vec::new();
    let mut full_text = String::new();
    let mut total_duration = 0;
    
    // Aggregations
    let mut categories = std::collections::HashMap::new();
    let mut tickets = std::collections::HashMap::new();

    for r in rows {
        if let Ok((id, desc, cat, dur, ticket)) = r {
            ids.push(id);
            full_text.push_str(&format!("- [{}] {}\n", cat, desc));
            total_duration += dur;
            
            // Stats
            *categories.entry(cat).or_insert(0) += dur;
            if let Some(t) = ticket {
                if !t.is_empty() {
                    *tickets.entry(t).or_insert(0) += dur;
                }
            }
        }
    }
    
    if ids.is_empty() {
        println!("[CloudSync] No new reports to sync.");
        return Ok("No new activity to report.".to_string());
    }

    // 2. Generate Summary with Qwen
    println!("[CloudSync] Summarizing {} reports...", ids.len());
    let summary = summarize_with_qwen(&full_text).unwrap_or_else(|_| "Summary generation failed".to_string());
    
    // 3. Upload to Supabase with user authentication
    match upload_session(&session, total_duration, &summary, &categories, &tickets) {
        Ok(_) => {
            println!("[CloudSync] Upload success for user: {}", session.email);
            // Mark as synced
            let id_list = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
            let _ = conn.execute(
                &format!("UPDATE reports SET synced = 1 WHERE id IN ({})", id_list),
                []
            );
        },
        Err(e) => {
            // Check for license errors
            if e.contains("License expired") || e.contains("403") {
                println!("[CloudSync] LICENSE EXPIRED - Sync blocked");
                return Err("License expired. Contact your PM to renew.".to_string());
            }
            
            println!("[CloudSync] Upload failed: {}", e);
            return Ok(format!("(Cloud Upload Failed: {})\n\nLOCAL SUMMARY:\n{}", e, summary));
        }
    }
    
    println!("[CloudSync] Processed {} reports.", ids.len());
    Ok(summary)
}

fn summarize_with_qwen(text: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
        
    let prompt = format!("You are an Activity Summarizer. Below is a list of tasks performed by a developer.
    
    TASKS:
    {}
    
    INSTRUCTIONS:
    - Write a short 1-paragraph summary of what was actually done.
    - ONLY use the information provided in the TASKS list.
    - Do NOT invent or assume any other work.
    - Be concise but specific.
    ", text);
    
    let body = serde_json::json!({
        "model": "qwen3-vl:2b", 
        "messages": [
            { "role": "user", "content": prompt }
        ],
        "stream": false,
        "options": {
            "temperature": 0.3,
            "num_predict": 200
        }
    });
    
    let resp = client.post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
        
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    
    let msg = &json["message"];
    let content = msg["content"].as_str().unwrap_or("");
    let thinking = msg["thinking"].as_str().unwrap_or("");
    
    let final_text = if !content.is_empty() {
        content.to_string()
    } else if !thinking.is_empty() {
        println!("[CloudSync] Using THINKING field for summary.");
        thinking.to_string()
    } else {
        return Err("Model returned empty summary.".to_string());
    };
    
    Ok(final_text)
}

fn upload_session(
    session: &UserSession,
    duration: i32, 
    summary: &str, 
    categories: &std::collections::HashMap<String, i32>,
    tickets: &std::collections::HashMap<String, i32>
) -> Result<(), String> {
    let client = Client::new();
    let url = format!("{}/rest/v1/work_sessions", SUPABASE_URL); 
    
    let body = serde_json::json!({
        "user_id": session.user_id,
        "team_id": session.team_id,
        "duration_seconds": duration,
        "summary": summary,
        "category_breakdown": categories,
        "jira_breakdown": tickets,
        "session_date": chrono::Local::now().format("%Y-%m-%d").to_string(),
        "created_at": chrono::Utc::now().to_rfc3339()
    });

    let resp = client.post(&url)
        .header("apikey", SUPABASE_KEY)
        .header("Authorization", format!("Bearer {}", &session.access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    
    let status = resp.status();
    
    if status.as_u16() == 403 {
        return Err("License expired or invalid".to_string());
    }
    
    if !status.is_success() {
        let body_text = resp.text().unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body_text));
    }
        
    Ok(())
}

// Upload individual activity report (for granular tracking)
#[tauri::command]
pub fn upload_activity_report(
    description: String,
    category: String,
    jira_ticket_id: Option<String>,
    duration_seconds: i32
) -> Result<(), String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let session = get_user_session(&conn)
        .ok_or("Not logged in")?;
    
    let client = Client::new();
    let url = format!("{}/rest/v1/activity_reports", SUPABASE_URL);
    
    let body = serde_json::json!({
        "user_id": session.user_id,
        "team_id": session.team_id,
        "description": description,
        "category": category,
        "jira_ticket_id": jira_ticket_id,
        "duration_seconds": duration_seconds,
        "captured_at": chrono::Utc::now().to_rfc3339()
    });
    
    let resp = client.post(&url)
        .header("apikey", SUPABASE_KEY)
        .header("Authorization", format!("Bearer {}", &session.access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    
    if resp.status().as_u16() == 403 {
        return Err("License expired or invalid".to_string());
    }
    
    resp.error_for_status()
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
