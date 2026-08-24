//! OS-protected storage for secrets that still need to live in SQLite.
//!
//! FlowSight currently ships on Windows. Secret values are encrypted with
//! Windows DPAPI in the current-user scope before they are written to the
//! `config` table. Existing plaintext values are migrated on first read.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};

const PREFIX: &str = "dpapi:v1:";

pub fn save_secret(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let protected = protect(value.as_bytes())?;
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)",
        params![key, format!("{PREFIX}{}", BASE64.encode(protected))],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn load_secret(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM config WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let Some(stored) = stored else {
        return Ok(None);
    };
    if let Some(encoded) = stored.strip_prefix(PREFIX) {
        let ciphertext = BASE64
            .decode(encoded)
            .map_err(|_| "Stored credential is corrupt.".to_string())?;
        let plaintext = unprotect(&ciphertext)?;
        return String::from_utf8(plaintext)
            .map(Some)
            .map_err(|_| "Stored credential is not valid UTF-8.".to_string());
    }

    // One-time migration for installations created before encrypted storage.
    save_secret(conn, key, &stored)?;
    Ok(Some(stored))
}

pub fn delete_secret(conn: &Connection, key: &str) -> Result<(), String> {
    conn.execute("DELETE FROM config WHERE key = ?1", params![key])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(windows)]
fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::addr_of;
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: plain
            .len()
            .try_into()
            .map_err(|_| "Credential is too large.".to_string())?,
        pbData: plain.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            addr_of!(input),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err(format!(
            "Windows could not protect the credential: {}",
            std::io::Error::last_os_error()
        ));
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData as HLOCAL) };
    Ok(bytes)
}

#[cfg(windows)]
fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::addr_of;
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: ciphertext
            .len()
            .try_into()
            .map_err(|_| "Credential is too large.".to_string())?,
        pbData: ciphertext.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            addr_of!(input),
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err(
            "This credential cannot be decrypted for the current Windows user.".to_string(),
        );
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData as HLOCAL) };
    Ok(bytes)
}

#[cfg(not(windows))]
fn protect(_plain: &[u8]) -> Result<Vec<u8>, String> {
    Err("Secure credential persistence is currently supported only on Windows.".to_string())
}

#[cfg(not(windows))]
fn unprotect(_ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    Err("Secure credential persistence is currently supported only on Windows.".to_string())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn secret_roundtrip_is_not_plaintext() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT)", [])
            .unwrap();
        save_secret(&conn, "session", "very-secret-token").unwrap();
        let raw: String = conn
            .query_row("SELECT value FROM config WHERE key='session'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(raw.starts_with(PREFIX));
        assert!(!raw.contains("very-secret-token"));
        assert_eq!(
            load_secret(&conn, "session").unwrap().as_deref(),
            Some("very-secret-token")
        );
    }
}
