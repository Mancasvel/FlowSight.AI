# Jira authorization and local session planning

## Reported provider message

> You don’t have access to this app. This application is in development — only
> the owner of this application may grant it access to their account.

This message is consistent with an Atlassian OAuth 2.0 (3LO) integration that is
still private. Atlassian documents that new 3LO apps are private by default: only
the owner can install and use them until sharing is enabled. A screenshot or the
browser hostname is needed to confirm the specific provider. Do not include a
full authorization URL in diagnostics because it contains session parameters.

## Owner-side configuration

For the FlowSight Jira app, the owner must:

1. Open the Atlassian Developer console using the app owner's account.
2. Select the OAuth 2.0 (3LO) app used by the deployed FlowSight client ID.
3. Select **Distribution** and enable **Sharing**.
4. Verify **Authorization → OAuth 2.0 (3LO)** and the registered redirect URL.
   The current desktop direct OAuth flow uses `http://localhost:12345/callback`.
5. Retry connecting Jira with the intended user account and verify Jira task
   retrieval. No token or client-secret changes are needed solely to enable
   sharing.

Enabling sharing and Atlassian review/Marketplace listing are separate settings.
The local scheduler cannot bypass a provider's distribution policy. Source code
changes do not prove this remote setting is enabled.

Official reference, checked 2026-10-01:

https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#distributing-your-oauth-2-0--3lo--apps

## Local planner boundary

**Suggest my session** does not connect Jira, Linear, Notion, Google Calendar or
Microsoft Calendar. It calls `propose_session_plan`, starts the bundled local
model when necessary, reads local planning context, and holds a draft for review.
**Confirm and add blocks** only saves to the FlowSight local calendar. A cloud
login or successful provider OAuth is not required for this workflow.

Jira/Linear authorization begins only from their explicit integration controls.
Cloud calendar connection begins only from its Connect controls. Notion is
disabled in the current renderer. A provider browser rejection can affect that
connection, but does not block creating a local day plan.

`scripts/verify-adda-renderer.mjs` exercises the signed-out local workflow with
all provider connection/task-fetch commands deliberately failing if invoked.
It asserts that initial planning and revision make none of those calls, while
retaining four ADDA tasks, three rests, and no calendar writes.
