//! Intentional browser protection, independent of telemetry and cloud plans.
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;

use super::{browser_bridge, state, system_quiet};

static CONTROL: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    pub patterns: Vec<String>,
    pub exceptions: Vec<String>,
    pub duration_minutes: u16,
    pub quiet_notifications: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            patterns: vec!["instagram.com".into(), "tiktok.com".into(), "x.com".into()],
            exceptions: Vec::new(),
            duration_minutes: 50,
            quiet_notifications: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub intention: String,
    pub expires_at: String,
    pub patterns: Vec<String>,
    pub exceptions: Vec<String>,
    #[serde(default)]
    pub quiet_notifications: bool,
}

impl Session {
    pub fn is_active(&self) -> bool {
        chrono::DateTime::parse_from_rfc3339(&self.expires_at).is_ok_and(|until| until > Utc::now())
    }
}

fn normalize(pattern: &str) -> Result<String, String> {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.len() > 240 || pattern.chars().any(char::is_whitespace) {
        return Err("Use a domain or HTTP(S) path without spaces.".into());
    }
    let input = if pattern.contains("://") {
        pattern.to_string()
    } else {
        format!("https://{pattern}")
    };
    let url = url::Url::parse(&input).map_err(|_| "Use a valid domain or HTTP(S) path.")?;
    let host = url
        .host_str()
        .ok_or("Use a valid domain or HTTP(S) path.")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
        || !host.contains('.')
        || host.ends_with('.')
        || host.parse::<std::net::IpAddr>().is_ok()
        || host == "localhost"
    {
        return Err(
            "Use a public domain or HTTP(S) path, without a port, query, or fragment.".into(),
        );
    }
    Ok(format!(
        "{}{}",
        host.strip_prefix("www.").unwrap_or(host),
        if url.path() == "/" { "" } else { url.path() }
    ))
}

pub fn validate(mut preferences: Preferences) -> Result<Preferences, String> {
    if !(5..=180).contains(&preferences.duration_minutes)
        || preferences.patterns.is_empty()
        || preferences.patterns.len() > 20
        || preferences.exceptions.len() > 20
    {
        return Err("Choose 5–180 minutes, 1–20 blocked sites, and up to 20 exceptions.".into());
    }
    for list in [&mut preferences.patterns, &mut preferences.exceptions] {
        *list = list
            .iter()
            .map(|item| normalize(item))
            .collect::<Result<Vec<_>, _>>()?;
        list.sort();
        list.dedup();
    }
    Ok(preferences)
}

pub fn policy() -> Result<Option<Session>, String> {
    Ok(state::read()?.total_focus.filter(Session::is_active))
}

#[tauri::command]
pub fn get_total_focus() -> Result<Value, String> {
    let data = state::read()?;
    Ok(
        json!({"preferences":data.total_focus_preferences,"session":policy()?,
        "browser":browser_bridge::focus_status(),"messagingAvailable":false,
        "systemNotificationsAvailable":cfg!(windows),"systemNotificationsQuiet":system_quiet::total_focus_confirmed(),
        "digest":if state::holding_notifications(&data) { Vec::new() } else { data.notification_digest }}),
    )
}

#[tauri::command]
pub fn save_total_focus_preferences(preferences: Preferences) -> Result<Preferences, String> {
    let preferences = validate(preferences)?;
    state::update(|data| {
        data.total_focus_preferences = preferences.clone();
        Ok(())
    })?;
    Ok(preferences)
}

pub fn activate(intention: String, preferences: Preferences) -> Result<Value, String> {
    activate_with(intention, preferences, browser_bridge::focus_status, || {
        browser_bridge::execute("browser.focus_status", &json!({}))
    })
}

fn activate_with(
    intention: String,
    preferences: Preferences,
    status: impl FnOnce() -> Value,
    apply: impl FnOnce() -> Result<Value, String>,
) -> Result<Value, String> {
    let _guard = CONTROL.lock().map_err(|error| error.to_string())?;
    let preferences = validate(preferences)?;
    if intention.trim().is_empty() || intention.chars().count() > 160 {
        return Err("Describe your focus task in 1–160 characters.".into());
    }
    if policy()?.is_some() {
        return Err(
            "Total focus is already active. End it before starting another session.".into(),
        );
    }
    if status()["totalFocusAvailable"] != true {
        return Err(
            "Update Browser Controls in your browser and reconnect it before starting total focus."
                .into(),
        );
    }
    let session = Session {
        id: uuid::Uuid::new_v4().to_string(),
        intention: intention.trim().into(),
        expires_at: (Utc::now() + Duration::minutes(preferences.duration_minutes.into()))
            .to_rfc3339(),
        patterns: preferences.patterns.clone(),
        exceptions: preferences.exceptions.clone(),
        quiet_notifications: preferences.quiet_notifications,
    };
    state::update(|data| {
        data.total_focus = Some(session.clone());
        Ok(())
    })?;
    if cfg!(windows) && session.quiet_notifications {
        if let Err(error) = system_quiet::enable_total_focus(preferences.duration_minutes.into()) {
            clear_session(Some(&session.id))?;
            release_notifications()?;
            return Err(error);
        }
    }
    // The extension reconciles the authoritative policy before returning this ACK.
    let applied = apply();
    match applied {
        Ok(value)
            if value["sessionId"] == session.id
                && value["applied"] == true
                && policy()?.is_some_and(|current| current.id == session.id) =>
        {
            get_total_focus()
        }
        result => {
            clear_session(Some(&session.id))?;
            release_notifications()?;
            Err(result.err().unwrap_or_else(|| {
                "The extension did not apply total focus. Check its connection and try again."
                    .into()
            }))
        }
    }
}

