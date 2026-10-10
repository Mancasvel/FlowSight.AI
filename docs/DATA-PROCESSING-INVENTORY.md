# FlowSight Data Processing Inventory

Version: 2026-08-23
Status: technical inventory; controller fields and production-system validation pending

This is the engineering input to an Article 30 record of processing activities. The controller must add business owners, data-subject volumes, actual vendor regions, contracts, safeguards, and any production systems not represented in this repository.

## Local desktop processing

| Store/flow | Data fields or categories | Source and subjects | Purpose | Default and access | Retention/deletion | Security |
|---|---|---|---|---|---|---|
| Active-window capture | Pixels inside the foreground window | User’s device; may incidentally show colleagues/customers/third parties | Local activity classification | Tracking off; common password managers excluded; no cloud recipient | Memory-only for one inference call | Loopback local model; no intentional file write; capture fails closed if active window cannot be identified |
| Raw telemetry ring | Foreground app/title; UI control type/name; window open/close; monotonic timestamp | Operating-system APIs | Context for local summary | Memory only; populated only while tracking | Maximum approximately two minutes; immediate clear on stop; excluded app intervals dropped | Process memory; bounded queue |
| `reports` SQLite table | `id`, summary `description`, `activity_type`, `synced`, `created_at`, optional `jira_ticket_id`, `duration_seconds`, `active_app`, optional `window_title`, `capture_source`, `theme_hint` | Local model, OS metadata, user task selection | History, totals, focus report, optional sync | Local user; `window_title` off by default | 30-day default; UI choices 7/30/90/365; startup/settings/daily purge; full local erasure | Per-user local app-data directory; title field cleared when off; SQLite vacuum after erasure |
| `config`: app preferences | Display name, model/GPU setting, daily goal, work roles/activities/goals, custom job, onboarding state, update time | User/device | Personalise local reports and UI | Local only | Until changed or local erasure | Never included in cloud sync by default; included in user export |
| `work_review_decisions` SQLite table | UUID, choice kind/text, origin period, review date, outcome, optional note, creation/update time | User | Revisit a chosen change or keep the current plan | Local only; excluded from report PDF, MCP and sync; included in explicit personal data export | Existing local retention (30-day default) measured from last update; delete individually or erase all local data | Per-user app-data directory; validated bounded text/date/status; parameterised SQL; no network access |
| `config`: privacy records | Current notice version, acknowledgement time, independent cloud-sync/cloud-AI/title choices, retention days, application exclusions, update time | User | Enforce and demonstrate choices | Optional purposes default off | Until changed/local erasure; changes copied to `privacy_events` | Server mirror contains only account-bound cloud purpose choices |
| `privacy_events` | Purpose name, granted/withdrawn flag, notice version, timestamp | User action | Accountability and dispute resolution | Local only | Until local erasure | Included in export; no content payload |
| `config`: coach history | Message ID, role, content, optional reasoning, timestamp | User and cloud coach | Conversation continuity | Exists only after cloud-AI use | Latest 40 and maximum 30 days; local erasure | Not included in cloud activity sync; exported locally |
| `config`: account sessions | User/account/team IDs, email, provider, access token, refresh token | Supabase/OAuth provider | Authentication and cloud/integration access | Only after sign-in/link | Until logout, expiry/replacement, or erasure | Entire serialized session protected by Windows DPAPI; tokens not returned by stored-session IPC APIs |
| `config`: Jira credentials | Access token, refresh token, cloud/workspace ID | Atlassian OAuth/API | User-requested Jira task integration | Only after connection | Until logout/revocation/local erasure | Tokens protected by DPAPI; response bodies not logged |
| `config`: analytics choice | Decided/consented state, random installation UUID, decision time, pending-withdrawal flag | User/app | Enforce analytics choice and withdrawal | Off by default | Until withdrawal/local erasure | Installation secret stored separately with DPAPI; UUID is pseudonymous, not anonymous |
| `config`: entitlement/sync metadata | Plan/status/features/team IDs; last-sync timestamp/count/host | Supabase/application | Feature gates and sync status | After cloud account use | Until logout/account or local erasure | No bearer token in metadata |
| WebView local storage | Short-lived tracking checkpoint; non-sensitive integration UI flags; legacy invitation key removed on startup | User/app | Restore UI state | No auth-session persistence | Checkpoint max age two minutes; all storage cleared on erasure/account deletion | Supabase `persistSession: false`; invitation bearer values are not retained |
| Local diagnostics | Auth, crash, app, and local-model server status/errors | Application | Security and troubleshooting | Local user/support only when user supplies it | Auth/crash approximately 512 KiB; app logs 1 MiB × maximum 3; server log overwritten; cleared by erasure where possible | Token/email/account/team/invitation/content logging removed; access inherits OS account protections |

