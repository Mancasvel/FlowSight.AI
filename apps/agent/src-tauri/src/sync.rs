use reqwest::blocking::Client;
use std::thread;
use std::time::Duration;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

const SYNC_INTERVAL_MINS: u64 = 10;

fn get_supabase_url() -> String {
    std::env::var("VITE_SUPABASE_URL").unwrap_or_else(|_| "https://dzpyrdxelcgfpmcdojvb.supabase.co".to_string())
}

fn get_supabase_key() -> String {
    std::env::var("VITE_SUPABASE_PUBLIC_KEY").unwrap_or_else(|_| "sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ".to_string())
}

// User session stored locally after login
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub user_id: String,
    pub team_id: Option<String>,
    pub access_token: String,
    pub refresh_token: Option<String>,
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
    // 1. Try 'user_session' (Internal sync session)
    let res: Result<String, _> = conn.query_row(
        "SELECT value FROM config WHERE key = 'user_session'",
        [],
        |row| row.get(0)
    );
    
    if let Ok(json_str) = res {
        if let Ok(s) = serde_json::from_str(&json_str) {
            return Some(s);
        }
    }
    
    // 2. Fallback to 'auth_session' (OAuth session from auth.rs)
    let res_auth: Result<String, _> = conn.query_row(
        "SELECT value FROM config WHERE key = 'auth_session'",
        [],
        |row| row.get(0)
    );
    
    if let Ok(json_str) = res_auth {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json_str) {
            return Some(UserSession {
                user_id: v["user"]["id"].as_str()?.to_string(),
                team_id: None,
                access_token: v["access_token"].as_str()?.to_string(),
                refresh_token: v["refresh_token"].as_str().map(|t| t.to_string()),
                email: v["user"]["email"].as_str()?.to_string(),
            });
        }
    }
    
    None
}

// Save user session to local config
#[tauri::command]
pub fn save_user_session(user_id: String, team_id: Option<String>, access_token: String, refresh_token: Option<String>, email: String) -> Result<(), String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let session = UserSession { user_id, team_id, access_token, refresh_token, email };
    let json = serde_json::to_string(&session).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('user_session', ?1)",
        [&json]
    ).map_err(|e| e.to_string())?;
    
    println!("[Sync] User session saved for: {}", session.email);
    Ok(())
}

