# GDPR Compliance and Deployment Runbook

Status: implementation baseline complete; legal and production controls pending
Owner: **[ASSIGN BEFORE PRODUCTION]**
Last technical review: 23 August 2026
Next review: **[SET BEFORE PRODUCTION]**

This runbook separates controls implemented in the product from organisational obligations that source code cannot satisfy. It is evidence for a compliance programme, not a declaration that a particular deployment is legally compliant.

## Implemented product controls

- Tracking is off until the user starts it and acknowledges the current monitoring notice.
- Captures are limited to the foreground window. If the foreground window cannot be identified, capture fails closed.
- Images are processed by the bundled local model in memory and are not intentionally written to disk.
- Raw UI events remain in a memory ring for at most approximately two minutes and are cleared on stop.
- Common password managers are excluded by default. Users can maintain an exact-name application exclusion list. Excluded or unidentifiable applications are blocked before UI Automation names enter that ring, and changing the exclusion list refreshes the collection filter immediately.
- Full window titles are off by default. Disabling them clears existing title columns and strips UI/window names from action-review inputs.
- Cloud activity sync, cloud AI, and pseudonymous product analytics are separate and off by default.
- Native and server-side gates enforce cloud-sync and cloud-AI choices.
- Product analytics uses a random installation identifier, correctly described as pseudonymous. A separate DPAPI-protected secret proves control for export/deletion.
- Local activity retention defaults to 30 days and is enforced at startup, on preference changes, and daily.
- Local coach history is bounded to 40 messages and 30 days.
- Cloud activity/insights have 90-day expiry fields; analytics 35 days; feedback and Notion publication metadata 12 months; prompt counters 62 days.
- OAuth/session secrets in SQLite are protected with Windows DPAPI and legacy plaintext values migrate on read.
- Supabase WebView session persistence is disabled, eliminating a duplicate plaintext browser-storage token copy.
- Direct Jira/Linear OAuth uses PKCE and verified state. Supabase callback credentials are submitted to localhost in a POST body with no-store responses.
- Notion OAuth uses expiring, hashed, single-use state and server-side encrypted tokens. Users can disconnect without an active paid plan.
- Renderer-facing session commands return account metadata but not bearer or refresh tokens.
- Exports redact tokens, state hashes, encryption material, and encrypted integration credentials.
- Known local/cloud data can be exported as JSON and erased. Team/licence owners are blocked from self-deletion until ownership is safely resolved.
- Logs avoid activity content, tokens, email addresses, account/team identifiers, invitation values, and raw integration responses; local files are bounded and included in erasure.
- Legacy Supabase bootstrap SQL is non-destructive and uses explicit least-privilege grants; client roles are denied `TRUNCATE`, privileged licence mutation, and execution of internal trigger helpers.
- The Tauri WebView has a restrictive Content Security Policy compatible with the packaged application.

## Production release blockers

All items below are mandatory release gates. Assign an owner and retain evidence for every completed item.

- [ ] Replace “FlowSight” with the controller’s full legal name and add its registered/business address.
- [ ] Decide and document whether a DPO is required; publish DPO contact details if appointed.
- [ ] Decide whether an Article 27 EU representative is required and publish its details.
- [ ] Identify the competent supervisory authority and complete the complaint section.
- [ ] Approve the lawful-basis analysis for individual and workplace deployments. Complete a legitimate-interests assessment wherever Article 6(1)(f) is used.
- [ ] Obtain employment/privacy counsel review for every country in which workplace monitoring is offered.
- [ ] Complete and approve the DPIA in `docs/DPIA.md`; consult the authority under Article 36 if high residual risk remains.
- [ ] Execute Article 28 DPAs with every processor and flow down equivalent requirements to subprocessors.
- [ ] Verify actual data regions and international-transfer routes for Supabase, Azure OpenAI, OpenRouter and its model providers, Notion, Jira, Linear, GitHub, Stripe, email/support, monitoring, and backup vendors.
- [ ] Execute required SCC modules, document adequacy decisions, complete transfer impact assessments, and record supplementary measures.
- [ ] Confirm in enforceable AI-provider terms that submitted data is not used for provider model training beyond the controller’s instructions.
- [ ] Complete the public subprocessor list and implement advance change notice where contracts require it.
- [ ] Define statutory billing/tax retention for the controller’s jurisdiction and separate those records from erasure-capable product tables.
- [ ] Configure and test backup retention, deletion propagation, restoration re-deletion, and disaster-recovery access controls.
- [ ] Verify all production tables against the export/delete registry; add any table, object store, queue, cache, log, support platform, and payment record omitted from the repository schema.
- [ ] Add and test an ownership-transfer/cancellation workflow for team and licence owners before account deletion.
- [ ] Configure rate limits, abuse controls, and alerting for public analytics/feedback RPCs and privacy endpoints.
- [ ] Move the monolithic renderer's inline scripts and styles into bundled files, then remove `'unsafe-inline'` from the production Content Security Policy.
- [ ] Perform penetration testing and a security review of OAuth, Tauri IPC, Supabase RLS, service-role isolation, update signing, and local secret storage.
- [ ] Verify the updater signing key is the intended production key and protect the corresponding private key.
- [ ] Establish support, incident, data-rights, access-review, and deletion-evidence procedures described below.

