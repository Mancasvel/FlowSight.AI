//! Local, opt-in reminders based on observed activity, without sensitive titles.

use chrono::Local;
use rusqlite::Connection;
use std::collections::{HashSet, VecDeque};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[cfg(desktop)]
use tauri_plugin_notification::NotificationExt;

const SWITCH_WINDOW: Duration = Duration::from_secs(10 * 60);
const MIN_SWITCH_SPAN: Duration = Duration::from_secs(3 * 60);
const ALERT_COOLDOWN: Duration = Duration::from_secs(30 * 60);
const SHARED_COOLDOWN: Duration = Duration::from_secs(10 * 60);
const SWITCH_THRESHOLD: usize = 12;

#[derive(Default)]
struct AlertState {
    enabled: bool,
    monitoring: bool,
    last_app: Option<String>,
    switches: VecDeque<(Instant, String)>,
    distraction_day: String,
    distraction_events: usize,
    last_switch_alert: Option<Instant>,
    last_distraction_alert: Option<Instant>,
    last_alert: Option<Instant>,
}

static STATE: OnceLock<Mutex<AlertState>> = OnceLock::new();

fn state() -> &'static Mutex<AlertState> {
    STATE.get_or_init(|| Mutex::new(AlertState::default()))
}

fn cooldown_elapsed(last: Option<Instant>, now: Instant, duration: Duration) -> bool {
    last.map_or(true, |last| now.saturating_duration_since(last) >= duration)
}

fn context_churn(switches: &VecDeque<(Instant, String)>, now: Instant) -> bool {
    if switches.len() < SWITCH_THRESHOLD {
        return false;
    }
    let Some((first, _)) = switches.front() else {
        return false;
    };
    if now.saturating_duration_since(*first) < MIN_SWITCH_SPAN {
        return false;
    }
    switches
        .iter()
        .map(|(_, app)| app.as_str())
        .collect::<HashSet<_>>()
        .len()
        >= 3
}

pub fn set_enabled(enabled: bool) {
    let mut guard = state().lock().unwrap_or_else(|error| error.into_inner());
    guard.enabled = enabled;
    guard.last_app = None;
    guard.switches.clear();
}

pub fn start_monitoring(db_path: &Path) {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let baseline = Connection::open(db_path)
        .ok()
        .and_then(|conn| crate::focus_semantics::summarize_from_db(&conn, &today, &today).ok())
        .map(|summary| summary.distraction_events)
        .unwrap_or(0);
    let mut guard = state().lock().unwrap_or_else(|error| error.into_inner());
    guard.monitoring = true;
    guard.last_app = None;
    guard.switches.clear();
    guard.distraction_day = today;
    guard.distraction_events = baseline;
}

pub fn stop_monitoring() {
    let mut guard = state().lock().unwrap_or_else(|error| error.into_inner());
    guard.monitoring = false;
    guard.last_app = None;
    guard.switches.clear();
}

pub fn excluded_app_entered() {
    let mut guard = state().lock().unwrap_or_else(|error| error.into_inner());
    guard.last_app = None;
    guard.switches.clear();
}

pub fn record_app_switch(app: &tauri::AppHandle, app_name: &str) {
    let now = Instant::now();
    let normalized = app_name.trim().to_ascii_lowercase();
    static OWN_EXE: OnceLock<String> = OnceLock::new();
    let own_exe = OWN_EXE.get_or_init(|| {
        std::env::current_exe()
            .ok()
            .and_then(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_ascii_lowercase())
            })
            .unwrap_or_default()
    });
    if normalized.is_empty() || normalized == *own_exe {
        return;
    }
    let should_send = {
        let mut guard = state().lock().unwrap_or_else(|error| error.into_inner());
        if !guard.enabled || !guard.monitoring {
            return;
        }
        if guard.last_app.as_deref() == Some(normalized.as_str()) {
            return;
        }
        if guard.last_app.replace(normalized.clone()).is_none() {
            return;
        }
        guard.switches.push_back((now, normalized));
        while guard
            .switches
            .front()
            .is_some_and(|(time, _)| now.saturating_duration_since(*time) > SWITCH_WINDOW)
        {
            guard.switches.pop_front();
        }
        let ready = context_churn(&guard.switches, now)
            && cooldown_elapsed(guard.last_switch_alert, now, ALERT_COOLDOWN)
            && cooldown_elapsed(guard.last_alert, now, SHARED_COOLDOWN);
        if ready {
            guard.last_switch_alert = Some(now);
            guard.last_alert = Some(now);
        }
        ready
    };
    if should_send {
        send_notification(
            app,
            "Many app switches",
            "You've switched among several apps frequently. Consider choosing one task for the next few minutes.",
        );
    }
}