pub fn end() -> Result<Value, String> {
    let _guard = CONTROL.lock().map_err(|error| error.to_string())?;
    clear_session(None)?;
    let notification_warning = release_notifications().err();
    let result = browser_bridge::execute("browser.focus_status", &json!({}));
    Ok(
        json!({"ended":true,"browserReleased":result.as_ref().is_ok_and(|value| value["applied"] == false),
        "warning":result.err(),"notificationWarning":notification_warning,"state":get_total_focus()?}),
    )
}

#[tauri::command]
pub async fn start_total_focus(
    intention: String,
    preferences: Preferences,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || activate(intention, preferences))
        .await
        .map_err(|error| format!("Total focus worker failed: {error}"))?
}

#[tauri::command]
pub async fn end_total_focus() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(end)
        .await
        .map_err(|error| format!("Total focus worker failed: {error}"))?
}

fn clear_session(id: Option<&str>) -> Result<(), String> {
    state::update(|data| {
        if id.is_none()
            || data
                .total_focus
                .as_ref()
                .is_some_and(|session| Some(session.id.as_str()) == id)
        {
            data.total_focus = None;
        }
        Ok(())
    })
}

pub fn cancel_from_extension(id: &str) -> Result<(), String> {
    // Never wait for CONTROL here: the bridge must still acknowledge activation.
    clear_session(Some(id))?;
    if let Ok(_guard) = CONTROL.try_lock() {
        release_notifications()?;
    }
    Ok(())
}

pub fn release_notifications() -> Result<(), String> {
    if policy()?.is_none() && state::read()?.total_focus_quiet.is_some() {
        system_quiet::disable_total_focus()?;
    }
    Ok(())
}

pub fn maintain() -> Result<(), String> {
    let _guard = CONTROL.lock().map_err(|error| error.to_string())?;
    if state::read()?
        .total_focus
        .as_ref()
        .is_some_and(|session| !session.is_active())
    {
        state::update(|data| {
            if data
                .total_focus
                .as_ref()
                .is_some_and(|session| !session.is_active())
            {
                data.total_focus = None;
            }
            Ok(())
        })?;
    }
    release_notifications()
}

#[tauri::command]
pub fn dismiss_total_focus_digest(ids: Vec<String>) -> Result<(), String> {
    state::update(|data| {
        if !state::holding_notifications(data) {
            data.notification_digest
                .retain(|item| !ids.contains(&item.id));
        }
        Ok(())
    })
}