fn refresh_supabase_token(session: &UserSession) -> Result<UserSession, String> {
    let refresh_token = session.refresh_token.as_ref().ok_or("No refresh token available in session")?;
    
    println!("[Sync] Attempting token refresh using token starting with: {}...", &refresh_token[..10]);
    let client = Client::new();
    let url = format!("{}/auth/v1/token?grant_type=refresh_token", get_supabase_url());
    
    let resp = client.post(&url)
        .header("apikey", get_supabase_key())
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .map_err(|e| e.to_string())?;
        
    let status = resp.status();
    if !status.is_success() {
        let err_body = resp.text().unwrap_or_default();
        println!("[Sync] Refresh failed: {}", err_body);
        return Err(format!("Refresh failed (HTTP {}): {}", status, err_body));
    }
    
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let new_access = json["access_token"].as_str().ok_or("Missing access_token in refresh response")?;
    let new_refresh = json["refresh_token"].as_str();
    
    let mut new_session = session.clone();
    new_session.access_token = new_access.to_string();
    if let Some(r) = new_refresh {
        new_session.refresh_token = Some(r.to_string());
    }
    
    // Save updated session
    save_user_session(
        new_session.user_id.clone(),
        new_session.team_id.clone(),
        new_session.access_token.clone(),
        new_session.refresh_token.clone(),
        new_session.email.clone()
    )?;
    
    Ok(new_session)
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
    let url = format!("{}/rest/v1/work_sessions", get_supabase_url()); 
    
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
        .header("apikey", get_supabase_key())
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
    let url = format!("{}/rest/v1/activity_reports", get_supabase_url());
    
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
        .header("apikey", get_supabase_key())
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

// Join a team using an invitation token
#[tauri::command]
pub fn join_team(token: String) -> Result<serde_json::Value, String> {
    let db_path = dirs::data_local_dir().unwrap().join("FlowSight").join("dev-agent.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let session = get_user_session(&conn)
        .ok_or("Not logged in. Please sign in first.")?;
    
    let client = Client::new();
    let mut current_token = session.access_token.clone();
    
    // 1. Fetch current user info (Retry on 401)
    println!("[Team] Fetching user info for profile sync...");
    let mut user_resp = client.get(format!("{}/auth/v1/user", get_supabase_url()))
        .header("apikey", get_supabase_key())
        .header("Authorization", format!("Bearer {}", current_token))
        .send()
        .map_err(|e| e.to_string())?;
        
    if user_resp.status().as_u16() == 401 || user_resp.status().as_u16() == 403 {
        println!("[Team] JWT might be expired (HTTP {}), attempting refresh...", user_resp.status());
        if let Ok(new_s) = refresh_supabase_token(&session) {
            current_token = new_s.access_token.clone();
            user_resp = client.get(format!("{}/auth/v1/user", get_supabase_url()))
                .header("apikey", get_supabase_key())
                .header("Authorization", format!("Bearer {}", current_token))
                .send()
                .map_err(|e| e.to_string())?;
        }
    }
    
    let user_json: serde_json::Value = user_resp.json().map_err(|e| e.to_string())?;
    let meta = &user_json["user_metadata"];
    let display_name = meta["full_name"].as_str().or(meta["name"].as_str()).unwrap_or("User");
    let avatar_url = meta["avatar_url"].as_str();
    
    let user_id_from_jwt_owned = user_json["id"].as_str().unwrap_or(&session.user_id).to_string();
    let user_id_from_jwt = &user_id_from_jwt_owned;
    println!("[Team] Syncing profile for user {} (JWT id: {})", session.user_id, user_id_from_jwt);
    
    // 2. Ensure profile exists (Upsert)
    let profile_url = format!("{}/rest/v1/profiles", get_supabase_url());
    let prof_resp = client.post(&profile_url)
        .header("apikey", get_supabase_key())
        .header("Authorization", format!("Bearer {}", current_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(&serde_json::json!({
            "id": user_id_from_jwt,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "role": "worker"
        }))
        .send();
        
    match prof_resp {
        Ok(r) if !r.status().is_success() => {
            println!("[Team] Profile upsert failed (HTTP {}): {}", r.status(), r.text().unwrap_or_default());
        }
        Err(e) => println!("[Team] Profile upsert request error: {}", e),
        _ => println!("[Team] Profile synced successfully"),
    }

    // 3. Verify invitation (Retry on 401)
    println!("[Team] Validating invitation token: {}", token);
    let inv_url = format!("{}/rest/v1/invitations?token=eq.{}&select=team_id,expires_at,used_at,created_by,email", get_supabase_url(), token);
    
    let mut inv_resp = client.get(&inv_url)
        .header("apikey", get_supabase_key())
        .header("Authorization", format!("Bearer {}", current_token))
        .send()
        .map_err(|e| e.to_string())?;
        
    if inv_resp.status().as_u16() == 401 || inv_resp.status().as_u16() == 403 {
         if let Ok(new_s) = refresh_supabase_token(&session) {
            current_token = new_s.access_token.clone();
            inv_resp = client.get(&inv_url)
                .header("apikey", get_supabase_key())
                .header("Authorization", format!("Bearer {}", current_token))
                .send()
                .map_err(|e| e.to_string())?;
        }
    }
    
    let inv_status = inv_resp.status();
    if !inv_status.is_success() {
        let err_body = inv_resp.text().unwrap_or_else(|_| "Empty body".to_string());
        return Err(format!("Error validating invitation (HTTP {}): {}", inv_status, err_body));
    }
    
    let invitations: Vec<serde_json::Value> = inv_resp.json().map_err(|e| e.to_string())?;
    let invitation = invitations.get(0).ok_or("Invalid invitation token")?;
    
    println!("[Team] Invitation details: {:?}", invitation);
    let inv_email = invitation["email"].as_str();
    println!("[Team] Analyzing match: Session Email '{}' vs Invitation Email '{:?}'", session.email, inv_email);
    
    if !invitation["used_at"].is_null() {
        return Err("This invitation has already been used".to_string());
    }
    
    let team_id = invitation["team_id"].as_str().ok_or("Malformed invitation (missing team_id)")?;
    let inviter_id = invitation["created_by"].as_str();
    
    // 4. Add to team_members (Retry on 401)
    println!("[Team] Adding user {} to team {} (role: member, omitting invited_by)", user_id_from_jwt, team_id);
    let member_url = format!("{}/rest/v1/team_members", get_supabase_url());
    let member_body = serde_json::json!({
        "team_id": team_id,
        "user_id": user_id_from_jwt,
        "role": "member",
        "joined_at": chrono::Utc::now().to_rfc3339()
    });
    
    let mut member_resp = client.post(&member_url)
        .header("apikey", get_supabase_key())
        .header("Authorization", format!("Bearer {}", current_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&member_body)
        .send()
        .map_err(|e| e.to_string())?;
    
    if member_resp.status().as_u16() == 401 || member_resp.status().as_u16() == 403 {
        if let Ok(new_s) = refresh_supabase_token(&session) {
            current_token = new_s.access_token.clone();
            member_resp = client.post(&member_url)
                .header("apikey", get_supabase_key())
                .header("Authorization", format!("Bearer {}", current_token))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
                .json(&member_body)
                .send()
                .map_err(|e| e.to_string())?;
        }
    }
        
    let member_status = member_resp.status();
    if !member_status.is_success() {
        let err_text = member_resp.text().unwrap_or_else(|_| "Unknown RLS/DB error".to_string());
        if err_text.contains("unique_team_user") || err_text.contains("duplicate") {
            // Already a member
        } else {
            return Err(format!("Failed to join team: {}", err_text));
        }
    }
    
    // 5. Mark invitation as used
    let mark_url = format!("{}/rest/v1/invitations?token=eq.{}", get_supabase_url(), token);
    let _ = client.patch(&mark_url)
        .header("apikey", get_supabase_key())
        .header("Authorization", format!("Bearer {}", current_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "used_at": chrono::Utc::now().to_rfc3339() }))
        .send();
    
    // 6. Get final state for local session
    let updated_session = get_user_session(&conn).unwrap_or(session);
    save_user_session(
        updated_session.user_id.clone(), 
        Some(team_id.to_string()), 
        updated_session.access_token.clone(), 
        updated_session.refresh_token.clone(), 
        updated_session.email.clone()
    )?;
    
    Ok(serde_json::json!({ "success": true, "team_id": team_id }))
}
