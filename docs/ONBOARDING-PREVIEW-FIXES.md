# Onboarding previews and temporary Notion availability

Changes prepared on 2026-10-01 from commit
`25c6597c86d8e87ce42bfa8d0a631434813797b8`.

## Session example

The Break label previously started at x=150 while its rectangle started at
x=176 and was only 22 SVG units wide. The example now gives Break a 62-unit
rectangle and places its label inside it, matching the writing and review blocks.
The existing responsive SVG sizing and reduced-motion behavior are retained.

## Notification example

The focus-reminder setup step displays a recognisable FlowSight desktop
notification, explicitly labelled Example. Its generic wording matches the
shipped `Advice::ChooseOneTask` template in `focus_alerts.rs`. It includes no
task/activity details by default. Enabling the separate context option changes
the example to the shipped contextual template with the fictional task
“Write proposal”; the caption identifies that task as fictional.

The preview never sends a notification, requests permission, starts tracking,
or saves consent. Disabling reminders clears and disables the context choice,
and restores the generic preview. The existing finish-setup flow still handles
the user's explicit settings choices.

## Notion temporarily unavailable

Notion publishing controls and the integration modal have been removed from
the renderer. A `NOTION_INTEGRATION_ENABLED = false` guard prevents its retained
renderer connection, search, destination, publication and erasure entrypoints
from calling native commands. Both empty and populated Insights views keep the
local Work report action. Existing provider implementation, credentials,
destinations and publication history are retained; this change does not erase
them. Backend direct APIs are unchanged.

## Verification

`scripts/verify-session-onboarding.mjs` checks the real renderer with isolated
synthetic Tauri responses at 340×400, 370×700, and 900×800 (dark). The additional
checks verify every SVG label is contained by its own block, both notification
preview modes, consent independence, context reset, no notification/tracking
side effects, and Notion's absence in empty/populated Insights with free and
Pro entitlements. Screenshots in `.impeccable/review/` are renderer previews,
not native operating-system notifications or private activity data.

Results on 2026-10-01: all three browser cases passed; 81 renderer tests passed;
the production Vite build passed. The planning and reminder screenshots were
inspected at the minimum, default, and wide dark sizes. At 340×400 the existing
scrollable middle region and visible “More settings below” control keep the
footer actions reachable while allowing all content to be read.