pub fn review_browsing_report(
    app: &tauri::AppHandle,
    db_path: &Path,
    category: &str,
    duration_seconds: u64,
) {
    if duration_seconds == 0 || !category.eq_ignore_ascii_case("Browsing") {
        return;
    }
    let today = Local::now().format("%Y-%m-%d").to_string();
    let count = Connection::open(db_path)
        .ok()
        .and_then(|conn| crate::focus_semantics::summarize_from_db(&conn, &today, &today).ok())
        .map(|summary| summary.distraction_events);
    let Some(count) = count else { return };
    let now = Instant::now();
    let should_send = {
        let mut guard = state().lock().unwrap_or_else(|error| error.into_inner());
        if !guard.monitoring || !guard.enabled {
            return;
        }
        if guard.distraction_day != today {
            guard.distraction_day = today;
            guard.distraction_events = 0;
        }
        let is_new_episode = count > guard.distraction_events;
        guard.distraction_events = count;
        let ready = is_new_episode
            && cooldown_elapsed(guard.last_distraction_alert, now, ALERT_COOLDOWN)
            && cooldown_elapsed(guard.last_alert, now, SHARED_COOLDOWN);
        if ready {
            guard.last_distraction_alert = Some(now);
            guard.last_alert = Some(now);
        }
        ready
    };
    if should_send {
        send_notification(
            app,
            "A gentle focus reminder",
            "Non-work browsing has lasted at least two minutes. Ready to return to your task?",
        );
    }
}

fn send_notification(app: &tauri::AppHandle, title: &str, body: &str) {
    // A preference or tracking stop can race with the foreground callback.
    let guard = state().lock().unwrap_or_else(|error| error.into_inner());
    if !guard.enabled || !guard.monitoring {
        return;
    }
    drop(guard);
    #[cfg(desktop)]
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        log::warn!("[FocusAlerts] Could not show notification: {error}");
    }
    #[cfg(not(desktop))]
    let _ = (app, title, body);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_windows_in_one_app_do_not_count_as_context_churn() {
        let now = Instant::now();
        let switches = (0..12)
            .map(|index| {
                (
                    now - Duration::from_secs((12 - index as u64) * 20),
                    "browser.exe".into(),
                )
            })
            .collect();
        assert!(!context_churn(&switches, now));
    }

    #[test]
    fn context_churn_needs_multiple_apps_and_sustained_switching() {
        let now = Instant::now();
        let sustained = (0..12)
            .map(|index| {
                (
                    now - Duration::from_secs((12 - index as u64) * 20),
                    ["editor.exe", "browser.exe", "chat.exe"][index % 3].into(),
                )
            })
            .collect();
        assert!(context_churn(&sustained, now));
        let burst = (0..12)
            .map(|index| {
                (
                    now - Duration::from_secs((12 - index as u64) * 5),
                    ["editor.exe", "browser.exe", "chat.exe"][index % 3].into(),
                )
            })
            .collect();
        assert!(!context_churn(&burst, now));
    }

    #[test]
    fn cooldown_prevents_repeat_reminders() {
        let now = Instant::now();
        assert!(!cooldown_elapsed(
            Some(now - Duration::from_secs(60)),
            now,
            ALERT_COOLDOWN
        ));
        assert!(cooldown_elapsed(
            Some(now - ALERT_COOLDOWN),
            now,
            ALERT_COOLDOWN
        ));
    }
}
