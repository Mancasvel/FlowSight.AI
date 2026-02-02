use active_win_pos_rs::get_active_window;
use std::path::PathBuf;
use std::process::Command;

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct SystemContext {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct GitContext {
    pub branch: Option<String>,
    pub last_commit_msg: Option<String>,
    pub is_dirty: bool,
}

pub fn get_system_context() -> SystemContext {
    match get_active_window() {
        Ok(window) => {
            let app = Some(window.app_name);
            let title = Some(window.title.clone());
            
            // Heuristic: Extract filename from title
            // VS Code: "filename.rs - Project - VS Code"
            // IntelliJ: "filename.rs [Project] - ..."
            let file_name = if let Some(t) = &title {
                if t.contains(" - ") {
                    t.split(" - ").next().map(|s| s.trim().to_string())
                } else {
                    None
                }
            } else {
                None
            };

            SystemContext {
                app_name: app,
                window_title: title,
                file_name,
                file_path: None, // Hard to get full path from title alone reliably
            }
        },
        Err(_) => SystemContext::default()
    }
}

pub fn get_git_context(cwd: &str) -> Option<GitContext> {
    let path = PathBuf::from(cwd);
    if !path.exists() { return None; }

    // 1. Get Branch
    let branch = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&path)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

    // If not a git repo, return None
    if branch.is_none() { return None; }

    // 2. Check Dirty Status
    let is_dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&path)
        .output()
        .ok()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);

    // 3. Last Commit
    let last_commit_msg = Command::new("git")
        .args(["log", "-1", "--pretty=%B"])
        .current_dir(&path)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

    Some(GitContext {
        branch,
        last_commit_msg,
        is_dirty,
    })
}
