use serde::{Deserialize, Serialize};
use reqwest::blocking::Client;
use rusqlite::Connection;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,  // e.g., "ENG-123"
    pub title: String,
    pub state: String,
}

fn get_db_conn() -> Result<Connection, String> {
    let db_path = dirs::data_local_dir()
        .unwrap()
        .join("FlowSight")
        .join("dev-agent.db");
    Connection::open(db_path).map_err(|e| e.to_string())
}

fn get_linear_token() -> Result<String, String> {
    let conn = get_db_conn()?;
    
    // Get auth session from config
    let json: String = conn.query_row(
        "SELECT value FROM config WHERE key = 'auth_session'",
        [],
        |row| row.get(0)
    ).map_err(|_| "Not logged in with Linear".to_string())?;
    
    let session: serde_json::Value = serde_json::from_str(&json)
        .map_err(|_| "Invalid session".to_string())?;
    
    if session["provider"].as_str() != Some("linear") {
        return Err("Not logged in with Linear".to_string());
    }
    
    session["access_token"]
        .as_str()
        .map(String::from)
        .ok_or("No access token".to_string())
}

#[tauri::command]
pub fn fetch_linear_tasks() -> Result<Vec<LinearIssue>, String> {
    let access_token = get_linear_token()?;
    
    let client = Client::new();
    
    // GraphQL query to get assigned issues
    let query = r#"{
        "query": "query { viewer { assignedIssues(first: 50, filter: { state: { type: { nin: [\"completed\", \"canceled\"] } } }) { nodes { id identifier title state { name } } } } }"
    }"#;
    
    let resp = client.post("https://api.linear.app/graphql")
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json")
        .body(query)
        .send()
        .map_err(|e| format!("Linear API error: {}", e))?;
    
    if !resp.status().is_success() {
        return Err(format!("Linear API failed: {}", resp.status()));
    }
    
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    
    let mut issues = Vec::new();
    
    if let Some(nodes) = json["data"]["viewer"]["assignedIssues"]["nodes"].as_array() {
        for node in nodes {
            issues.push(LinearIssue {
                id: node["id"].as_str().unwrap_or_default().to_string(),
                identifier: node["identifier"].as_str().unwrap_or_default().to_string(),
                title: node["title"].as_str().unwrap_or_default().to_string(),
                state: node["state"]["name"].as_str().unwrap_or("Unknown").to_string(),
            });
        }
    }
    
    println!("[Linear] Fetched {} issues", issues.len());
    Ok(issues)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LinearUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_url: Option<String>,
}

#[tauri::command]
pub fn fetch_linear_profile() -> Result<LinearUser, String> {
    let access_token = get_linear_token()?;
    
    let client = Client::new();
    
    let query = r#"{"query": "{ viewer { id name email avatarUrl } }"}"#;
    
    let resp = client.post("https://api.linear.app/graphql")
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json")
        .body(query)
        .send()
        .map_err(|e| format!("Linear API error: {}", e))?;
    
    if !resp.status().is_success() {
        return Err(format!("Linear API failed: {}", resp.status()));
    }
    
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let viewer = &json["data"]["viewer"];
    
    Ok(LinearUser {
        id: viewer["id"].as_str().unwrap_or_default().to_string(),
        name: viewer["name"].as_str().unwrap_or_default().to_string(),
        email: viewer["email"].as_str().unwrap_or_default().to_string(),
        avatar_url: viewer["avatarUrl"].as_str().map(String::from),
    })
}
