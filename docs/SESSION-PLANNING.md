# Session planning and first-run setup

## Local planning

Today offers **Let’s plan today’s session** beside the timer. Describe the work,
estimates, fixed commitments, and today's available start/end times. The shipped
Qwen3-VL model proposes blocks through one planning-only function. It receives
local tasks, overlapping local calendar entries, saved preferences, an optional
work profile, and observed time aggregates by task from the last 14 days.

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

The independent visual review scored all five reported material fixes resolved.
This feature is included from the 5.0.10 Windows release.
