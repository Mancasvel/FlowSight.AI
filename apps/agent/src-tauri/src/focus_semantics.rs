//! Canonical, privacy-first Deep Focus semantics.
//!
//! `Deep Focus` is an observable continuity proxy, not phenomenological flow.
//! This module is the only place allowed to classify focus roles or segment
//! sessions. Renderers and coaches consume [`FocusSummary`] and must not
//! reimplement the detector.
//!
//! Evidence-to-decision log (policy v1; full details live in tests/names):
//! - Csikszentmihalyi & LeFevre, 1989, JPSP, "Optimal Experience in Work and
//!   Leisure". Signal: ESM; N=78 workers/~4,800 reports. Finding: flow also
//!   requires subjective challenge/skill and concentration. Limitation: old,
//!   small US sample. Change: proxy disclaimer; never claim detected flow.
//!   Confidence: high.
//! - Fong, Zaleski & Leach, 2015, J Positive Psychology, challenge-skill
//!   meta-analysis. Signal: self-report; 28 studies. Finding: moderate,
//!   heterogeneous association. Limitation: mainly correlational. Change:
//!   duration/category cannot establish flow. Confidence: high.
//! - Mark, Gonzalez & Harris, 2005, CHI, "No Task Left Behind?" Signal:
//!   observation/interviews; N=24 information workers. Finding: ~3:05 per
//!   event and 10-12 min per working sphere. Limitation: 2004 offices. Change:
//!   expose fragmentation and switch rate. Confidence: high.
//! - Mark, Gudith & Klocke, 2008, CHI, "The Cost of Interrupted Work".
//!   Signal: experiment; N=48. Finding: interrupted work was faster but more
//!   stressful/frustrating. Limitation: artificial tasks. Change: no 23:15
//!   claim and no volume-only health score. Confidence: high.
//! - Czerwinski, Horvitz & Wilhite, 2004, CHI, diary+desktop logs; N=11.
//!   Finding: longer/more interposed tasks impair resumption. Limitation:
//!   small/old sample. Change: break reason and resume latency. Confidence:
//!   medium-high.
//! - Dabbish, Mark & Gonzalez, 2011, CHI, activity logs/observation/probes;
//!   N=14. Finding: many switches were self-initiated. Limitation: small,
//!   non-developer sample. Change: neutral switch copy; no causal blame.
//!   Confidence: medium-high.
//! - Leroy, 2009, OBHDP, four studies. Signal: manipulated task completion
//!   and performance. Finding: unfinished-task attention residue harms the
//!   next task. Limitation: theme was known, while we infer it. Change:
//!   different explicit tickets break; tool changes alone do not. Confidence:
//!   high.
//! - Meyer et al., 2014, FSE, survey; N=379 developers. Finding: completion,
//!   few interruptions/switches and clear goals matter more than raw hours.
//!   Limitation: perceived productivity. Change: deep minutes/sessions and
//!   fragmentation replace coding ratio as primary metrics. Confidence: high.
//! - Meyer et al., 2017, TSE, logs+ESM; N=20 developers/5,971 ratings.
//!   Finding: productive days had more progress and fewer switches. Limitation:
//!   one small organization. Change: temporal detector, not category sums.
//!   Confidence: high.
//! - Puranik, Koopman & Vough, 2020, Journal of Management, integrative
//!   review. Finding: interruption effects depend on timing/content/control.
//!   Limitation: heterogeneous occupations. Change: distinguish hard breaks
//!   from one interval of sensor uncertainty. Confidence: high.
//! - Parry et al., 2021, Nature Human Behaviour, systematic review/meta-
//!   analysis; 106 studies/N=52,007. Finding: logged vs reported media use
//!   association about r=.38. Limitation: media use, not focus. Change: call
//!   this an observed proxy and validate on labelled timelines. Confidence:
//!   high.
//! - Albulescu et al., 2022, PLOS ONE, micro-break meta-analysis. Signal:
//!   experimental performance/well-being; 22 samples/N=2,335. Finding:
//!   vigor d=.36 and fatigue d=.35, but overall performance d=.16, p=.116.
//!   Limitation: heterogeneous laboratory/student studies. Change: Idle/break
//!   time is neutral and never counted as distraction. Confidence: high.
//! - Razi et al., 2022, PACM HCI/CSCW, quantified workplace and burnout.
//!   Signal: interviews/design probes; N=11 residents plus 5 residents/5
//!   attendings. Finding: manager access raised autonomy/retaliation concerns;
//!   small-team aggregation was not perceived as anonymous. Limitation: one
//!   medical program and speculative dashboard. Change: local/personal data,
//!   inspectable proxy, no manager ranking. Confidence: high for design risk.
//! - Lee et al., 2023, ICML, Pix2Struct, and Baechler et al., 2024, ScreenAI.
//!   Signal: screenshot understanding benchmarks; 282M/1.3B and 675M/1.88B/
//!   4.62B models. Finding: screen-specific pretraining and scale help, while
//!   OCR/metadata can still add up to ~4.5 points; pixel-only DocVQA trailed
//!   OCR (76.6 vs 84.7). Limitation: not workplace-category classification.
//!   Change: app/title/task priors precede VL; model swap requires an in-domain
//!   critical-category eval under the local resource budget. Confidence: high.

use chrono::{Duration, NaiveDate, NaiveDateTime, Timelike};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const POLICY_VERSION: &str = "deep-focus-v1";
/// Transparent reporting tiers, not biological or phenomenological cut-offs.
/// Twenty-five minutes is a legible product reference; 10/50 distinguish
/// short and extended blocks without introducing the unsupported 90m myth.
pub const FOCUSED_TIER_SECS: i64 = 10 * 60;
pub const DEEP_TIER_SECS: i64 = 25 * 60;
pub const EXTENDED_TIER_SECS: i64 = 50 * 60;
/// At the 30–60s capture cadence, at most one uncertain General/Idle sample
/// may be bridged. Its seconds are never counted as focus.
pub const SENSOR_GRACE_SECS: i64 = 90;
pub const BROWSING_DISTRACTION_MIN_SECS: i64 = 2 * 60;
pub const CONSTRUCT_LABEL: &str = "Sustained focus-eligible work without an observed theme change";
pub const PROXY_DISCLAIMER: &str = "Deep Focus is inferred from sustained local activity and explicit theme changes when available; unlabelled theme changes may be missed, and subjective flow is not detected.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusRole {
    Eligible,
    /// Valuable collaborative or planning work. It breaks a sustained-focus
    /// session, but remains evidence for workload and transition analysis.
    Coordination,
    /// Valuable administrative or commercial work. Excluded from Deep Focus,
    /// not labelled as distraction.
    Operational,
    Distraction,
    MeasurementNoise,
    Unknown,
}

/// Single category registry shared by capture parsing, persistence, session
/// segmentation, insights and prompt generation. Adding a category anywhere
/// else would reintroduce the taxonomy drift this module is meant to prevent.
const CATEGORY_POLICIES: &[(&str, &str, FocusRole)] = &[
    ("analysis", "Analysis", FocusRole::Eligible),
    ("writing", "Writing", FocusRole::Eligible),
    ("coding", "Coding", FocusRole::Eligible),
    ("debugging", "Debugging", FocusRole::Eligible),
    ("codereview", "CodeReview", FocusRole::Eligible),
    ("testing", "Testing", FocusRole::Eligible),
    ("documentation", "Documentation", FocusRole::Eligible),
    ("design", "Design", FocusRole::Eligible),
    ("planning", "Planning", FocusRole::Coordination),
    ("meeting", "Meeting", FocusRole::Coordination),
    ("communication", "Communication", FocusRole::Coordination),
    ("research", "Research", FocusRole::Eligible),
    ("learning", "Learning", FocusRole::Eligible),
    ("devops", "DevOps", FocusRole::Eligible),
    ("database", "Database", FocusRole::Eligible),
    ("sales", "Sales", FocusRole::Operational),
    ("admin", "Admin", FocusRole::Operational),
    ("browsing", "Browsing", FocusRole::Distraction),
    ("idle", "Idle", FocusRole::MeasurementNoise),
    ("general", "General", FocusRole::MeasurementNoise),
];

