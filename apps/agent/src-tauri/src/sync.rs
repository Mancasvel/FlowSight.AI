use reqwest::blocking::Client;
use std::thread;
use std::time::Duration;
use rusqlite::Connection;

const SYNC_INTERVAL_MINS: u64 = 10;
// Hardcoded for Local Pivot (Env macros fail in this setup without dotenv crate)
const SUPABASE_URL: &str = "https://dzpyrdxelcgfpmcdojvb.supabase.co";
const SUPABASE_KEY: &str = "sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ";

pub fn start_sync_thread(db_path: std::path::PathBuf) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(SYNC_INTERVAL_MINS * 60));
            // thread::sleep(Duration::from_secs(60)); // Debug: 1 minute
            println!("[CloudSync] Starting batch sync...");
            
            if let Err(e) = perform_sync(&db_path) {
                eprintln!("[CloudSync] Error: {}", e);
            }
        }
    });
}

fn perform_sync(db_path: &std::path::PathBuf) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // 1. Get Unsynced Reports
    let mut stmt = conn.prepare(
        "SELECT id, description, category, duration_seconds, jira_ticket_id FROM reports WHERE synced = 0 LIMIT 50"
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
        return Ok(());
    }

    // 2. Generate Summary with Qwen (from Text Logs only)
    let summary = summarize_with_qwen(&full_text).unwrap_or("Summary failed".to_string());
    
    // 3. Upload to Supabase
    upload_session(total_duration, &summary, &categories, &tickets).map_err(|e| e.to_string())?;
    
    // 4. Mark Synced
    // In a real app, verify upload first.
    let id_list = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    conn.execute(
        &format!("UPDATE reports SET synced = 1 WHERE id IN ({})", id_list),
        []
    ).map_err(|e| e.to_string())?;
    
    println!("[CloudSync] Synced {} reports.", ids.len());
    Ok(())
}

fn summarize_with_qwen(text: &str) -> Result<String, String> {
    let client = Client::new();
    let prompt = format!("Summarize this developer activity log into a concise 1-paragraph standup report:\n\n{}", text);
    
    let body = serde_json::json!({
        "model": "qwen3:1.7b", 
        "prompt": prompt,
        "stream": false
    });
    
    let resp = client.post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
        
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    Ok(json["response"].as_str().unwrap_or("No response").to_string())
}

fn upload_session(
    duration: i32, 
    summary: &str, 
    categories: &std::collections::HashMap<String, i32>,
    tickets: &std::collections::HashMap<String, i32>
) -> Result<(), reqwest::Error> {
    let client = Client::new();
    let url = format!("{}/rest/v1/work_sessions", SUPABASE_URL); 
    
    let body = serde_json::json!({
        "user_id": whoami::username(),
        "duration_seconds": duration,
        "summary": summary,
        "category_breakdown": categories,
        "jira_breakdown": tickets,
        "created_at": chrono::Utc::now().to_rfc3339()
    });

    client.post(&url)
        .header("apikey", SUPABASE_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_KEY))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&body)
        .send()?
        .error_for_status()?;
        
    Ok(())
}
