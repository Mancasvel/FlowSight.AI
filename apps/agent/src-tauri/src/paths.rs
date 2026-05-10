//! Single source of truth for filesystem paths used by the agent.
//!
//! Motivation: hasta ahora cada módulo (`auth`, `sync`, `jira`, `linear`,
//! `agent`, `main`) construía por su cuenta `dirs::data_local_dir().unwrap().join("FlowSight")`
//! sin garantizar que el directorio existiese. En instalación fresca
//! (pre-login, pre-`initialize_agent`) el directorio no existe y cualquier
//! `Connection::open` o escritura de log fallaba silenciosamente.
//!
//! Todos los paths del runtime del usuario deben pasar por acá. Los paths
//! de recursos read-only bundlados con el instalador de Tauri se resuelven
//! vía `resource_local_llm_dir` y requieren `AppHandle`.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const APP_DIR_NAME: &str = "FlowSight";
const DB_FILE: &str = "dev-agent.db";
const SERVER_LOG_FILE: &str = "server.log";
const AGENT_ERROR_LOG_FILE: &str = "agent_error.log";
const CRASH_LOG_FILE: &str = "crash.log";
const SCREENSHOTS_TMP_DIR: &str = "screenshots_tmp";

/// `%LOCALAPPDATA%\FlowSight\` (creado si no existe).
///
/// Es el único lugar escribible que usamos. Tiene que funcionar igual en dev,
/// en release portable y en instalaciones a `Program Files` (donde el
/// directorio de instalación NO es escribible por el usuario estándar).
pub fn app_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or_else(|| "No local data dir available".to_string())?;
    let dir = base.join(APP_DIR_NAME);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {:?}: {}", dir, e))?;
    }
    Ok(dir)
}

/// Path a `dev-agent.db`. Crea el directorio padre si hace falta.
pub fn db_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(DB_FILE))
}

/// Variante infalible para sitios donde no podemos propagar Result (panic hooks,
/// static init). En ese caso cae a `.` que es subóptimo pero no panica.
pub fn db_path_or_fallback() -> PathBuf {
    db_path().unwrap_or_else(|_| PathBuf::from(DB_FILE))
}

pub fn server_log_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(SERVER_LOG_FILE))
}

pub fn agent_error_log_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(AGENT_ERROR_LOG_FILE))
}

pub fn crash_log_path_or_fallback() -> PathBuf {
    app_data_dir()
        .map(|d| d.join(CRASH_LOG_FILE))
        .unwrap_or_else(|_| PathBuf::from(CRASH_LOG_FILE))
}

/// PNG de captura persistentes solo para depuración; mismo árbol que la BD/logs
/// (`%LOCALAPPDATA%\FlowSight\screenshots_tmp\`), no el Escritorio ni la carpeta de instalación.
pub fn screenshots_tmp_dir() -> Result<PathBuf, String> {
    let dir = app_data_dir()?.join(SCREENSHOTS_TMP_DIR);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {:?}: {}", dir, e))?;
    }
    Ok(dir)
}

/// Resuelve el directorio de recursos bundlados donde vive `local_llm/`.
///
/// En un `.exe` instalado, Tauri descomprime los `bundle.resources` dentro
/// de `<install>\resources\`. En dev, `resource_dir` apunta al target de
/// cargo; por eso para el caso de desarrollo caemos al layout del repo
/// (`<repo-root>\local_llm`) si los bundleados no están.
pub fn resource_local_llm_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir unavailable: {}", e))?;

    let bundled = resource_dir.join("local_llm");
    if bundled.join("bin").join("llama-server.exe").exists() {
        return Ok(bundled);
    }

    // Fallback dev: subir desde apps/agent/src-tauri/target/.../<exe> hasta
    // encontrar `local_llm/bin/llama-server.exe`. Solo se usa en dev.
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        for _ in 0..8 {
            let candidate = dir.join("local_llm");
            if candidate.join("bin").join("llama-server.exe").exists() {
                return Ok(candidate);
            }
            if !dir.pop() {
                break;
            }
        }
    }

    Err(format!(
        "local_llm runtime not found (looked in bundled resources at {:?} and dev tree)",
        bundled
    ))
}