fn normalized_category_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn canonical_category_label(value: &str) -> Option<&'static str> {
    let normalized = normalized_category_key(value);
    CATEGORY_POLICIES
        .iter()
        .find(|(key, _, _)| *key == normalized)
        .map(|(_, label, _)| *label)
}

pub fn canonicalize_category(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "General".to_string()
    } else {
        canonical_category_label(trimmed)
            .unwrap_or(trimmed)
            .to_string()
    }
}

pub fn allowed_categories_prompt() -> String {
    CATEGORY_POLICIES
        .iter()
        .map(|(_, label, _)| *label)
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn focus_role(category: &str) -> FocusRole {
    let Some(label) = canonical_category_label(category) else {
        return FocusRole::Unknown;
    };
    CATEGORY_POLICIES
        .iter()
        .find(|(_, candidate, _)| *candidate == label)
        .map(|(_, _, role)| *role)
        .unwrap_or(FocusRole::Unknown)
}

#[derive(Debug, Clone)]
pub struct ActivitySample {
    /// Start of the observed interval in local time.
    pub start: NaiveDateTime,
    pub duration_seconds: i64,
    pub category: String,
    #[allow(dead_code)]
    // retained as raw evidence; category correction happens before segmentation
    pub description: String,
    pub ticket: Option<String>,
    /// Explicit task selected by the user; this is not tied to Jira/Linear.
    pub theme_hint: Option<String>,
    #[allow(dead_code)] // retained for explainability/eval, not used as a focus rule
    pub app_name: Option<String>,
    #[allow(dead_code)] // retained for explainability/eval, not used as a focus rule
    pub window_title: Option<String>,
}

/// Inclusive local-date range represented as a half-open timestamp window.
/// `reports.created_at` is the observation end, so every consumer must clip
/// the observed interval rather than assigning all seconds to that end date.
#[derive(Debug, Clone, Copy)]
pub(crate) struct LocalDateWindow {
    start: NaiveDateTime,
    end_exclusive: NaiveDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct LocalIntervalSlice {
    pub start: NaiveDateTime,
    pub duration_seconds: i64,
}

impl LocalDateWindow {
    pub(crate) fn parse(period_start: &str, period_end: &str) -> Result<Self, String> {
        let start_date = NaiveDate::parse_from_str(period_start, "%Y-%m-%d")
            .map_err(|error| error.to_string())?;
        let end_date =
            NaiveDate::parse_from_str(period_end, "%Y-%m-%d").map_err(|error| error.to_string())?;
        if end_date < start_date {
            return Err("period end precedes period start".to_string());
        }
        let start = start_date
            .and_hms_opt(0, 0, 0)
            .ok_or("invalid period start")?;
        let end_exclusive = end_date
            .succ_opt()
            .and_then(|date| date.and_hms_opt(0, 0, 0))
            .ok_or("invalid period end")?;
        Ok(Self {
            start,
            end_exclusive,
        })
    }

    /// Clips one end-timestamped observation to this date window and returns
    /// one slice per local calendar day. Invalid/zero/out-of-window rows do not
    /// contribute time; callers may still retain their raw narrative evidence.
    pub(crate) fn slices_for_observation(
        &self,
        observed_end_local: &str,
        duration_seconds: i64,
    ) -> Vec<LocalIntervalSlice> {
        if duration_seconds <= 0 {
            return Vec::new();
        }
        let Ok(observed_end) =
            NaiveDateTime::parse_from_str(observed_end_local, "%Y-%m-%d %H:%M:%S")
        else {
            return Vec::new();
        };
        let mut cursor = (observed_end - Duration::seconds(duration_seconds)).max(self.start);
        let clipped_end = observed_end.min(self.end_exclusive);
        if clipped_end <= cursor {
            return Vec::new();
        }

        let mut slices = Vec::new();
        while cursor < clipped_end {
            let next_midnight = cursor
                .date()
                .succ_opt()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .unwrap_or(clipped_end);
            let slice_end = clipped_end.min(next_midnight);
            slices.push(LocalIntervalSlice {
                start: cursor,
                duration_seconds: (slice_end - cursor).num_seconds(),
            });
            cursor = slice_end;
        }
        slices
    }

    pub(crate) fn contains_local_timestamp(&self, timestamp: &str) -> bool {
        NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%d %H:%M:%S")
            .is_ok_and(|value| value >= self.start && value < self.end_exclusive)
    }
}

fn clean_theme_value(value: &str) -> Option<String> {
    let cleaned = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let normalized_sentinel = cleaned
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    (!cleaned.is_empty()
        && !matches!(
            normalized_sentinel.as_str(),
            "general" | "noticket" | "generalnoticket"
        ))
    .then_some(cleaned)
}

pub(crate) fn canonical_ticket_value(ticket: Option<&str>) -> Option<String> {
    ticket.and_then(clean_theme_value)
}

pub(crate) fn canonical_theme_label(
    ticket: Option<&str>,
    theme_hint: Option<&str>,
) -> Option<String> {
    if let Some(ticket) = canonical_ticket_value(ticket) {
        return Some(format!("Ticket {ticket}"));
    }
    theme_hint
        .and_then(clean_theme_value)
        .map(|theme| format!("Task {theme}"))
}

impl ActivitySample {
    pub fn end(&self) -> NaiveDateTime {
        self.start + Duration::seconds(self.duration_seconds.max(0))
    }

    fn explicit_theme_key(&self) -> Option<String> {
        if let Some(ticket) = canonical_ticket_value(self.ticket.as_deref()) {
            return Some(format!("ticket:{}", ticket.to_lowercase()));
        }
        if let Some(theme) = self.theme_hint.as_deref().and_then(clean_theme_value) {
            return Some(format!("task:{}", theme.to_lowercase()));
        }
        None
    }

    fn explicit_theme_label(&self) -> Option<String> {
        canonical_theme_label(self.ticket.as_deref(), self.theme_hint.as_deref())
    }

    fn is_focus_eligible(&self) -> bool {
        focus_role(&self.category) == FocusRole::Eligible
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BreakReason {
    NonFocus,
    MeetingOrCommunication,
    ThemeChanged,
    Gap,
    Midnight,
    EndOfWindow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySeconds {
    pub category: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusSession {
    pub start: String,
    pub end: String,
    pub focus_seconds: i64,
    pub elapsed_seconds: i64,
    pub tier: String,
    pub category_mix: Vec<CategorySeconds>,
    pub theme: Option<String>,
    /// True when the block contains a tolerated uncertain observation or ends
    /// at an observed non-focus/theme boundary. `break_reason` distinguishes
    /// that evidence from an unknown gap or an administrative day/window end.
    pub interrupted: bool,
    pub bridged_noise_seconds: i64,
    pub break_reason: BreakReason,
    pub break_category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HourlyDeepFocus {
    pub hour: u8,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusSummary {
    pub policy_version: &'static str,
    pub construct_label: &'static str,
    pub proxy_disclaimer: &'static str,
    pub focused_threshold_seconds: i64,
    pub deep_threshold_seconds: i64,
    pub extended_threshold_seconds: i64,
    pub sensor_grace_seconds: i64,
    pub browsing_distraction_min_seconds: i64,
    pub focus_eligible_seconds: i64,
    pub explicit_theme_seconds: i64,
    pub explicit_theme_coverage_pct: f64,
    pub deep_focus_seconds: i64,
    pub deep_focus_sessions: usize,
    pub longest_focus_seconds: i64,
    pub theme_switches: usize,
    pub explicit_theme_switches_per_labelled_focus_hour: f64,
    pub fragmentation_pct: f64,
    pub resume_events: usize,
    pub average_resume_seconds: Option<f64>,
    pub distraction_events: usize,
    pub distraction_seconds: i64,
    /// Seconds discarded from ambiguous overlapping observations rather than
    /// double-counted. Exposed so coverage limitations remain inspectable.
    pub overlap_clipped_seconds: i64,
    /// Work that informs workload/collaboration conclusions but is outside the
    /// sustained-focus construct. It is deliberately not called distraction.
    pub context_work_seconds: i64,
    pub context_category_mix: Vec<CategorySeconds>,
    pub hourly_deep_focus: Vec<HourlyDeepFocus>,
    pub sessions: Vec<FocusSession>,
}

#[derive(Debug)]
struct SessionBuilder {
    start: NaiveDateTime,
    last_focus_end: NaiveDateTime,
    focus_seconds: i64,
    category_mix: BTreeMap<String, i64>,
    theme_key: Option<String>,
    theme: Option<String>,
    bridged_noise_seconds: i64,
    segments: Vec<(NaiveDateTime, i64)>,
}

impl SessionBuilder {
    fn new(sample: &ActivitySample) -> Self {
        let duration = sample.duration_seconds.max(0);
        let mut category_mix = BTreeMap::new();
        category_mix.insert(sample.category.clone(), duration);
        Self {
            start: sample.start,
            last_focus_end: sample.end(),
            focus_seconds: duration,
            category_mix,
            theme_key: sample.explicit_theme_key(),
            theme: sample.explicit_theme_label(),
            bridged_noise_seconds: 0,
            segments: vec![(sample.start, duration)],
        }
    }

    fn push(&mut self, sample: &ActivitySample, bridged_seconds: i64) {
        let duration = sample.duration_seconds.max(0);
        self.focus_seconds += duration;
        *self
            .category_mix
            .entry(sample.category.clone())
            .or_default() += duration;
        self.last_focus_end = sample.end();
        self.bridged_noise_seconds += bridged_seconds.max(0);
        self.segments.push((sample.start, duration));
        if self.theme_key.is_none() {
            self.theme_key = sample.explicit_theme_key();
            self.theme = sample.explicit_theme_label();
        }
    }
}

fn explicit_theme_changed(a: &SessionBuilder, b: &ActivitySample) -> bool {
    match (a.theme_key.as_deref(), b.explicit_theme_key()) {
        (Some(left), Some(right))
            if (left.starts_with("ticket:") || left.starts_with("task:"))
                && (right.starts_with("ticket:") || right.starts_with("task:")) =>
        {
            left != right
        }
        _ => false,
    }
}

fn tier(seconds: i64) -> &'static str {
    if seconds >= EXTENDED_TIER_SECS {
        "extended"
    } else if seconds >= DEEP_TIER_SECS {
        "deep"
    } else if seconds >= FOCUSED_TIER_SECS {
        "focused"
    } else {
        "fragment"
    }
}

fn finish_session(
    builder: SessionBuilder,
    break_reason: BreakReason,
    break_category: Option<&str>,
    sessions: &mut Vec<FocusSession>,
    hourly: &mut [i64; 24],
) {
    if builder.focus_seconds <= 0 {
        return;
    }
    let interrupted = builder.bridged_noise_seconds > 0
        || matches!(
            &break_reason,
            BreakReason::NonFocus | BreakReason::MeetingOrCommunication | BreakReason::ThemeChanged
        );
    if builder.focus_seconds >= DEEP_TIER_SECS {
        for (start, duration) in &builder.segments {
            split_into_hours(*start, *duration, hourly);
        }
    }
    sessions.push(FocusSession {
        start: builder.start.format("%Y-%m-%d %H:%M:%S").to_string(),
        end: builder
            .last_focus_end
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
        focus_seconds: builder.focus_seconds,
        elapsed_seconds: (builder.last_focus_end - builder.start)
            .num_seconds()
            .max(0),
        tier: tier(builder.focus_seconds).to_string(),
        category_mix: builder
            .category_mix
            .into_iter()
            .map(|(category, seconds)| CategorySeconds { category, seconds })
            .collect(),
        theme: builder.theme,
        interrupted,
        bridged_noise_seconds: builder.bridged_noise_seconds,
        break_reason,
        break_category: break_category.map(str::to_string),
    });
}

fn split_into_hours(mut start: NaiveDateTime, mut seconds: i64, hourly: &mut [i64; 24]) {
    while seconds > 0 {
        let next_hour = (start + Duration::hours(1))
            .date()
            .and_hms_opt((start.hour() + 1) % 24, 0, 0)
            .unwrap_or_else(|| {
                start + Duration::seconds(3600 - start.minute() as i64 * 60 - start.second() as i64)
            });
        let room = (next_hour - start).num_seconds().max(1);
        let take = seconds.min(room);
        hourly[start.hour() as usize] += take;
        start += Duration::seconds(take);
        seconds -= take;
    }
}

fn summarize_distractions(samples: &[ActivitySample]) -> (usize, i64) {
    let mut active_kind: Option<&str> = None;
    let mut active_seconds = 0i64;
    let mut last_end: Option<NaiveDateTime> = None;
    let mut events = 0usize;
    let mut total = 0i64;

    let flush =
        |kind: &mut Option<&str>, seconds: &mut i64, events: &mut usize, total: &mut i64| {
            let threshold = match *kind {
                Some("Browsing") => BROWSING_DISTRACTION_MIN_SECS,
                _ => i64::MAX,
            };
            if *seconds >= threshold {
                *events += 1;
                *total += *seconds;
            }
            *kind = None;
            *seconds = 0;
        };

    for sample in samples {
        let is_distraction = sample.category == "Browsing";
        if !is_distraction {
            flush(
                &mut active_kind,
                &mut active_seconds,
                &mut events,
                &mut total,
            );
            last_end = None;
            continue;
        }
        let contiguous = active_kind == Some(sample.category.as_str())
            && last_end.is_some_and(|end| {
                end.date() == sample.start.date()
                    && (sample.start - end).num_seconds().max(0) <= SENSOR_GRACE_SECS
            });
        if !contiguous {
            flush(
                &mut active_kind,
                &mut active_seconds,
                &mut events,
                &mut total,
            );
            active_kind = Some(sample.category.as_str());
        }
        active_seconds += sample.duration_seconds;
        last_end = Some(sample.end());
    }
    flush(
        &mut active_kind,
        &mut active_seconds,
        &mut events,
        &mut total,
    );
    (events, total)
}

fn normalize_timeline(mut samples: Vec<ActivitySample>) -> (Vec<ActivitySample>, i64) {
    samples.retain(|s| s.duration_seconds > 0);
    samples.sort_by_key(|s| s.start);
    let mut normalized = Vec::with_capacity(samples.len());
    let mut covered_until: Option<NaiveDateTime> = None;
    let mut overlap_clipped_seconds = 0;

    for mut sample in samples {
        if let Some(end) = covered_until {
            if sample.start < end {
                let clipped = (end - sample.start)
                    .num_seconds()
                    .min(sample.duration_seconds)
                    .max(0);
                sample.start += Duration::seconds(clipped);
                sample.duration_seconds -= clipped;
                overlap_clipped_seconds += clipped;
            }
        }
        if sample.duration_seconds <= 0 {
            continue;
        }

        while sample.end().date() > sample.start.date() {
            let midnight = sample
                .start
                .date()
                .succ_opt()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .expect("valid next midnight");
            let first_seconds = (midnight - sample.start).num_seconds();
            let mut first = sample.clone();
            first.duration_seconds = first_seconds;
            normalized.push(first);
            sample.start = midnight;
            sample.duration_seconds -= first_seconds;
        }
        covered_until = Some(sample.end());
        if sample.duration_seconds > 0 {
            normalized.push(sample);
        }
    }
    (normalized, overlap_clipped_seconds)
}

pub fn summarize(samples: Vec<ActivitySample>) -> FocusSummary {
    let (samples, overlap_clipped_seconds) = normalize_timeline(samples);
    let (distraction_events, distraction_seconds) = summarize_distractions(&samples);

    let focus_eligible_seconds: i64 = samples
        .iter()
        .filter(|s| s.is_focus_eligible())
        .map(|s| s.duration_seconds.max(0))
        .sum();
    let explicit_theme_seconds: i64 = samples
        .iter()
        .filter(|s| s.is_focus_eligible() && s.explicit_theme_key().is_some())
        .map(|s| s.duration_seconds.max(0))
        .sum();
    let explicit_theme_coverage_pct = if focus_eligible_seconds > 0 {
        (explicit_theme_seconds as f64 / focus_eligible_seconds as f64 * 1000.0).round() / 10.0
    } else {
        0.0
    };
    let mut context_categories = BTreeMap::<String, i64>::new();
    for sample in &samples {
        if matches!(
            focus_role(&sample.category),
            FocusRole::Coordination | FocusRole::Operational
        ) {
            *context_categories
                .entry(sample.category.clone())
                .or_default() += sample.duration_seconds.max(0);
        }
    }
    let context_work_seconds = context_categories.values().sum();
    let mut sessions = Vec::new();
    let mut hourly = [0i64; 24];
    let mut current: Option<SessionBuilder> = None;
    let mut pending_noise_seconds = 0i64;
    let mut pending_noise_observations = 0usize;
    let mut theme_switches = 0usize;
    let mut interrupted_theme: Option<(String, NaiveDateTime)> = None;
    let mut resume_latencies = Vec::new();
    let mut last_observation_date = None;

    for sample in &samples {
        if last_observation_date.is_some_and(|date| date != sample.start.date()) {
            if let Some(done) = current.take() {
                finish_session(
                    done,
                    BreakReason::Midnight,
                    None,
                    &mut sessions,
                    &mut hourly,
                );
            }
            pending_noise_seconds = 0;
            pending_noise_observations = 0;
            interrupted_theme = None;
        }
        last_observation_date = Some(sample.start.date());

        if sample.is_focus_eligible() {
            if let Some(active) = current.as_mut() {
                let reason = if explicit_theme_changed(active, sample) {
                    theme_switches += 1;
                    Some(BreakReason::ThemeChanged)
                } else {
                    let gap = (sample.start - active.last_focus_end).num_seconds().max(0);
                    if gap > SENSOR_GRACE_SECS {
                        Some(BreakReason::Gap)
                    } else {
                        None
                    }
                };
                if let Some(reason) = reason {
                    let done = current.take().expect("active session");
                    if reason == BreakReason::Gap
                        && done.theme_key.is_some()
                        && done.theme_key.as_deref() == sample.explicit_theme_key().as_deref()
                    {
                        let latency = (sample.start - done.last_focus_end).num_seconds().max(0);
                        resume_latencies.push(latency);
                    }
                    finish_session(done, reason, None, &mut sessions, &mut hourly);
                    pending_noise_seconds = 0;
                    pending_noise_observations = 0;
                    current = Some(SessionBuilder::new(sample));
                } else {
                    let bridge = pending_noise_seconds.min(SENSOR_GRACE_SECS);
                    active.push(sample, bridge);
                    pending_noise_seconds = 0;
                    pending_noise_observations = 0;
                }
            } else {
                if let (Some((prior_theme, ended)), Some(next_theme)) =
                    (interrupted_theme.take(), sample.explicit_theme_key())
                {
                    if prior_theme == next_theme {
                        resume_latencies.push((sample.start - ended).num_seconds().max(0));
                    } else {
                        theme_switches += 1;
                    }
                }
                current = Some(SessionBuilder::new(sample));
                pending_noise_seconds = 0;
                pending_noise_observations = 0;
            }
            continue;
        }

        match focus_role(&sample.category) {
            FocusRole::MeasurementNoise if current.is_some() => {
                pending_noise_seconds += sample.duration_seconds;
                pending_noise_observations += 1;
                if pending_noise_seconds > SENSOR_GRACE_SECS || pending_noise_observations > 1 {
                    let done = current.take().expect("active session");
                    if let Some(theme_key) = done.theme_key.clone() {
                        interrupted_theme = Some((theme_key, done.last_focus_end));
                    }
                    finish_session(
                        done,
                        BreakReason::NonFocus,
                        Some(sample.category.as_str()),
                        &mut sessions,
                        &mut hourly,
                    );
                    pending_noise_seconds = 0;
                    pending_noise_observations = 0;
                }
            }
            _ => {
                if let Some(done) = current.take() {
                    let reason = if matches!(sample.category.as_str(), "Meeting" | "Communication")
                    {
                        BreakReason::MeetingOrCommunication
                    } else {
                        BreakReason::NonFocus
                    };
                    if let Some(theme_key) = done.theme_key.clone() {
                        interrupted_theme = Some((theme_key, done.last_focus_end));
                    }
                    finish_session(
                        done,
                        reason,
                        Some(sample.category.as_str()),
                        &mut sessions,
                        &mut hourly,
                    );
                }
                pending_noise_seconds = 0;
                pending_noise_observations = 0;
            }
        }
    }
    if let Some(done) = current.take() {
        finish_session(
            done,
            BreakReason::EndOfWindow,
            None,
            &mut sessions,
            &mut hourly,
        );
    }

    let deep_focus_seconds: i64 = sessions
        .iter()
        .filter(|s| s.focus_seconds >= DEEP_TIER_SECS)
        .map(|s| s.focus_seconds)
        .sum();
    let deep_focus_sessions = sessions
        .iter()
        .filter(|s| s.focus_seconds >= DEEP_TIER_SECS)
        .count();
    let longest_focus_seconds = sessions.iter().map(|s| s.focus_seconds).max().unwrap_or(0);
    let fragmented_seconds: i64 = sessions
        .iter()
        .filter(|s| s.focus_seconds < DEEP_TIER_SECS)
        .map(|s| s.focus_seconds)
        .sum();
    let fragmentation_pct = if focus_eligible_seconds > 0 {
        (fragmented_seconds as f64 / focus_eligible_seconds as f64 * 1000.0).round() / 10.0
    } else {
        0.0
    };
    let explicit_theme_switches_per_labelled_focus_hour = if explicit_theme_seconds > 0 {
        (theme_switches as f64 / (explicit_theme_seconds as f64 / 3600.0) * 10.0).round() / 10.0
    } else {
        0.0
    };
    let average_resume_seconds = if resume_latencies.is_empty() {
        None
    } else {
        Some(
            (resume_latencies.iter().sum::<i64>() as f64 / resume_latencies.len() as f64 * 10.0)
                .round()
                / 10.0,
        )
    };

    FocusSummary {
        policy_version: POLICY_VERSION,
        construct_label: CONSTRUCT_LABEL,
        proxy_disclaimer: PROXY_DISCLAIMER,
        focused_threshold_seconds: FOCUSED_TIER_SECS,
        deep_threshold_seconds: DEEP_TIER_SECS,
        extended_threshold_seconds: EXTENDED_TIER_SECS,
        sensor_grace_seconds: SENSOR_GRACE_SECS,
        browsing_distraction_min_seconds: BROWSING_DISTRACTION_MIN_SECS,
        focus_eligible_seconds,
        explicit_theme_seconds,
        explicit_theme_coverage_pct,
        deep_focus_seconds,
        deep_focus_sessions,
        longest_focus_seconds,
        theme_switches,
        explicit_theme_switches_per_labelled_focus_hour,
        fragmentation_pct,
        resume_events: resume_latencies.len(),
        average_resume_seconds,
        distraction_events,
        distraction_seconds,
        overlap_clipped_seconds,
        context_work_seconds,
        context_category_mix: context_categories
            .into_iter()
            .map(|(category, seconds)| CategorySeconds { category, seconds })
            .collect(),
        hourly_deep_focus: hourly
            .iter()
            .enumerate()
            .map(|(hour, seconds)| HourlyDeepFocus {
                hour: hour as u8,
                seconds: *seconds,
            })
            .collect(),
        sessions,
    }
}

pub fn summarize_from_db(
    conn: &Connection,
    period_start: &str,
    period_end: &str,
) -> Result<FocusSummary, String> {
    let window = LocalDateWindow::parse(period_start, period_end)?;
    let mut stmt = conn
        .prepare(
            "SELECT datetime(created_at, 'localtime'), activity_type, description,
                    jira_ticket_id, duration_seconds, active_app, window_title, theme_hint
             FROM reports
             WHERE date(created_at, 'localtime') >= ?1
               AND date(created_at, 'localtime') <= date(?2, '+1 day')
             ORDER BY datetime(created_at, 'localtime') ASC",
        )
        .map_err(|e| e.to_string())?;
    let samples = stmt
        .query_map(params![period_start, period_end], |row| {
            let observed_end: String = row.get(0)?;
            let duration_seconds: i64 = row.get::<_, i64>(4).unwrap_or(0).max(0);
            Ok((
                observed_end,
                duration_seconds,
                canonicalize_category(
                    &row.get::<_, String>(1).unwrap_or_else(|_| "General".into()),
                ),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, Option<String>>(3).unwrap_or(None),
                row.get::<_, Option<String>>(5).unwrap_or(None),
                row.get::<_, Option<String>>(6).unwrap_or(None),
                row.get::<_, Option<String>>(7).unwrap_or(None),
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .flat_map(
            |(observed_end, duration_seconds, category, description, ticket, app, title, theme)| {
                window
                    .slices_for_observation(&observed_end, duration_seconds)
                    .into_iter()
                    .map(move |slice| ActivitySample {
                        start: slice.start,
                        duration_seconds: slice.duration_seconds,
                        category: category.clone(),
                        description: description.clone(),
                        ticket: ticket.clone(),
                        theme_hint: theme.clone(),
                        app_name: app.clone(),
                        window_title: title.clone(),
                    })
            },
        )
        .collect();
    Ok(summarize(samples))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: u32, hour: u32, minute: u32) -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 8, day)
            .unwrap()
            .and_hms_opt(hour, minute, 0)
            .unwrap()
    }

    fn sample(
        day: u32,
        hour: u32,
        minute: u32,
        seconds: i64,
        category: &str,
        ticket: Option<&str>,
    ) -> ActivitySample {
        ActivitySample {
            start: at(day, hour, minute),
            duration_seconds: seconds,
            category: category.into(),
            description: "technical work in VS Code".into(),
            ticket: ticket.map(str::to_string),
            theme_hint: None,
            app_name: Some("Visual Studio Code".into()),
            window_title: Some("main.rs - project".into()),
        }
    }

    #[test]
    fn same_ticket_coding_to_debugging_is_one_deep_session() {
        let out = summarize(vec![
            sample(22, 9, 0, 900, "Coding", Some("FS-1")),
            sample(22, 9, 15, 900, "Debugging", Some("FS-1")),
        ]);
        assert_eq!(out.deep_focus_sessions, 1);
        assert_eq!(out.deep_focus_seconds, 1800);
        assert_eq!(out.sessions[0].theme.as_deref(), Some("Ticket FS-1"));
    }

    #[test]
    fn ticket_change_breaks_attention_residue_boundary() {
        let out = summarize(vec![
            sample(22, 9, 0, 900, "Coding", Some("FS-1")),
            sample(22, 9, 15, 900, "Coding", Some("FS-2")),
        ]);
        assert_eq!(out.deep_focus_sessions, 0);
        assert_eq!(out.theme_switches, 1);
        assert_eq!(out.sessions.len(), 2);
        assert_eq!(out.sessions[0].break_reason, BreakReason::ThemeChanged);
        assert!(out.sessions[0].interrupted);
    }

    #[test]
    fn one_interval_general_noise_is_bridged_but_not_counted() {
        let out = summarize(vec![
            sample(22, 9, 0, 720, "Coding", Some("FS-1")),
            sample(22, 9, 12, 60, "General", Some("FS-1")),
            sample(22, 9, 13, 840, "Testing", Some("FS-1")),
        ]);
        assert_eq!(out.deep_focus_sessions, 1);
        assert_eq!(out.deep_focus_seconds, 1560);
        assert_eq!(out.sessions[0].bridged_noise_seconds, 60);
        assert!(out.sessions[0].interrupted);
    }

    #[test]
    fn real_browsing_and_meeting_cut_immediately() {
        for breaker in ["Browsing", "Meeting", "Communication"] {
            let out = summarize(vec![
                sample(22, 9, 0, 900, "Coding", Some("FS-1")),
                sample(22, 9, 15, 30, breaker, Some("FS-1")),
                sample(22, 9, 16, 900, "Coding", Some("FS-1")),
            ]);
            assert_eq!(out.deep_focus_sessions, 0, "breaker={breaker}");
            assert!(out.sessions[0].interrupted, "breaker={breaker}");
            let expected_reason = if matches!(breaker, "Meeting" | "Communication") {
                BreakReason::MeetingOrCommunication
            } else {
                BreakReason::NonFocus
            };
            assert_eq!(out.sessions[0].break_reason, expected_reason);
            assert_eq!(out.sessions[0].break_category.as_deref(), Some(breaker));
        }
    }

    #[test]
    fn zero_second_annotations_do_not_break_or_add_time() {
        let mut event = sample(22, 9, 10, 0, "Communication", Some("FS-1"));
        event.description = "UIA annotation".into();
        let out = summarize(vec![
            sample(22, 9, 0, 900, "Coding", Some("FS-1")),
            event,
            sample(22, 9, 15, 900, "Testing", Some("FS-1")),
        ]);
        assert_eq!(out.deep_focus_sessions, 1);
        assert_eq!(out.deep_focus_seconds, 1800);
    }

    #[test]
    fn midnight_and_large_gap_split_sessions() {
        let midnight = summarize(vec![
            sample(22, 23, 45, 900, "Coding", Some("FS-1")),
            sample(23, 0, 0, 900, "Coding", Some("FS-1")),
        ]);
        assert_eq!(midnight.deep_focus_sessions, 0);
        assert_eq!(midnight.sessions[0].break_reason, BreakReason::Midnight);

        let gap = summarize(vec![
            sample(22, 9, 0, 600, "Coding", Some("FS-1")),
            sample(22, 9, 20, 600, "Coding", Some("FS-1")),
        ]);
        assert_eq!(gap.sessions.len(), 2);
        assert_eq!(gap.sessions[0].break_reason, BreakReason::Gap);
        assert!(!gap.sessions[0].interrupted);
    }

    #[test]
    fn one_observation_crossing_midnight_is_split_between_days() {
        let out = summarize(vec![sample(22, 23, 50, 1800, "Writing", Some("REPORT"))]);
        assert_eq!(out.sessions.len(), 2);
        assert_eq!(out.sessions[0].focus_seconds, 600);
        assert_eq!(out.sessions[0].break_reason, BreakReason::Midnight);
        assert_eq!(out.sessions[1].focus_seconds, 1200);
        assert_eq!(out.deep_focus_sessions, 0);
    }

    #[test]
    fn observation_ending_exactly_at_midnight_has_no_phantom_session() {
        let out = summarize(vec![sample(22, 23, 50, 10 * 60, "Writing", Some("REPORT"))]);
        assert_eq!(out.sessions.len(), 1);
        assert_eq!(out.sessions[0].focus_seconds, 10 * 60);
        assert_eq!(out.sessions[0].end, "2026-08-23 00:00:00");
        assert_eq!(out.focus_eligible_seconds, 10 * 60);
    }

    #[test]
    fn overlapping_observations_are_not_double_counted() {
        let first = sample(22, 9, 0, 900, "Analysis", Some("FORECAST"));
        let second = sample(22, 9, 10, 900, "Analysis", Some("FORECAST"));
        let out = summarize(vec![first, second]);
        assert_eq!(out.focus_eligible_seconds, 1500);
        assert_eq!(out.deep_focus_seconds, 1500);
        assert_eq!(out.overlap_clipped_seconds, 300);
    }

    #[test]
    fn non_developer_knowledge_work_is_focus_eligible() {
        for category in [
            "Research",
            "Documentation",
            "Writing",
            "Analysis",
            "Design",
            "Learning",
        ] {
            let mut activity = sample(22, 9, 0, 1500, category, None);
            activity.description = "sustained work on a report".into();
            activity.app_name = Some("LibreOffice".into());
            activity.window_title = Some("Quarterly analysis".into());
            assert_eq!(
                summarize(vec![activity]).deep_focus_sessions,
                1,
                "{category}"
            );
        }
    }

    #[test]
    fn canonical_category_registry_is_unique_total_and_prompt_backed() {
        let prompt = allowed_categories_prompt();
        let labels: Vec<&str> = prompt.split(", ").collect();
        let unique: std::collections::BTreeSet<&str> = labels.iter().copied().collect();

        assert_eq!(labels.len(), CATEGORY_POLICIES.len());
        assert_eq!(unique.len(), labels.len());
        for label in labels {
            assert_eq!(canonical_category_label(label), Some(label));
            assert_ne!(focus_role(label), FocusRole::Unknown, "{label}");
        }
        assert_eq!(canonical_category_label("code review"), Some("CodeReview"));
        assert_eq!(canonical_category_label("DEV_OPS"), Some("DevOps"));
        assert_eq!(canonicalize_category("Custom workflow"), "Custom workflow");
        assert_eq!(
            canonical_ticket_value(Some("  ABC-1  ")).as_deref(),
            Some("ABC-1")
        );
        assert_eq!(canonical_ticket_value(Some("General")), None);
        assert_eq!(canonical_ticket_value(Some("General / No Ticket")), None);
        assert_eq!(canonical_ticket_value(Some(" no   ticket ")), None);
        assert_eq!(canonical_ticket_value(Some("  \t ")), None);
    }

    #[test]
    fn manual_theme_change_breaks_without_a_ticket() {
        let mut first = sample(22, 9, 0, 900, "Writing", None);
        first.theme_hint = Some("Customer proposal".into());
        let mut second = sample(22, 9, 15, 900, "Analysis", None);
        second.theme_hint = Some("Quarterly forecast".into());
        let unlabelled = sample(22, 9, 30, 3600, "Analysis", None);
        let out = summarize(vec![first, second, unlabelled]);
        assert_eq!(out.sessions.len(), 2);
        assert_eq!(out.theme_switches, 1);
        assert_eq!(out.explicit_theme_switches_per_labelled_focus_hour, 2.0);
        assert_eq!(
            out.sessions[0].theme.as_deref(),
            Some("Task Customer proposal")
        );
        assert_eq!(
            out.sessions[1].theme.as_deref(),
            Some("Task Quarterly forecast")
        );
    }

    #[test]
    fn theme_matching_normalizes_unicode_case_and_internal_whitespace() {
        let mut first = sample(22, 9, 0, 900, "Writing", None);
        first.theme_hint = Some("  Informe   Trimestral ".into());
        let mut second = sample(22, 9, 15, 900, "Analysis", None);
        second.theme_hint = Some("informe trimestral".into());

        let out = summarize(vec![first, second]);

        assert_eq!(out.sessions.len(), 1);
        assert_eq!(out.deep_focus_sessions, 1);
        assert_eq!(out.theme_switches, 0);
        assert_eq!(
            out.sessions[0].theme.as_deref(),
            Some("Task Informe Trimestral")
        );
    }

    #[test]
    fn unlabeled_work_after_a_gap_is_not_claimed_as_a_resume() {
        let mut labelled = sample(22, 9, 0, 600, "Writing", None);
        labelled.theme_hint = Some("Customer proposal".into());
        let unlabeled = sample(22, 9, 12, 600, "Writing", None);

        let out = summarize(vec![labelled, unlabeled]);

        assert_eq!(out.sessions.len(), 2);
        assert_eq!(out.resume_events, 0);
        assert_eq!(out.average_resume_seconds, None);
    }

    #[test]
    fn midnight_resets_pending_resume_state() {
        let before = sample(22, 23, 30, 1200, "Writing", Some("REPORT"));
        let interruption = sample(22, 23, 50, 600, "Meeting", None);
        let after = sample(23, 0, 0, 1500, "Writing", Some("REPORT"));

        let out = summarize(vec![before, interruption, after]);

        assert_eq!(out.resume_events, 0);
        assert_eq!(out.theme_switches, 0);
        assert_eq!(out.deep_focus_sessions, 1);
    }

    #[test]
    fn policy_boundaries_are_inclusive_only_at_the_declared_thresholds() {
        let below_deep = summarize(vec![sample(22, 9, 0, DEEP_TIER_SECS - 1, "Analysis", None)]);
        let at_deep = summarize(vec![sample(22, 9, 0, DEEP_TIER_SECS, "Analysis", None)]);
        let at_extended = summarize(vec![sample(22, 9, 0, EXTENDED_TIER_SECS, "Writing", None)]);

        assert_eq!(below_deep.deep_focus_sessions, 0);
        assert_eq!(below_deep.sessions[0].tier, "focused");
        assert_eq!(at_deep.deep_focus_sessions, 1);
        assert_eq!(at_deep.sessions[0].tier, "deep");
        assert_eq!(at_extended.sessions[0].tier, "extended");

        let first = sample(22, 13, 0, 600, "Research", Some("TOPIC"));
        let mut exact_grace = sample(22, 13, 0, 900, "Research", Some("TOPIC"));
        exact_grace.start = first.end() + Duration::seconds(SENSOR_GRACE_SECS);
        let connected = summarize(vec![first.clone(), exact_grace]);
        assert_eq!(connected.deep_focus_sessions, 1);

        let mut beyond_grace = sample(22, 13, 0, 900, "Research", Some("TOPIC"));
        beyond_grace.start = first.end() + Duration::seconds(SENSOR_GRACE_SECS + 1);
        let split = summarize(vec![first, beyond_grace]);
        assert_eq!(split.deep_focus_sessions, 0);
        assert_eq!(split.sessions.len(), 2);
    }

    #[test]
    fn summary_conserves_focus_seconds_and_hourly_deep_minutes() {
        let mut writing = sample(22, 9, 50, 900, "Writing", None);
        writing.theme_hint = Some("Brief".into());
        let mut research = sample(22, 10, 5, 900, "Research", None);
        research.theme_hint = Some("Brief".into());
        let meeting = sample(22, 10, 20, 300, "Meeting", None);
        let out = summarize(vec![writing, research, meeting]);

        assert_eq!(
            out.sessions
                .iter()
                .map(|session| session.focus_seconds)
                .sum::<i64>(),
            out.focus_eligible_seconds
        );
        assert_eq!(
            out.hourly_deep_focus
                .iter()
                .map(|bucket| bucket.seconds)
                .sum::<i64>(),
            out.deep_focus_seconds
        );
        assert_eq!(out.deep_focus_seconds, 1800);
        assert_eq!(out.context_work_seconds, 300);
    }

    #[test]
    fn canonical_payload_serializes_policy_metrics_and_human_theme_labels() {
        let mut writing = sample(22, 9, 0, DEEP_TIER_SECS, "Writing", None);
        writing.theme_hint = Some("Policy brief".into());
        let payload = serde_json::to_value(summarize(vec![writing])).unwrap();

        assert_eq!(payload["policy_version"], POLICY_VERSION);
        assert_eq!(payload["construct_label"], CONSTRUCT_LABEL);
        assert_eq!(payload["proxy_disclaimer"], PROXY_DISCLAIMER);
        assert_eq!(payload["focused_threshold_seconds"], FOCUSED_TIER_SECS);
        assert_eq!(payload["deep_threshold_seconds"], DEEP_TIER_SECS);
        assert_eq!(payload["extended_threshold_seconds"], EXTENDED_TIER_SECS);
        assert_eq!(payload["sensor_grace_seconds"], SENSOR_GRACE_SECS);
        assert_eq!(
            payload["browsing_distraction_min_seconds"],
            BROWSING_DISTRACTION_MIN_SECS
        );
        assert_eq!(payload["deep_focus_seconds"], DEEP_TIER_SECS);
        assert_eq!(payload["sessions"][0]["theme"], "Task Policy brief");
        assert!(payload.get("switches_per_focus_hour").is_none());
        assert!(!payload.to_string().contains("task:policy brief"));
    }

    #[test]
    fn renderer_and_cloud_prompts_depend_on_the_canonical_payload() {
        let renderer = include_str!("../../src/renderer/index.html");
        assert!(renderer.contains("data.focus?.deep_focus_seconds"));
        assert!(renderer.contains("focus.hourly_deep_focus"));
        assert!(renderer.contains("focus.deep_threshold_seconds"));
        assert!(renderer.contains("focus.sensor_grace_seconds"));
        assert!(renderer.contains("focus.browsing_distraction_min_seconds"));
        assert!(renderer.contains("sel.value !== 'General'"));
        assert!(renderer.contains("Sustained non-work browsing"));
        assert!(renderer.contains("no minutes inside a deep-focus block"));
        assert!(!renderer.contains("Focus, flow, and planning"));
        for forbidden in [
            "FOCUS_CATEGORIES",
            "DISTRACTION_CATEGORIES",
            "computeFocusSeconds",
            "deep_focus_sessions_30m_plus",
        ] {
            assert!(
                !renderer.contains(forbidden),
                "renderer contains {forbidden}"
            );
        }

        let coach = include_str!("../../../../supabase/functions/coach-chat/index.ts");
        let insights = include_str!("../../../../supabase/functions/generate-insights/index.ts");
        assert!(coach.contains("local_context.focus_semantics"));
        assert!(coach.contains("Never reconstruct Deep Focus"));
        assert!(coach.contains("Use only its distraction_events/distraction_seconds"));
        assert!(insights.contains("DATA.localReport.focus_semantics"));
        assert!(insights.contains("do not estimate it from categories"));
        assert!(insights.contains("Use only focus_semantics.distraction_events"));
    }

    #[test]
    fn hourly_buckets_split_cross_hour_intervals() {
        let out = summarize(vec![sample(22, 9, 50, 1500, "Coding", Some("FS-1"))]);
        assert_eq!(out.hourly_deep_focus[9].seconds, 600);
        assert_eq!(out.hourly_deep_focus[10].seconds, 900);
    }

    #[test]
    fn distraction_thresholds_ignore_blips_and_lock_screen_noise() {
        let short_browse = summarize(vec![sample(22, 9, 0, 60, "Browsing", None)]);
        assert_eq!(short_browse.distraction_events, 0);

        let browsing = summarize(vec![
            sample(22, 9, 0, 60, "Browsing", None),
            sample(22, 9, 1, 60, "Browsing", None),
        ]);
        assert_eq!(browsing.distraction_events, 1);
        assert_eq!(browsing.distraction_seconds, 120);

        let lock_blip = summarize(vec![sample(22, 9, 0, 240, "Idle", None)]);
        assert_eq!(lock_blip.distraction_events, 0);

        let long_break = summarize(vec![sample(22, 9, 0, 1800, "Idle", None)]);
        assert_eq!(long_break.distraction_events, 0);
        assert_eq!(long_break.distraction_seconds, 0);
    }

    #[test]
    fn valuable_non_focus_work_is_retained_as_context_not_distraction() {
        let out = summarize(vec![
            sample(22, 9, 0, 600, "Planning", None),
            sample(22, 9, 10, 300, "Meeting", None),
            sample(22, 9, 15, 240, "Communication", None),
            sample(22, 9, 19, 360, "Sales", None),
            sample(22, 9, 25, 300, "Admin", None),
        ]);

        assert_eq!(out.context_work_seconds, 1800);
        assert_eq!(out.distraction_seconds, 0);
        assert_eq!(out.deep_focus_seconds, 0);
        assert_eq!(out.context_category_mix.len(), 5);
        assert_eq!(focus_role("Planning"), FocusRole::Coordination);
        assert_eq!(focus_role("Sales"), FocusRole::Operational);
        assert_eq!(focus_role("Browsing"), FocusRole::Distraction);
    }

    #[test]
    fn sqlite_loader_produces_the_same_canonical_session_payload() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE reports (
                created_at TEXT NOT NULL,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                jira_ticket_id TEXT,
                duration_seconds INTEGER NOT NULL,
                active_app TEXT,
                window_title TEXT,
                theme_hint TEXT
            );
            INSERT INTO reports VALUES
                ('2026-08-22 09:15:00', 'Writing', 'Drafting a brief', NULL, 900, 'Writer', 'Brief', 'Policy brief'),
                ('2026-08-22 09:30:00', 'Research', 'Checking sources', NULL, 900, 'Browser', 'Source', 'Policy brief');",
        )
        .unwrap();

        let out = summarize_from_db(&conn, "2026-08-21", "2026-08-23").unwrap();
        assert_eq!(out.deep_focus_sessions, 1);
        assert_eq!(out.deep_focus_seconds, 1800);
        assert_eq!(out.explicit_theme_coverage_pct, 100.0);
        assert_eq!(out.sessions[0].category_mix.len(), 2);
    }

    #[test]
    fn sqlite_loader_clips_a_capture_across_the_requested_day_boundary() {
        use chrono::TimeZone;

        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE reports (
                created_at TEXT NOT NULL,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                jira_ticket_id TEXT,
                duration_seconds INTEGER NOT NULL,
                active_app TEXT,
                window_title TEXT,
                theme_hint TEXT
            );",
        )
        .unwrap();
        let local_end = chrono::Local
            .with_ymd_and_hms(2026, 8, 23, 0, 10, 0)
            .single()
            .unwrap();
        let stored_utc = local_end
            .with_timezone(&chrono::Utc)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        conn.execute(
            "INSERT INTO reports VALUES (?1, 'Writing', 'Cross-midnight draft', NULL, 1200, 'Writer', 'Draft', 'Report')",
            params![stored_utc],
        )
        .unwrap();

        let first_day = summarize_from_db(&conn, "2026-08-22", "2026-08-22").unwrap();
        let second_day = summarize_from_db(&conn, "2026-08-23", "2026-08-23").unwrap();

        assert_eq!(first_day.focus_eligible_seconds, 600);
        assert_eq!(second_day.focus_eligible_seconds, 600);
        assert_eq!(first_day.sessions[0].focus_seconds, 600);
        assert_eq!(second_day.sessions[0].focus_seconds, 600);
    }

    #[test]
    fn labelled_timeline_eval_has_zero_minute_and_session_error() {
        #[derive(serde::Deserialize)]
        struct FixtureSample {
            start: String,
            seconds: i64,
            category: String,
            theme: Option<String>,
        }
        #[derive(serde::Deserialize)]
        struct FixtureCase {
            id: String,
            samples: Vec<FixtureSample>,
            deep_seconds: i64,
            deep_sessions: usize,
            total_sessions: usize,
            interrupted_sessions: usize,
            theme_switches: usize,
            resume_events: usize,
            distraction_events: usize,
            context_seconds: i64,
        }

        let fixtures: Vec<FixtureCase> =
            serde_json::from_str(include_str!("../testdata/focus_timeline_cases.json"))
                .expect("valid timeline fixture");
        assert!(
            fixtures.len() >= 10,
            "timeline eval needs multiple scenarios"
        );

        let mut absolute_minute_error = 0.0;
        let mut session_count_error = 0usize;
        let mut total_session_count_error = 0usize;
        let mut interrupted_session_count_error = 0usize;
        let mut switch_count_error = 0usize;
        let mut resume_count_error = 0usize;
        let mut distraction_count_error = 0usize;
        let mut context_minute_error = 0.0;
        let mut failures = Vec::new();
        for fixture in &fixtures {
            let samples = fixture
                .samples
                .iter()
                .map(|row| ActivitySample {
                    start: NaiveDateTime::parse_from_str(&row.start, "%Y-%m-%d %H:%M:%S").unwrap(),
                    duration_seconds: row.seconds,
                    category: row.category.clone(),
                    description: format!("{} fixture", row.category),
                    ticket: None,
                    theme_hint: row.theme.clone(),
                    app_name: Some("Fixture app".into()),
                    window_title: Some(fixture.id.clone()),
                })
                .collect();
            let actual = summarize(samples);
            absolute_minute_error +=
                (actual.deep_focus_seconds - fixture.deep_seconds).abs() as f64 / 60.0;
            session_count_error += actual.deep_focus_sessions.abs_diff(fixture.deep_sessions);
            total_session_count_error += actual.sessions.len().abs_diff(fixture.total_sessions);
            let interrupted_sessions = actual
                .sessions
                .iter()
                .filter(|session| session.interrupted)
                .count();
            interrupted_session_count_error +=
                interrupted_sessions.abs_diff(fixture.interrupted_sessions);
            switch_count_error += actual.theme_switches.abs_diff(fixture.theme_switches);
            resume_count_error += actual.resume_events.abs_diff(fixture.resume_events);
            distraction_count_error += actual
                .distraction_events
                .abs_diff(fixture.distraction_events);
            context_minute_error +=
                (actual.context_work_seconds - fixture.context_seconds).abs() as f64 / 60.0;
            if actual.deep_focus_seconds != fixture.deep_seconds
                || actual.deep_focus_sessions != fixture.deep_sessions
                || actual.sessions.len() != fixture.total_sessions
                || interrupted_sessions != fixture.interrupted_sessions
                || actual.theme_switches != fixture.theme_switches
                || actual.resume_events != fixture.resume_events
                || actual.distraction_events != fixture.distraction_events
                || actual.context_work_seconds != fixture.context_seconds
            {
                failures.push(format!(
                    "{}: seconds {}/{}, deep sessions {}/{}, all sessions {}/{}, interrupted sessions {}/{}, switches {}/{}, resumes {}/{}, distractions {}/{}, context seconds {}/{}",
                    fixture.id,
                    actual.deep_focus_seconds,
                    fixture.deep_seconds,
                    actual.deep_focus_sessions,
                    fixture.deep_sessions,
                    actual.sessions.len(),
                    fixture.total_sessions,
                    interrupted_sessions,
                    fixture.interrupted_sessions,
                    actual.theme_switches,
                    fixture.theme_switches,
                    actual.resume_events,
                    fixture.resume_events,
                    actual.distraction_events,
                    fixture.distraction_events,
                    actual.context_work_seconds,
                    fixture.context_seconds
                ));
            }
        }

        let n = fixtures.len() as f64;
        let minute_mae = absolute_minute_error / n;
        let session_mae = session_count_error as f64 / n;
        let all_session_mae = total_session_count_error as f64 / n;
        let interrupted_session_mae = interrupted_session_count_error as f64 / n;
        let switch_mae = switch_count_error as f64 / n;
        let resume_mae = resume_count_error as f64 / n;
        let distraction_mae = distraction_count_error as f64 / n;
        let context_minute_mae = context_minute_error / n;
        eprintln!(
            "timeline_eval n={} deep_minute_mae={:.3} deep_session_mae={:.3} all_session_mae={:.3} interrupted_session_mae={:.3} switch_mae={:.3} resume_mae={:.3} distraction_mae={:.3} context_minute_mae={:.3}",
            fixtures.len(), minute_mae, session_mae, all_session_mae, interrupted_session_mae, switch_mae, resume_mae, distraction_mae, context_minute_mae
        );
        assert!(failures.is_empty(), "timeline failures: {failures:?}");
        assert_eq!(minute_mae, 0.0);
        assert_eq!(session_mae, 0.0);
        assert_eq!(all_session_mae, 0.0);
        assert_eq!(interrupted_session_mae, 0.0);
        assert_eq!(switch_mae, 0.0);
        assert_eq!(resume_mae, 0.0);
        assert_eq!(distraction_mae, 0.0);
        assert_eq!(context_minute_mae, 0.0);
    }

    #[test]
    fn fixture_eval_reports_zero_minute_error_and_resume_latency() {
        let mut before = sample(22, 9, 0, 1500, "Writing", None);
        before.theme_hint = Some("Policy brief".into());
        let interruption = sample(22, 9, 25, 120, "Communication", None);
        let mut after = sample(22, 9, 27, 1500, "Writing", None);
        after.theme_hint = Some("Policy brief".into());
        let out = summarize(vec![before, interruption, after]);

        let expected_deep_seconds = 3000;
        let minute_absolute_error = (out.deep_focus_seconds - expected_deep_seconds).abs() / 60;
        assert_eq!(minute_absolute_error, 0);
        assert_eq!(out.deep_focus_sessions, 2);
        assert_eq!(out.resume_events, 1);
        assert_eq!(out.average_resume_seconds, Some(120.0));
    }
}
