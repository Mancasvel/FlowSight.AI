// Rust wrapper para Python CLIP encoder
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct SemanticFingerprint {
    pub vector: Vec<f32>,
    pub dimension: usize,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct PythonError {
    error: String,
}

pub fn generate_fingerprint(screenshot_path: &PathBuf) -> Result<SemanticFingerprint, String> {
    // Determine path to python script
    // IN DEV: It's relative to crate root: ../python/semantic_fingerprint.py
    // IN PROD: We need to bundle it (TODO)
    
    let script_path = PathBuf::from("../python/semantic_fingerprint.py");
    let script_abs = std::fs::canonicalize(&script_path)
        .map_err(|e| format!("Script not found at {:?}: {}", script_path, e))?;

    // Prepare command
    // NOTE: Requires 'python' in PATH with dependencies installed
    let output = Command::new("python")
        .arg(&script_abs)
        .arg(screenshot_path)
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!("Python execution failed: {}. Stderr: {}", stdout, stderr));
    }
    
    // Check for "error" key in JSON even if exit code is 0
    if stdout.trim().is_empty() {
         return Err(format!("Empty output from Python. Stderr: {}", stderr));
    }

    if let Ok(err_obj) = serde_json::from_str::<PythonError>(&stdout) {
        return Err(format!("Python Script Error: {}", err_obj.error));
    }
    
    // Parse success
    let fingerprint: SemanticFingerprint = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {} | Output: {}", e, stdout))?;
    
    Ok(fingerprint)
}
