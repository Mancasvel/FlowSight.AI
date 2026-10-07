# FlowSight

**Privacy-first developer productivity intelligence — runs locally on your machine.**



[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Commercial License available](https://img.shields.io/badge/Commercial%20License-available-green.svg)](./COMMERCIAL-LICENSE.md)
[![CLA required](https://img.shields.io/badge/CLA-required-orange.svg)](./CLA.md)
[![Buy me a coffee on Ko-fi](https://img.shields.io/badge/Buy%20me%20a%20coffee-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/mancasvel)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Mancasvel/FlowSight.AI)

FlowSight is a desktop application that helps distributed engineering
teams understand how their work flows, without the surveillance baggage of
traditional productivity tools. **Core work-context processing happens on the
developer's machine**: screen context, git metadata, and activity summaries
are analyzed by a bundled local LLM. The tracker and reports work
locally. Optional cloud features, such as calendar connections and the Coach,
require a separate sign-in and consent; connecting an external AI through MCP
can also send the requested report data to that AI.

---

## Features

- **100% local inference** — bundled `llama.cpp` + quantized Qwen3-VL-2B-Instruct GGUF
  weights downloaded once and verified on the device. No cloud roundtrips for
  sensitive data; inference works offline after the model is present.
- **Desktop-native** — Tauri 2 (Rust) shell, Vite frontend, SQLite for local
  state. Windows releases offer an `.exe` installer and an `.msi`; in-app
  updates are signature-verified.
- **Activity-oriented, not surveillance-oriented** — the agent surfaces
  meaningful work units (branches, PRs, focus windows) rather than keystroke
  counts.
- **Opt-in local focus reminders** — on Windows, Qwen can propose a reminder
  through an internal tool using only aggregate signals. FlowSight checks
  tracking state, consent, observed evidence and cooldown before showing it.
  Reminders use generic text by default. A separate Profile setting can add a
  verified public app or site label and the selected task to the local system
  notification; names are never sent to Qwen for the reminder decision.
  External MCP clients cannot call this tool.
- **Weekly work reports** — choose a weekday, local time, and folder in Settings.
  FlowSight creates the same seven-day PDF as the Work report button while it
  is open, including when its window is in the system tray. It saves at most
  one automatic report per week and leaves previous PDFs intact.
- **Team analytics, with consent** — opt-in aggregation into a Supabase
  backend only for users who join a team.
- **Self-hostable backend** — the Community Edition can run against your own
  Supabase instance.

## Current release: v5.0.10 (Windows)

- **Let's plan today's session** in Today uses the bundled local model to suggest
  time blocks from your available hours, task estimates and saved context. Review
  or revise the draft before adding blocks to the private FlowSight calendar.
- The shorter first-run setup introduces the main features while configuring
  daily goals, reminders, reports and optional calendar connections.
- The Windows installer includes signed Visual C++ runtime files and checks
  their integrity when the app starts and before local AI starts.

- The optional cloud Coach runs its reply and usage requests off the UI thread,
  so the rest of the app remains responsive while a request is pending.
- In Today, a connected Google or Microsoft Calendar event shows a progress
  bar for elapsed **scheduled event time**. It is independent of recorded work
  time; the daily goal remains a separate text value without a duplicate bar.
- The Windows release provides an NSIS installer and `latest.json` with its
  update signature. The `.msi` is also offered when packaging succeeds; see
  [GitHub Releases](../../releases).

The FlowSight local calendar used by session planning stays on this device.
Connecting Google or Microsoft Calendar is part of the eligible paid cloud plan
described below.

## Bring your own AI (MCP)

The installed app includes a read-only [FlowSight MCP server](docs/MCP.md).
Open Settings > Connect your AI for the exact command to use in a compatible
desktop AI client. No extra runtime is required, and activity descriptions
and ticket IDs are excluded by default.

## Local action agent

The **Local agent** tab lets the on-device Qwen3-VL model suggest one action at a
time. FlowSight validates the tool name and arguments before executing it. A
change is shown with its concrete target and waits for confirmation for five
minutes; cancelled and expired proposals do nothing. Local tasks, events,
drafts, preferences and an action audit stay encrypted for the current Windows
user and are included in the local data export (access tokens are excluded).
The model first chooses one tool family; only that family's definitions enter
the action turn, and calls outside the offered family are refused.

Available tools are `focus.start`, `focus.pause`, `focus.resume`, `focus.end`,
`system.set_dnd`, `browser.list_tabs`, `browser.block`, `browser.unblock`,
`browser.close_tab`, `browser.restore_tab`, `tasks.create`, `tasks.list`,
`tasks.update`, `tasks.complete`, `tasks.reprioritize`,
`calendar.get_availability`, `calendar.list_events`, `calendar.get_current_event`, `calendar.create_event`,
`calendar.move_event`, `notifications.digest`, `messages.draft`,
`messages.list_drafts`, `project.get_current_work`,
`project.prepare_pr_description`, `desktop.open_resource`, `automation.run_playbook`,
`memory.save_preference`, `memory.forget_preference`, and
`memory.list_preferences`.

The code for `messages.send`, `project.update_status`, and
`project.create_subtask` is present but disabled in this release until scoped
provider tests pass. Calendar creation and changes requested through local-agent
tools remain limited to FlowSight's local calendar. The separately consented
Calendar companion below can append a mini report to a connected event; it does
not grant the model general event-editing authority.

- **Focus:** Gentle starts tracking; standard also silences Windows app
  notification banners; strict additionally blocks the browser patterns you
  approve. Blocks and banner settings are restored on pause/end or when the
  timed block expires. Windows' separate Focus Assist contact/app allowlists
  are not changed. The digest contains FlowSight reminders held while banners
  were silenced; it cannot read other apps' private notifications.
- **Browser:** Browser actions need the separate FlowSight Browser Controls
  extension. Public users will install it from Chrome Web Store (Arc/Chrome) or
  Microsoft Edge Add-ons (Edge), with no developer mode. The app only offers a
  store button when its official listing URL is configured. If the store still
  serves an older extension, **Open compatible extension folder** provides the
  packaged version: disable the old extension, enable Developer mode in the
  browser's extensions page, and use Load unpacked with that folder. After installation,
  users open the extension's options and enter the port and pairing key from
  **You → Local automations → Browser pairing**. The extension communicates
  only over `127.0.0.1` and requires the pairing key. Temporary blocks expire
  in the extension and are released if FlowSight disconnects. Closing a tab
  saves its URL so it can be restored.
- **Calendar:** Availability and focus-event creation use FlowSight's local
  calendar by default. A paid Calendar companion connection can read the
  current Google or Microsoft event, while `calendar.get_current_event` exposes
  that event to the on-device agent on request. General connected-event edits
  remain disabled.
- **Messages:** Drafts are saved locally and never sent by this release.
- **Projects and playbooks:** `project.get_current_work` can read existing
  FlowSight Jira/Linear connections. A PR description is returned as local text
  for review; FlowSight does not publish it. Deep work, end of day and recover
  focus playbooks return their individual steps and results for review. They
  cannot update external project services in this release.

## Calendar companion (paid cloud plan)

Calendar companion is an optional paid integration in **Settings → Calendar
companion** and the last, skippable onboarding step. It requires an eligible,
active FlowSight Cloud Individual/Pro plan with integrations. The EUR 10
one-time Individual local purchase uses a separate license and does not unlock
Cloud integrations. The calendar APIs need internet access; FlowSight activity
analysis and the mini-report calculation remain local. Free, expired, and
other-account Cloud entitlements cannot connect, read live events, or publish
recaps. The app checks the Cloud entitlement locally; Google's token broker
checks it again against the signed-in Supabase account.

Each user connects their own Google or Microsoft account through their
provider's browser consent screen. FlowSight uses a public desktop OAuth client
ID, Authorization Code with PKCE and a temporary loopback callback; it never
embeds a client secret in the app. Google token exchange uses the paid Supabase
broker described below. Access and refresh tokens are protected with
Windows DPAPI for that user. Revoking access from Settings removes local tokens.
Connections and the publishing switch are also isolated by the signed-in
FlowSight account on a shared computer. Signing out suspends automatic
publishing; another FlowSight account must authorize its own calendar. A new
device must be authorized separately, because DPAPI credentials do not roam.
The app refreshes short-lived tokens when necessary. Google requests
`calendar.events.owned` and `calendar.calendarlist.readonly`; Microsoft requests
`Calendars.ReadWrite` and `offline_access`. Google reads owned calendars and
Microsoft reads editable calendars, expanding recurring event occurrences.
All-day, cancelled and free events are ignored. If more than one event overlaps,
FlowSight does not choose one or publish a report.

The live event title and time appear in Today above the tracking controls,
with a link that opens the event in its calendar. The bar beneath it shows
elapsed scheduled time for that event, not tracked work time or daily-goal
completion. Manual task detail stays
below as an optional supplement; Settings shows connection and consent status
without repeating the event. With the separate **Add a mini work report** switch
on, FlowSight appends a short recap only after a timed event it observed while
running and which the connected user organizes. This includes meetings with
guests: the recap can be visible to them and the calendar service may send an
update. The recap has three short sections: **At a glance** compares scheduled and
observed time and summarizes the activity pattern; **Time by activity** shows
up to three categories plus any remainder; **Next step** offers one bounded
suggestion or asks the organizer to record the actual outcome. It never
includes window titles, captured descriptions, URLs, custom category text or a
claim that the planned task was completed. Unknown categories are shown as
**Other**. FlowSight waits briefly for late observations;
if less than a minute was recorded or the event was ambiguous, nothing is
posted.
The existing event body and Teams meeting information are preserved; an
occurrence-specific marker makes retries idempotent. Auto-publishing defaults
off and is stopped if the license is no longer eligible.

For distributors, create and verify **one** Google desktop OAuth application
and **one** Microsoft public/native application for FlowSight. Set their public
IDs as `TAURI_GOOGLE_CALENDAR_CLIENT_ID` and
`TAURI_MICROSOFT_CALENDAR_CLIENT_ID` at build time (GitHub Actions repository
variables of the same names for the Windows release). Enable the Google
Calendar API and publish/verify its consent screen for the scopes above. Google
currently requires the Desktop client's secret even with PKCE, so only the
authenticated, paid `calendar-token` Supabase Edge Function exchanges and
refreshes tokens. Set `GOOGLE_CALENDAR_CLIENT_SECRET` only in Supabase/GitHub
deployment secrets; never package it in Tauri or expose it as `VITE_*`. Calendar
event data and local activity do not go through this token broker. In
Microsoft Entra, support personal and organizational accounts, grant delegated
`Calendars.ReadWrite`, enable a mobile/desktop public client and register the
mobile/desktop redirect `http://localhost/callback` (Entra ignores its dynamic
port for `localhost`; it does not do that for `127.0.0.1`).
The Google Calendar client must be a **Desktop app** credential, not the Web
client used by Supabase Google sign-in. The desktop app sign-in itself also
requires `http://localhost:12345/callback?state=*` in Supabase Auth's Redirect
URLs; the callback URL without the dynamic `state` query is insufficient.
Without a configured ID, the corresponding Connect button is disabled; a
Supabase Google sign-in does not grant these Calendar scopes. Validate both
providers with owned test events, guest meetings and recurrent instances before
announcing the integration as live.

## Status

FlowSight is in **active development**. The current Windows version is
**v5.0.10**; check the [Releases](../../releases) page for installers and notes.

---

## Quick start

### Prerequisites

- **Windows 10/11** for this repository's installer; macOS and Linux have
  separate repositories and release pipelines.
- **Rust** stable (for building the Tauri shell).
- **Node.js** 18+ and **pnpm** 8+.
- **Python** 3.11+ (optional: run local review-queue tests and future model evaluation tools).
- **Visual Studio C++ tools** with distributable x64 CRT files (14.40 or newer)
  for a Windows build. The staging script discovers Visual Studio 2022 or 2026
  through `vswhere` and verifies each DLL's Microsoft signature and x64 format.

### Install and run

```bash
git clone https://github.com/Mancasvel/FlowSight.AI.git
cd FlowSight.AI
pnpm install
powershell -File scripts/stage-msvc-runtime.ps1
pnpm dev
```

The dev command starts the agent with hot reload. The first run downloads
the GGUF model from the repository's GitHub Release (see `scripts/fetch-models.mjs`).

### Build a release installer

```bash
pnpm build
```

The installer lands in `apps/agent/src-tauri/target/release/bundle/`. It
bundles `llama-server.exe`, its DLLs, and signed Microsoft Visual C++ runtime
files beside both executables. Installed releases verify the bundled files
at startup and again before starting local AI. If a file is missing or damaged,
FlowSight automatically downloads a signature-verified installer, replaces the
packaged files in the same per-user installation, and restarts. If the download
fails, the repair screen offers a manual retry without showing technical errors.
The installer does not remove `%LOCALAPPDATA%\FlowSight`, which stores local
history, settings, and license state. If `app.exe` itself cannot open, run the
latest installer from the official release page; an app that cannot start cannot
offer its in-app repair screen. On first use, FlowSight downloads the two GGUF
weights into the user's app-data directory, verifies their SHA-256,
and then runs without network access. Keeping the weights out of NSIS also
makes later app updates much smaller.

The checkpoint is Qwen3-VL-2B-Instruct (Apache-2.0), using the Qwen team's official Q4_K_M GGUF;
see [model provenance and hashes](./local_llm/MODEL_NOTICE.md). It is not yet
fine-tuned on FlowSight usage. The [local review workflow](./docs/LOCAL_FINETUNE_READINESS.md)
prepares optional, human-checked labels for a future model iteration.

---

## Architecture (short version)

```
+-------------------------------+       +-----------------------+
|  Tauri agent (Rust)           |       |  Supabase backend     |
|   - OAuth (Google)            |<----->|   - Teams             |
|   - Context capture           |       |   - Aggregated events |
|   - Local LLM (llama.cpp)     |       |   - RLS per team      |
|   - SQLite state              |       +-----------------------+
+---------------+---------------+
                |
                v
     %LOCALAPPDATA%\FlowSight\
     (logs, db, cache — local only)
```

The core context summarization and local-agent inference use the bundled
`llama-server.exe` on loopback. Team aggregation, connected calendars and the
optional cloud Coach have separate consent and network requirements; see the
feature-specific documentation above before enabling them.

## Repository layout

```
apps/
  agent/          Tauri desktop app (Rust + Vite frontend)
  dashboard/      Next.js team dashboard (optional)
local_llm/
  bin/            llama-server.exe + DLLs (committed, ~50 MB)
  *.gguf          Local model weights (fetched at build time, not committed)
scripts/
  fetch-models.mjs  Prebuild hook (Node-only): downloads GGUF from GitHub Releases
.github/
  workflows/      CI (build, release, gitleaks)
```

## Configuration

All user-facing settings live in the desktop app. Local state is persisted
under:

- **Windows:** `%LOCALAPPDATA%\FlowSight\`
- Logs: `server.log`, `agent_error.log`, `crash.log`
- Database: `dev-agent.db` (SQLite)

No configuration file is expected on the user's side. The environment
variable `GITHUB_TOKEN` is only needed by developers who want to fetch
model assets from a private release.

---

## Join Us

**We're hiring our first engineer.**

FlowSight is a privacy-first productivity tool whose core tracker and reports run locally on your machine. Optional cloud integrations require consent. Backed by Microsoft for Startups, incubated at Xiji (Shanghai), part of AltaLab's accelerator.

### The problem we're solving
- Teams waste hours in meetings that could be a message
- "Productivity tools" are surveillance with a nicer UI
- No one trusts their data with the tools they use at work
- Privacy and good UX shouldn't be mutually exclusive

### Who we're looking for
- You've shipped something end-to-end (side project, startup, open source)
- You're comfortable with Rust, TypeScript, or systems-level work
- You understand why privacy-first architecture matters
- You want to build, not just code tickets

### Why FlowSight
- Equity-first role. Real ownership, not token options
- Product is live. Not a pitch deck, a working app
- Technical CEO who built it solo and needs a multiplier
- Shanghai-based or remote. We care what you build

### How to apply

Send an email to **manuel@flowsight.site** with:
- Something you've built that you're proud of
- Why privacy-first AI matters to you
- Your GitHub or portfolio

No cover letters. No culture fit essays. Show us what you've done.

---

## License and distribution

FlowSight offers two licensing routes for the **same eligible base code**.
Commercial rights require a signed agreement and a release-specific rights audit;
third-party licenses remain applicable. Separately licensed institutional modules,
if introduced, have a distinct product and dependency boundary.

| Edition | License | Intended for |
|---|---|---|
| **Community** | [GNU AGPL-3.0](./LICENSE) | Anyone, including commercial users, who follows the AGPL |
| **Enterprise / Commercial** | [Proprietary, per contract](./COMMERCIAL-LICENSE.md) | Different license terms for closed-source distribution, SaaS, OEM, or policies that forbid AGPL |

AGPL permits commercial and educational use without paying FlowSight, subject
to its terms. A modified version supporting remote network interaction must
prominently offer its interacting users the Corresponding Source under section
13; distribution can trigger further obligations. A separately signed commercial
agreement may remove AGPL copyleft duties for the covered eligible code.
Installer purchases, Pro subscriptions and commercial source rights are distinct.

For universities, see the
[commercial policy](./COMMERCIAL-LICENSE.md) and
[agreement draft](./docs/licensing/UNIVERSITY-AGREEMENT-TEMPLATE.md), including
support/SLA, stable updates, privacy and no individual productivity/focus rankings.
The draft requires legal review, completed schedules and signatures.

### Contributing

Contributions require a verified sufficient grant before merge:
[individual CLA](./CLA.md) or [corporate CLA](./CLA-CORPORATE.md).
The contributor retains copyright; the grant permits alternative commercial
licensing. Follow the [signature process](./docs/licensing/CLA-PROCESS.md) and
[CONTRIBUTING.md](./CONTRIBUTING.md). Automated collection is not assumed.
Historic contributions require a separate [rights audit](./docs/licensing/RIGHTS-AUDIT.md).

### Code of Conduct

Participation is governed by the [Contributor Covenant](./CODE_OF_CONDUCT.md).

### Security

If you find a vulnerability, **please do not open a public issue**. Use
GitHub's private Security Advisory feature on this repository, or email
**manuel@flowsight.site**.

---

## Support FlowSight

FlowSight's source code is open source under the AGPL. If it's useful to you, consider supporting the project:

### 💜 [Buy me a coffee on Ko-fi](https://ko-fi.com/mancasvel)

Every coffee helps keep development going. All funds go directly to:

- **Server costs** — CI/CD, model hosting, Supabase backend
- **Model improvements** — better local LLMs for activity analysis
- **Cross-platform** — Linux and macOS builds
- **New features** — team analytics, integrations, plugin system

### Sponsor Tiers

| Tier | Amount | Badge |
|------|--------|-------|
| ☕ Supporter | €1-4 | Listed in [SPONSORS.md](./SPONSORS.md) |
| ☕☕ Champion | €5-14 | Listed + name in app credits |
| 💎 Founding Supporter | €15+ | Listed + featured in app About page |
| 🔄 Monthly Backer | Any recurring | All above + early access to features |

### Other ways to contribute

- ⭐ **Star this repo** — helps with visibility
- 🐛 **Report bugs** — open an issue
- 💻 **Submit a PR** — see [CONTRIBUTING.md](./CONTRIBUTING.md)
- 📣 **Spread the word** — share with your team

---

## Trademarks

"FlowSight" is a trademark of FlowSight. The AGPL license grants you
rights to the code but **not** to the trademark. If you
publish a fork, please pick a different name for your distribution.

---

## Links

- **Product website:** *coming soon*
- **Commercial inquiries:** manuel@flowsight.site
- **Security reports:** manuel@flowsight.site
- **Legal (CLA questions):** manuel@flowsight.site
