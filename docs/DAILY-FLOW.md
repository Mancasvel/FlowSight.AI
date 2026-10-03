# Daily Flow: first gamification release

FlowSight helps people understand and manage their working time. The first
gamification loop rewards returning to a small intentional practice, rather than
longer workdays or a score for the quality of someone's work.

## Research and skill selection

The local skill catalog and OpenAI's curated catalog had no dedicated gamification
skill. Three public candidates were inspected on 2026-10-03:

- [digital-gamification](https://github.com/mulosbron/gamification-skills/tree/main/skills/digital-gamification): selected for its target-behavior and engagement-loop design, gradual introduction of mechanics, and caution against points-only rewards. Installed at commit `9fb8fc7591e3445959e8d2bf28647275471f8b0b`. Educational examples were adapted to a work companion; unsourced outcome claims in that skill were not used as product evidence.
- [gamification-strategy](https://github.com/lionelsimai/claude-skills-collection/tree/main/skills/gamification-strategy): a short generic planning template; little implementation guidance.
- [progression-system-auditor](https://github.com/frankxai/awesome-gamification-agent-skills/tree/main/skills/progression-system-auditor): useful warnings about evidence and grind, primarily aimed at mastery systems for agents and games.

The reference products were selected for relevant mechanisms, not as a market ranking:

| Product and primary source | Useful mechanism | Application to FlowSight |
| --- | --- | --- |
| [Duolingo: separating goals and streaks](https://blog.duolingo.com/improving-the-streak/) | One small action can preserve a streak independently of an ambitious goal. Duolingo reported a **3.3% relative increase in Day 14 retention** in its experiment. | Keep the 15-minute daily win separate from FlowSight's hours goal. This is evidence from Duolingo, not a predicted FlowSight result. |
| [Duolingo: habit research](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) | Visible continuity, brief milestone feedback, and flexibility around missed days. | Preserve yesterday's streak until today ends; keep cumulative milestones after rest days. |
| [Forest](https://www.forestapp.cc/) | Focus sessions become a visible record of effort. Core tracking can work offline. | Show earned days on a weekly strip using local saved time. Avoid adding another timer or an unlimited points economy. |
| [Finch](https://finchcare.com/) | Caring for oneself provides progress for a personal companion. | Recognise a beneficial action with supportive copy. The public homepage was readable only in part; deeper help pages were blocked, so no detailed mechanic or effectiveness claim is inferred. |

## Shipped loop

1. Start tracking using the existing Today control.
2. Accumulate 15 recorded minutes during the local calendar day. Split sessions
   count; paused time and Pomodoro breaks do not.
3. Earn one daily win. A short inline animation and screen-reader announcement
   acknowledge a newly earned win; initial loads are quiet.
4. Aim for three earned days per Monday–Sunday week. The seven-day strip shows
   earned, current, upcoming, and rest days.
5. Reach cumulative milestones at 1, 3, 7, and 30 earned days. A rest day resets
   a consecutive-day streak after the day ends, but never removes earned milestones.

Daily Flow lives in Reports / Insights directly below the Insights heading. Its
native disclosure is closed on a fresh load and shows today's localized date,
the consecutive-day streak, an expansion chevron, and the weekday dot strip.
The weekday labels and small empty/filled circles remain visible in both states.
Opening the row reveals daily progress, the weekly target, and all milestones. The same panel
node preserves its open state during live updates, report refreshes, and tab
navigation; it also appears before any activity is recorded. Today contains only
the existing tracking and planning controls.

Daily Flow is available locally without an account or paid plan. A Settings
checkbox hides the disclosure, including its streak. It uses the renderer's
existing language and theme choices. Reduced motion disables the celebration
animation.

## Data and correctness

`get_daily_flow_progress` snapshots and reads the existing SQLite
`tracking_daily_time` table. A date qualifies at 900,000 saved milliseconds.
Each primary-key date contributes at most once. No external service, report text,
task title, AI judgement, or network request is introduced.
Existing recorded tracking days qualify retroactively. Reports and tracking time
are not added together, and historical report-only days are not backfilled.

Progress survives renderer reloads because SQLite is authoritative. Local data
export includes tracking days and the minimal Daily Flow summary. Before raw
tracking days expire under the user's retention choice, a config record keeps
the lifetime win count, most recent win date, streak at that win, and up to seven
earned dates for the current week. This preserves milestones and weekly progress
even with one-day retention, without a lifetime date ledger. Local erasure drops
the tracking table, deletes this config record, and clears renderer preferences.
The visibility preference and latest celebration
date use localStorage, with a session-only fallback when storage is unavailable.
Calendar arithmetic uses local dates at noon rather than 24-hour millisecond
steps so streaks and week boundaries survive daylight saving changes.

The 15-minute threshold is a habit measure, not proof of deep work or productive
output. The UI states this explicitly. Daily Flow introduces no employee ranking,
global leaderboard, XP farming, punitive message, or feature unlock gate.

## Scope and next evaluation

This slice implements the desktop renderer used on Windows, macOS, and Linux.
The separate iOS and Android repositories are outside this change. Native
packages and automatic updates require the normal release process.

Evaluate whether first-week activation and return use improve before adding
more mechanics. Suggested measures are first-win rate, three-day weekly goal
rate, Day 7/Day 14 return, and feature hide rate. No new analytics collection
ships in this slice. Establish a baseline before an opt-in controlled experiment;
there is no evidence yet that these choices improve FlowSight retention.

Potential later additions are user-selected workdays and cooperative goals, if
user feedback supports them. Keep rest, autonomy, and private progress intact.