## Deployment procedure

1. Provision the base application schema before the timestamped migrations. The current repository keeps the legacy base schema in `supabase_schema.sql`; a clean `supabase db reset` does not by itself create those legacy tables.
2. Apply migrations in order, including `20260822120000_notion_pro_reports.sql` and `20260823120000_gdpr_privacy_controls.sql`.
3. Verify `work_sessions`, `activity_reports`, `cloud_insights`, `prompt_usage`, and `notion_publications` have `expires_at` columns. Tables created after the GDPR migration must receive the same columns and guards in their own creation migration.
4. Deploy `privacy-rights`, `coach-chat`, `generate-insights`, `notion-oauth`, `notion-destinations`, and `publish-notion-report` from the same reviewed revision.
5. Confirm JWT verification is enabled for every authenticated function. `notion-oauth` is the deliberate exception because its provider callback is unauthenticated; authenticated actions verify JWT inside the function, and callback state is hashed, expiring, and single-use.
6. Store the service-role key, AI-provider keys, Notion client secret, and Notion token-encryption key only in the platform secret store. Never prefix server secrets with `VITE_` or bundle them in the desktop app.
7. Run RLS and table-privilege tests against the actual hosted schema as an anonymous user, an ordinary member, a team owner, a different-team user, a user with preferences off, a user on a stale notice version, and the service role. The repository does not contain a complete timestamped reconstruction of every historical hosted object, so syntax validation alone is not sufficient release evidence.
8. Schedule the retention function daily and alert on failures.

Example using Supabase’s `pg_cron` support after enabling the extension:

```sql
select cron.schedule(
  'flowsight-gdpr-retention-daily',
  '17 2 * * *',
  $$select public.purge_expired_personal_data();$$
);
```

The function is service-only. If the hosted database does not permit this invocation model, call it from a secured scheduled Edge Function or platform job using the service role. Record daily run status and deletion counts without recording row contents.

9. Run a migration-time assertion:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('work_sessions','activity_reports','cloud_insights','prompt_usage','notion_publications')
  and column_name = 'expires_at';

select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

10. Run the application verification commands listed in the repository handoff and archive the results with the release evidence.

## Data-subject request procedure

1. Record the request date, channel, requested right, systems in scope, owner, and one-month deadline.
2. Verify identity proportionately. A signed-in self-service request is authenticated by the current Supabase session. For email requests, do not request excessive identity documents; use an existing account channel or narrowly tailored evidence.
3. Determine the controller. Forward workplace requests to the employer/controller under the DPA without responding substantively as an unauthorised processor.
4. Search all systems: Supabase Auth and database, pseudonymous analytics where the installation ID is supplied, object storage, backups, billing, support/email, security logs, source-control issue attachments, and each connected processor.
5. Preserve security credentials from disclosure. Explain redactions and provide meaningful metadata instead.
6. Assess third-party rights, legal privilege, statutory retention, legal claims, and other Article 17/18 exceptions. Document each exception and isolate restricted data.
7. For access/portability, provide the application JSON plus data from systems not covered by the automated export, in a secure channel.
8. For rectification, update source records and notify recipients where Article 19 applies.
9. For erasure, process team ownership first; revoke integrations; delete active data; send processor deletion requests; flag retained legal records; and queue backup re-deletion.
10. Respond within one month. If an Article 12 extension is necessary, notify the requester within the first month and explain why.
11. Keep a minimal request ledger containing request type, dates, verification method, systems checked, decision, exceptions, and completion evidence. Do not retain the submitted identity evidence longer than necessary.

