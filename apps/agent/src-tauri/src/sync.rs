use reqwest::blocking::Client;
use std::thread;
use std::time::Duration;
use rusqlite::Connection;

const SYNC_INTERVAL_MINS: u64 = 10;
// Hardcoded for Local Pivot (Env macros fail in this setup without dotenv crate)
const SUPABASE_URL: &str = "https://dzpyrdxelcgfpmcdojvb.supabase.co";
const SUPABASE_KEY: &str = "sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ";

pub fn start_sync_thread(db_path: std::path::PathBuf) {
    let path_clone = db_path.clone();
    thread::spawn(move || {
        loop {
             // ... existing loop
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

fn perform_sync(db_path: &std::path::PathBuf) -> Result<String, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // 1. Get Unsynced Reports
    // Note: DB column is "activity_type", but struct usually expects category. We alias it.
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

    // 2. Generate Summary with Qwen (from Text Logs only)
    println!("[CloudSync] Summarizing text:\n{}", full_text); // DEBUG
    let summary = summarize_with_qwen(&full_text).unwrap_or("Summary generation failed".to_string());
    
    // 3. Upload to Supabase (Best Effort)
    match upload_session(total_duration, &summary, &categories, &tickets) {
        Ok(_) => {
            println!("[CloudSync] Upload success.");
            // 4. Mark Synced ONLY if upload succeeded
            let id_list = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
            let _ = conn.execute(
                &format!("UPDATE reports SET synced = 1 WHERE id IN ({})", id_list),
                []
            );
        },
        Err(e) => {
            println!("[CloudSync] Upload failed (Supabase 404 or other): {}", e);
            println!("[CloudSync] Continuing locally...");
            // We DO NOT mark as synced so we try again later? 
            // Or do we mark as synced to avoid infinite retries of same data?
            // For now, let's NOT mark synced so it retries when cloud is fixed.
            return Ok(format!("(Cloud Upload Failed: {})\n\nLOCAL SUMMARY:\n{}", e, summary));
        }
    }
    
    println!("[CloudSync] Processed {} reports.", ids.len());
    Ok(summary)
}

fn summarize_with_qwen(text: &str) -> Result<String, String> {
    let client = Client::new();
    let prompt = format!("You are an Activity Summarizer. Below is a list of tasks performed by a developer.
    
    TASKS:
    {}
    
    INSTRUCTIONS:
    - Write a short 1-paragraph summary of what was actually done.
    - ONLY use the information provided in the TASKS list.
    - Do NOT invent or assume any other work.
    - If the logs are about 'Fixing Agent Start Logic', say that.
    ", text);
    
    let body = serde_json::json!({
        "model": "qwen3-vl:2b", 
        "messages": [
            { "role": "user", "content": prompt }
        ],
        "stream": false
    });
    
    let resp = client.post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
        
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    
    // Parse Logic with Thinking Fallback
    let msg = &json["message"];
    let content = msg["content"].as_str().unwrap_or("");
    let thinking = msg["thinking"].as_str().unwrap_or("");
    
    let final_text = if !content.is_empty() {
        content.to_string()
    } else if !thinking.is_empty() {
        println!("[CloudSync] Using THINKING field for summary.");
        thinking.to_string()
    } else {
        println!("[CloudSync] Empty summary. JSON: {:?}", json);
        return Err("Model returned empty summary.".to_string());
    };
    
    Ok(final_text)
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