The local data subject is normally the device user. Incidental third-party information may appear in a transient image or UI event; users/controllers must use exclusions and avoid unrelated sensitive screens.

## FlowSight/Supabase cloud processing

| Table/system | Fields/categories | Purpose | Lawful-basis candidate | Access/recipients | Retention |
|---|---|---|---|---|---|
| Supabase Auth | User ID, email, provider identity/metadata, sign-in timestamps, password hash where password auth is used | Account authentication | Contract; security legitimate interests | Supabase and authorised operators | Account lifetime plus documented security/legal period **[complete]** |
| `profiles` | ID, display name, avatar URL, role, Jira cloud ID, last seen, creation time; legacy `jira_tokens` column may exist | Profile and role | Contract | User, authorised team administration under RLS, service functions | Account lifetime; migrate/remove any legacy server-token use |
| `licenses` | Owner, plan, limits, dates/status, Stripe subscription/customer references | Entitlement, contract, billing | Contract/legal obligation | Owner, billing/operator | Contract lifetime; statutory records separately retained **[complete period]** |
| `teams` / `team_members` | Team name/ID, owner, licence, project key, member IDs/roles/inviter/join time | Collaboration and access control | Contract; workplace controller basis | Members/owners according to RLS | Team/account lifetime; ownership resolution before erasure |
| `work_sessions` | User/team, duration, summary, category and ticket aggregates, session date/time, expiry | Optional activity sync | Contract/user request or workplace-controller basis | User, authorised team owner, Supabase | 90 days |
| `activity_reports` | User/team, generic description, category, optional ticket, duration, capture time, expiry | Optional activity sync/reporting | Same as above | User, authorised team owner, Supabase | 90 days |
| `cloud_insights` | User/team, report period/type, generated content/model metadata, expiry | Requested cloud report | Contract; AI transfer also requires the cloud-AI choice | User/team per RLS, Supabase, and OpenRouter/model provider for generation | 90 days |
| `prompt_usage` | User/team, billing period, prompt count, expiry | Enforce plan limits | Contract/legitimate interests | Service role/authorised operators | 62 days |
| `privacy_preferences` | User ID, notice version, cloud sync/AI flags, update time | Server-side purpose enforcement/accountability | Legal obligation/accountability and underlying service basis | Service role; policy helper reveals only a boolean for the calling user | Account lifetime or deletion |
| `anonymous_product_analytics` | Random installation UUID, hash of device-held secret, seven daily minute totals, weekly primary category, update/expiry | Product analytics | Consent | Service role and aggregated product staff | 35 days since last consented sync; withdrawal deletion |
| `online_league_consent`, `online_focus_day`, private friend groups/members/invites | Account ID, unique username, registered scoring device, acceptance time, league date, capped eligible focus minutes, scoring/evidence versions, receipt ID; private group name, membership and invitation hash/expiry | Voluntary weekly friend ranking; automatic uploads after separate acceptance | Separate consent | Authenticated RPC; group members see usernames, points and rank. RLS prevents direct table access. No raw observations, tasks, titles, applications or captures in this payload. | Account deletion or league withdrawal removes personal league data and owned groups; invitations expire after seven days. Offline withdrawals retry. Local observation ownership is cleared on withdrawal. |
| `product_feedback` | UUID, optional installation UUID, message, app version, create/expiry | Voluntary feedback | Consent | Authorised product/support staff | 12 months or earlier request/withdrawal when linked |
| `notion_oauth_states` | State UUID, user ID, state hash, expiry/consumption/create time | OAuth CSRF/replay protection | Contract/security legitimate interests | Service role | 10 minutes plus daily purge |
| `notion_connections` | User/workspace/bot metadata, encrypted token ciphertext/IV/version, timestamps | Notion connection | Contract/user request | Service functions only | Until disconnect/account deletion |
| `notion_destinations` | User, Notion object ID/type/title, report mode/default, timestamps | User’s publication configuration | Contract/user request | Service functions only | Until disconnect/account deletion |
| `notion_publications` | User/destination, mode, dates, policy/idempotency, Notion page ID/URL, status/failure, timestamps, expiry | Publication history/idempotency | Contract/security legitimate interests | Service functions/user status | 12 months |
| Invitation records | Recipient email, token, team, creator, expiry/use time | Team invitation | Contract/legitimate interests | Inviter, invited user, service | **[define expiry cleanup; token is excluded from user export]** |