Self-service tests must cover:

- local-only user;
- signed-in ordinary member;
- team owner (expected 409 until transfer/resolution);
- user with active licence/billing relationship;
- user with Notion connection/destinations/publications;
- user with Jira or Linear local credentials;
- analytics participant, withdrawn participant, and offline withdrawal;
- records exceeding one export page;
- account with invitation rows matched by email and `created_by`;
- partial processor outage and retry/reconciliation.

## Personal-data breach procedure

1. Contain the incident without destroying evidence; rotate exposed credentials and revoke sessions where necessary.
2. Open an incident record with discovery time, systems, data categories, subjects, approximate volume, confidentiality/integrity/availability impact, and containment actions.
3. Notify the controller immediately when FlowSight acts as processor.
4. The controller assesses risk to rights and freedoms. If notification is required, notify the competent authority without undue delay and, where feasible, within 72 hours of awareness under Article 33.
5. If high risk is likely, notify affected people without undue delay under Article 34 unless a documented exception applies.
6. Record the facts, effects, decisions, rationale, and remediation even when notification is not required.
7. Review logs lawfully, minimise copied evidence, and apply an incident-specific retention hold only where necessary.
8. Complete root-cause analysis, corrective actions, DPIA updates, processor notifications, and lessons learned.

Prepare authority and data-subject notification templates before production. Assign 24/7 escalation contacts and deputies.

## Access and security operations

- Enforce least privilege, MFA, separate named administrator accounts, and short-lived access for Supabase, AI providers, source control, signing, support, and billing.
- Review production access quarterly and immediately after role changes. Retain the review result, not broad activity contents.
- Rotate service-role, AI, OAuth-client, token-encryption, webhook, and updater-signing secrets on a documented schedule and after suspected compromise.
- Never put service-role or provider secrets in renderer bundles, telemetry, tickets, screenshots, or exported diagnostics.
- Test restore procedures and confirm restored data is re-subjected to current deletion and restriction records.
- Patch dependencies and the WebView runtime; track CVEs and document risk acceptance.
- Maintain environment separation. Never copy production personal data into development or test environments unless irreversibly anonymised.
- Configure platform logs to exclude request bodies and authorization headers, set a documented retention, and restrict access.

## Workplace deployment rules

- Complete the DPIA and country-specific employment-law review before offering employee monitoring.
- Provide notice before installation/collection, identify the employer as controller, and describe who sees reports.
- Do not rely on employee consent unless counsel documents that refusal has no adverse consequence and consent is genuinely freely given.
- Use the least intrusive settings: local-only unless cloud functionality is necessary, title storage off, short retention, and a broad sensitive-app exclusion list.
- Prohibit covert use and use for solely automated significant decisions.
- Provide role-based access, audit access by managers, allow correction/context, and define a challenge/escalation route.
- Consult works councils or employee representatives where required.
- Ensure reports do not become general attendance or performance records through function creep.

## Evidence register

Maintain, at minimum:

- approved privacy notice versions and screenshots of just-in-time notices;
- processing inventory/ROPA and data-flow diagrams;
- signed DPIA, legitimate-interests assessments, and consultation records;
- processor DPAs, SCCs, TIAs, locations, deletion terms, and subprocessor notices;
- RLS, OAuth, encryption, export, erasure, retention, and backup-deletion test evidence;
- access reviews, security training, vulnerability remediation, and incident exercises;
- consent/purpose-choice audit events and withdrawal tests;
- DSAR and breach ledgers with data-minimised evidence;
- release approvals and the owner/date for every open risk.

Review the programme at least annually and whenever processing purpose, data fields, monitoring scope, recipients, countries, AI providers/models, retention, or access rules materially change.
