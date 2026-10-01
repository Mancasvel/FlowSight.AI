# Session planning and first-run setup

## Local planning

Today offers **Let’s plan today’s session** beside the timer. Describe the work,
estimates, fixed commitments, and today's available start/end times. The shipped
Qwen3-VL model identifies requested tasks and duration estimates through one
planning-only function. It receives
local tasks, overlapping local calendar entries, saved preferences, an optional
work profile, and observed time aggregates by task from the last 14 days.

The host schedules those tasks in free local calendar intervals, inserts visible
rest blocks between work blocks, and splits long tasks at the chosen focus
duration. The model never calculates clock offsets. Breaks default to ten minutes;
explicit 5–30 minute break requests override the model. Fixed local events remain
busy time and do not count as rests. Explicitly quoted meeting/lunch/class ranges
in HH:MM format are also reserved. Durations are estimates, not evidence that an
exercise can be completed in that time.

Each proposed task must quote the specific requested work. Explicit topic lists
and bullet lists require a separate task for every item, so a generic warm-up,
unrelated task, or four merged exercises cannot be accepted as a ready draft.
After one invalid response the host asks for one repair. If both fail, a limited
**Local fallback** may schedule an explicit task list using transparent estimates
from the available budget (capped at 75 minutes per task), never learned task
durations. Unsupported revision/fixed-time prose is rejected for clarification
rather than silently ignored. The fallback is clearly labelled in the summary
and task rationale. Unfinished work lists the topic and estimated minutes still
needed after reserving rests and commitments.

The model cannot execute tools from this flow. A proposal is held in memory for
30 minutes. Feedback replaces the proposal; editing the session inputs invalidates
it. **Add to my calendar** is the explicit confirmation that saves all reviewed
blocks together in the existing DPAPI-protected local agent state. Confirmation
rechecks the times and calendar conflicts before saving and consumes the pending
proposal. Discarding, expiry, app exit, or deleting local data removes pending
proposals. Local blocks are visible in Today.

Connected Google/Microsoft events are not exported or modified by this planner.
Include those fixed commitments in the request when needed. Existing cloud
calendar and recap permissions remain independent.

## Optional first-run setup

Five steps cover optional name/work context and daily goal, planning, focus
reminders, automatic weekly reports, and connected cloud calendars. **Skip setup**
is always available. Reminders and optional sharing start off. Automatic reports
require a chosen local folder and only run while FlowSight is open. Finishing
setup does not start tracking or accept monitoring/sharing consent.

The compact wizard keeps actions and live errors in a separate footer. Its middle
region scrolls and offers a visible remaining-settings control. Keyboard focus
stays inside the wizard, and diagrams respect reduced motion.

## Verification

Normal checks:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @flowsight/agent test:renderer
cargo test --manifest-path apps/agent/src-tauri/Cargo.toml --lib
cargo fmt --manifest-path apps/agent/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/agent/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Browser flow checks use Playwright as a development dependency, an isolated
synthetic Tauri adapter, and a running Vite renderer. They never touch a personal
database. Install Chromium once with `corepack pnpm exec playwright install chromium`,
start Vite, and run:

```powershell
corepack pnpm --filter @flowsight/agent exec vite --host 127.0.0.1 --port 1421
# In a second terminal:
$env:FLOWSIGHT_RENDERER_URL = 'http://127.0.0.1:1421'
node scripts/verify-session-onboarding.mjs
```

The script checks configuration, keyboard wrapping, visible failure recovery,
revision without writes, draft expiry after a failed revision, one confirmation,
minimum-size resizing/scrolling, and no JavaScript or window errors. Screenshots
in `.impeccable/review/` show the real renderer with synthetic data, rather than a
native application capture.

The optional model smoke test starts the shipped runtime on a free loopback port,
uses the Rust planner's exact request and validator with synthetic context, and
stops the server after the test. It does not read personal data or save events:

```powershell
$env:FLOWSIGHT_LLAMA_RUNTIME = 'C:\path\to\unpacked\local_llm'
node scripts/check-local-session-plan.mjs
```

On 2026-10-01, the real Qwen runtime generated three valid blocks and revised
their order in response to feedback. The model requires string `tool_choice:
"required"`; a named object choice is not supported by the bundled server.
Host validation still allows exactly one `propose_session_blocks` call.

## Coherent-session regression (2026-10-01)

The reported ADDA request was tested with the actual shipped Qwen3-VL-2B runtime,
CPU settings, synthetic empty context, the exact Rust request builder, and the
host decoder. The old protocol confused 10:35 with an offset of 1,035 minutes and
returned one merged exercise; the current protocol returned four separate tasks.
The host placed 75-minute assumed estimates at 10:35–11:50, 12:00–13:15,
13:25–14:40, and 14:50–16:05, separated by ten-minute rest blocks. A real revision
put PLE first and changed the three rests to fifteen minutes, ending at 16:20.
No fallback was used for either valid model response. No calendar was written.

Focused regressions cover missed/merged/unrelated/warm-up tasks, explicit duration
and order changes, break-duration language, partial/deferred tasks in shorter
windows, fixed commitments omitted by the model, local-calendar conflicts,
late-conflict atomic rejection, and calendar writes only after confirmation.
The generated harness extracts source text rather than reimplementing the planner:

```powershell
python scripts/prepare-session-plan-harness.py
cargo test --manifest-path .impeccable/review/suggestions-harness/Cargo.toml --release
cargo build --manifest-path .impeccable/review/suggestions-harness/Cargo.toml --release
$env:FLOWSIGHT_LLAMA_RUNTIME = 'C:\path\to\unpacked\local_llm'
$env:FLOWSIGHT_PLAN_REVISE = '1'
node scripts/probe-session-suggestions.mjs
```

This semantic check improves enumerated requests; it is not a claim of universal
natural-language planning correctness. All proposals still require user review.

The independent visual review scored all five reported material fixes resolved.
This feature is included from the 5.0.10 Windows release.