pub fn restore_after_restart() -> Result<(), String> {
    maintain()?;
    if let Some(session) = policy()? {
        if cfg!(windows) && session.quiet_notifications {
            let until = chrono::DateTime::parse_from_rfc3339(&session.expires_at)
                .map_err(|error| error.to_string())?;
            let remaining = ((until.with_timezone(&Utc) - Utc::now()).num_seconds() + 59) / 60;
            system_quiet::enable_total_focus(remaining.max(1))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn start_confirmed() {
        activate_with(
            "Study ADDA".into(),
            Preferences::default(),
            || json!({"totalFocusAvailable":true}),
            || {
                let id = policy()?.unwrap().id;
                Ok(json!({"sessionId":id,"applied":true}))
            },
        )
        .unwrap();
    }

    #[test]
    fn holds_reminders_and_restores_banners_on_emergency_end() {
        let _store = state::TestStore::new();
        system_quiet::mock_banners(Some(0));
        start_confirmed();
        assert_eq!(system_quiet::mocked_banners(), Some(1));
        assert!(state::hold_notification("Return to ADDA", "Saved reminder").unwrap());
        assert!(get_total_focus().unwrap()["digest"]
            .as_array()
            .unwrap()
            .is_empty());
        let id = policy().unwrap().unwrap().id;
        cancel_from_extension("stale-session").unwrap();
        assert!(policy().unwrap().is_some());
        cancel_from_extension(&id).unwrap();
        maintain().unwrap(); // busy activation may defer cleanup to maintenance
        assert_eq!(system_quiet::mocked_banners(), Some(0));
        let digest = get_total_focus().unwrap()["digest"].clone();
        assert_eq!(digest[0]["body"], "Saved reminder");
        // Summary survives reload; only acknowledged IDs are removed.
        dismiss_total_focus_digest(vec!["unknown".into()]).unwrap();
        assert_eq!(get_total_focus().unwrap()["digest"], digest);
        dismiss_total_focus_digest(vec![digest[0]["id"].as_str().unwrap().into()]).unwrap();
        assert!(get_total_focus().unwrap()["digest"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(!state::hold_notification("After focus", "Deliver normally").unwrap());
    }

    #[test]
    fn activation_failure_restores_original_and_allows_retry() {
        let _store = state::TestStore::new();
        system_quiet::mock_banners(None);
        let result = activate_with(
            "Study".into(),
            Preferences::default(),
            || json!({"totalFocusAvailable":true}),
            || Err("DNR install failed".into()),
        );
        assert_eq!(result.unwrap_err(), "DNR install failed");
        assert!(policy().unwrap().is_none());
        assert_eq!(system_quiet::mocked_banners(), None);
        assert!(state::read().unwrap().total_focus_quiet.is_none());
        start_confirmed();
        end().unwrap();
        assert_eq!(system_quiet::mocked_banners(), None);
    }

    #[test]
    fn expires_resumes_on_restart_and_preserves_external_setting_change() {
        let _store = state::TestStore::new();
        system_quiet::mock_banners(Some(0));
        start_confirmed();
        system_quiet::disable_total_focus().unwrap(); // graceful quit
        assert_eq!(system_quiet::mocked_banners(), Some(0));
        restore_after_restart().unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(1));
        state::hold_notification("Reminder", "Do this later").unwrap();
        state::update(|data| {
            data.total_focus.as_mut().unwrap().expires_at =
                (Utc::now() - Duration::seconds(1)).to_rfc3339();
            Ok(())
        })
        .unwrap();
        maintain().unwrap();
        assert!(state::read().unwrap().total_focus.is_none());
        assert_eq!(system_quiet::mocked_banners(), Some(0));
        assert_eq!(
            get_total_focus().unwrap()["digest"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        start_confirmed();
        system_quiet::mock_banners(Some(0)); // user changes Windows setting during focus
        end().unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(0));
    }

    #[test]
    fn overlapping_modes_keep_silence_and_digest_until_last_owner_ends() {
        let _store = state::TestStore::new();
        system_quiet::mock_banners(Some(0));
        system_quiet::enable(Some(30)).unwrap();
        start_confirmed();
        state::hold_notification("Reminder", "Held").unwrap();
        end().unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(1));
        assert!(get_total_focus().unwrap()["digest"]
            .as_array()
            .unwrap()
            .is_empty());
        system_quiet::disable().unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(0));
        start_confirmed();
        system_quiet::enable(Some(30)).unwrap();
        system_quiet::disable().unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(1));
        assert!(state::update(|data| Ok(state::take_released_digest(data)))
            .unwrap()
            .is_empty());
        end().unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(0));
        assert_eq!(
            get_total_focus().unwrap()["digest"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn optional_silence_and_old_saved_preferences_remain_usable() {
        let old: Preferences =
            serde_json::from_value(json!({"patterns":["x.com"],"durationMinutes":25})).unwrap();
        assert!(old.quiet_notifications);
        let _store = state::TestStore::new();
        system_quiet::mock_banners(Some(0));
        activate_with(
            "Study".into(),
            Preferences {
                quiet_notifications: false,
                ..old
            },
            || json!({"totalFocusAvailable":true}),
            || {
                let id = policy()?.unwrap().id;
                Ok(json!({"sessionId":id,"applied":true}))
            },
        )
        .unwrap();
        assert_eq!(system_quiet::mocked_banners(), Some(0));
        assert!(state::hold_notification("Reminder", "Still held").unwrap());
        end().unwrap();
    }
    #[test]
    fn validates_public_sites_and_preserves_path_exceptions() {
        let preferences = validate(Preferences {
            patterns: vec!["HTTPS://YouTube.com".into(), "www.youtube.com".into()],
            exceptions: vec!["youtube.com/watch".into()],
            duration_minutes: 50,
            quiet_notifications: true,
        })
        .unwrap();
        assert_eq!(preferences.patterns, vec!["youtube.com"]);
        assert_eq!(preferences.exceptions, vec!["youtube.com/watch"]);
        for bad in [
            "file:///etc/passwd",
            "127.0.0.1",
            "localhost",
            "https://a.com?x=1",
            "a.com:123",
            "a.com#x",
            "https://user@a.com",
            "a b.com",
        ] {
            assert!(normalize(bad).is_err(), "{bad}");
        }
    }
    #[test]
    fn preferences_bound_duration_and_lists() {
        assert!(validate(Preferences::default()).is_ok());
        assert!(validate(Preferences {
            duration_minutes: 0,
            ..Preferences::default()
        })
        .is_err());
        assert!(validate(Preferences {
            patterns: vec![],
            ..Preferences::default()
        })
        .is_err());
    }
}