The cloud export registry currently covers profiles, licences, owned teams, memberships, work sessions, activity reports, cloud insights, prompt usage, privacy preferences, Notion metadata, and invitations received/created. It deliberately redacts profile Jira token material, Notion ciphertext/IV, OAuth state hashes, bearer/refresh tokens, and other security secrets.

## External disclosures and transient processing

| Recipient | Trigger | Data disclosed | Role/location/safeguard |
|---|---|---|---|
| Supabase | Account, sync, cloud functions, Notion connection, analytics/feedback | Data described above plus routine network/security metadata | Processor details, region, DPA and transfer safeguard **[REQUIRED]** |
| Microsoft Azure OpenAI | Cloud coach after separate choice | User message, recent conversation, seven-day local activity context, system prompt, model configuration | Processor/subprocessor chain, configured region, no-training terms, DPA/transfer safeguard **[REQUIRED]** |
| OpenRouter and selected model provider | Cloud individual report after cloud-sync and cloud-AI choices | Up to 40 cloud activity samples, aggregate stats, optional local report, prompt | Entities/models/locations, retention, no-training terms, DPA/transfer safeguard **[REQUIRED]** |
| Atlassian Jira | User links/fetches tasks | OAuth tokens, account/workspace identity, issue keys/titles/status | Independent-controller/processor analysis and transfer terms **[REQUIRED]** |
| Linear | User links/fetches tasks | OAuth tokens, account identity, assigned issue IDs/titles/status | Role and transfer terms **[REQUIRED]** |
| Notion | User connects/searches/publishes | OAuth token, workspace/page metadata, user-selected report | Role and transfer terms **[REQUIRED]** |
| Stripe or actual billing provider | Purchase/subscription lifecycle | Account/customer/subscription and transaction data | Processor/independent-controller analysis, DPA, region, statutory retention **[REQUIRED]** |
| GitHub | Update check/download | IP address, user agent/request metadata, release requested | Likely independent controller; document necessity and notice **[REQUIRED]** |
| Support/email/security tooling | User contacts support or an incident occurs | Message, address, attachments, diagnostics supplied by user | Name vendors, roles, access, retention, transfers **[REQUIRED]** |

## Data not intentionally collected

- raw keystroke content;
- global idle/last-input signals;
- saved screenshot files;
- audio, camera, or microphone data;
- precise physical location;
- biometric identification templates;
- intentional special-category inference;
- advertising profiles or cross-service tracking.

These exclusions must be revalidated whenever dependencies, telemetry, analytics, crash reporting, or model providers change.

## ROPA completion fields

Before treating this document as the controller’s Article 30 record, add:

- controller/processor legal names and contacts;
- joint-controller analysis where relevant;
- processing and security owners;
- data-subject categories and approximate scale;
- actual recipient legal entities and subprocessors;
- hosting/processing countries and Article 46 safeguards;
- production retention and backup schedules;
- technical and organisational security measures beyond the repository;
- links to contracts, DPIA/LIA, deletion jobs, access reviews, and test evidence;
- start/end dates and the next review date.
