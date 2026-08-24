# FlowSight Privacy Notice

Effective date: 23 August 2026
Notice version: 2026-08-23
Privacy contact: manuel@flowsight.site

> Publication blocker: this notice is technically aligned with the current application, but it is not ready to publish until the operator replaces every **[REQUIRED BEFORE PRODUCTION]** item below. In particular, “FlowSight” is a product name and is not a sufficient legal identity for a controller.

## 1. Who is responsible for your data

For an individually purchased and operated account, the controller is:

- Legal entity or sole-trader name: **[REQUIRED BEFORE PRODUCTION]**
- Registered or business address: **[REQUIRED BEFORE PRODUCTION]**
- Privacy email: manuel@flowsight.site
- Data Protection Officer, if appointed: **[REQUIRED BEFORE PRODUCTION, OR STATE “NOT APPOINTED / NOT REQUIRED”]**
- EU representative under Article 27, if required: **[REQUIRED BEFORE PRODUCTION, OR STATE “NOT APPLICABLE”]**

If an employer or another organisation deploys FlowSight to personnel, that organisation normally decides why and how work-monitoring data is used and is therefore the controller for that deployment. FlowSight may act as its processor. The organisation must provide its own employee-facing privacy information, establish a lawful basis, complete any required works-council or employee-representative consultation, configure access and retention, and enter into a compliant data-processing agreement with FlowSight before monitoring starts.

Contact manuel@flowsight.site if you are unsure which party is the controller in your situation.

## 2. What FlowSight does

FlowSight is a desktop work-activity assistant. Tracking starts only when you start it. While tracking is active, the application observes the foreground application and selected interface events and periodically captures the active window. A language-and-vision model running on your device converts that transient input into short activity descriptions, categories, duration records, and work-pattern reports.

Screen images and raw interface events are held in memory only while local analysis is taking place. They are not intentionally written to disk or uploaded. Common password managers are excluded by default, and you can add other application names to the exclusion list. If the foreground application cannot be identified, capture is skipped. No keystroke contents or global idle/last-input signals are collected.

FlowSight is intended as a self-use productivity tool. It must not be used for covert monitoring or as the sole basis for employment, disciplinary, compensation, promotion, or other decisions with legal or similarly significant effects.

## 3. Data processed, purposes, and legal bases

The exact field-level inventory is in [docs/DATA-PROCESSING-INVENTORY.md](docs/DATA-PROCESSING-INVENTORY.md).

| Purpose | Main data | Default/location | Proposed lawful basis |
|---|---|---|---|
| Provide local activity tracking and reports | Transient active-window image; application and UI context; locally generated summary, category, duration, optional task/ticket label | Tracking off until started; image and raw events memory-only; summary in local SQLite | Article 6(1)(b), processing requested by an individual user. In a workplace deployment, the employer must document its own basis, commonly Article 6(1)(f) subject to a balancing test and local employment law; employee consent should not be presumed freely given. |
| Store optional full window titles | Window title in local history | Off by default; local device only | Article 6(1)(b) when the user deliberately enables the feature. |
| Maintain an account and entitlements | Account ID, email, display name/avatar, login provider, team membership, plan status | Supabase and a protected local session copy | Article 6(1)(b); Article 6(1)(c) where records are legally required. |
| Optional cloud activity sync | Account/team IDs, aggregate summaries, category, duration, ticket reference, dates | Off by default; FlowSight Cloud/Supabase | Article 6(1)(b) when an individual deliberately enables the cloud feature. A workplace controller must document its own basis and necessity assessment. |
| Optional cloud AI | User message, recent conversation, seven-day local activity context, account/team and usage metadata | Off by default; FlowSight service and AI provider | Article 6(1)(b) for the user-requested AI feature. Any reuse for model training or unrelated purposes requires a separate basis and is not authorised by this notice. |
| Optional product analytics | Random installation ID, seven daily usage totals, weekly primary activity, app version where relevant | Off by default; pseudonymous cloud record | Article 6(1)(a), consent. Consent can be refused or withdrawn without losing local tracking. |
| Voluntary product feedback | Message, app version, optional pseudonymous installation ID | Only when submitted | Article 6(1)(a), consent expressed by submission. Do not include confidential or special-category data. |
| User-requested integrations | OAuth identity and tokens, workspace/project identifiers, selected tasks or destinations, reports deliberately published | Only when the user connects or invokes Jira, Linear, or Notion | Article 6(1)(b), user-requested integration. |
| Security, troubleshooting, and abuse prevention | Bounded diagnostic logs, timestamps, status/error codes, request metadata held by service providers | Local logs and processor infrastructure | Article 6(1)(f), legitimate interests in operating a secure and reliable service, subject to minimisation and access controls. |
| Billing, tax, and legal compliance | Plan, subscription/customer references, invoices and legally required records | Billing systems and limited account records | Article 6(1)(b) and/or Article 6(1)(c), depending on the record. |

The local “I understand” monitoring acknowledgement records that the notice was presented. It is not presented as consent where contract or legitimate interests is the lawful basis.

## 4. Sources of data

Data comes from you, your device while you actively run tracking, the account or team administrator, connected providers you authorise, and the service providers used to authenticate accounts and deliver requested cloud features. Screen content may incidentally contain information about other people. Avoid displaying unrelated or sensitive content while tracking, and configure the exclusion list for sensitive applications.

## 5. Optional choices and withdrawal

Cloud activity sync, cloud AI, product analytics, and local storage of full window titles are separate choices and are off by default. You can change each choice under **Profile → Privacy & data**.

- Turning cloud activity sync off immediately stops native uploads. Server-side row-level security also rejects new activity uploads unless the account preference is enabled.
- Turning cloud AI off prevents the native app from sending requests and the cloud AI endpoints reject new AI requests.
- Withdrawing analytics stops collection and requests deletion of the pseudonymous cloud row and linked feedback. If offline, the app retries; the server-side maximum retention is 35 days.
- Turning window-title storage off removes title values already stored in local activity rows and omits UI/window names from future action summaries.
- Adding an application to the exclusion list skips both its periodic active-window capture and action-triggered processing.
- Disconnecting Notion deletes the encrypted Notion token, pending OAuth states, saved destinations, and FlowSight’s Notion publication history. It does not delete pages already created in the user’s Notion workspace.

Withdrawal does not affect processing that was lawful before withdrawal. Features that necessarily require a selected transfer will stop working when that selection is off.

## 6. Who receives data

Depending on the features you choose, recipients may include:

- Supabase, for authentication, database storage, and edge-function execution;
- Microsoft Azure OpenAI, for the cloud coach;
- OpenRouter and the model provider selected through OpenRouter, for cloud-generated individual reports;
- Atlassian Jira, Linear, and Notion, only for integrations you connect and actions you request;
- the billing provider used by the production deployment, including Stripe if the existing billing integration is enabled;
- GitHub, when the application checks for or downloads a published update;
- authorised FlowSight personnel and, in a team workspace, authorised team owners/managers according to configured access policies;
- professional advisers, regulators, courts, or law-enforcement bodies where disclosure is legally required.

The production owner must complete and publish the processor/subprocessor register, exact service regions, purposes, retention terms, and links to vendor privacy information before release.

## 7. International transfers

Some recipients may process data outside the European Economic Area. Before production, the controller must record the actual hosting regions and transfer routes and identify the applicable safeguard for each route, such as an adequacy decision or the European Commission Standard Contractual Clauses plus a transfer impact assessment and supplementary measures.

**[REQUIRED BEFORE PRODUCTION: list each transfer, destination country, importing entity, safeguard, SCC module/date where used, and how a copy can be obtained.]**

No international-transfer safeguard should be represented as complete merely because a vendor offers SCCs in general; the controller must accept the relevant terms and assess the configured processing chain, including any downstream AI model provider.

## 8. Retention

- Screen images: memory-only for the local inference request, then discarded.
- Raw UI/foreground events: in-memory ring buffer, maximum approximately two minutes, and cleared immediately when tracking stops.
- Local activity summaries: 30 days by default; user-selectable 7, 30, 90, or 365 days; enforced at startup, after settings changes, and daily while the app remains open.
- Local cloud-coach conversation: latest 40 messages and no more than 30 days. Older legacy messages without a timestamp are discarded.
- Full window-title columns: not stored by default and removed when the setting is off.
- Local diagnostic logs: bounded files; app logs rotate at 1 MiB with at most three files, authentication and crash logs reset at approximately 512 KiB, and all known logs are cleared by local erasure where the operating system permits.
- Cloud activity and generated insight records: 90 days, subject to the scheduled daily purge being enabled in production.
- Pseudonymous analytics: refreshed to a maximum 35-day expiry and deleted on successful withdrawal.
- Voluntary feedback: 12 months.
- AI prompt-usage counters: up to 62 days.
- Notion OAuth state: 10 minutes; expired rows are removed by the retention job. Notion publication metadata: 12 months. Connection and destination settings: until disconnect or account deletion.
- Account, profile, team, and entitlement data: while the account or contract is active, then deleted or anonymised according to the production closure schedule.
- Billing/tax records: only for the statutory period applicable to the controller. **[REQUIRED BEFORE PRODUCTION: state the jurisdiction and period.]**
- Backups: **[REQUIRED BEFORE PRODUCTION: state backup cadence, maximum retention, restore-time deletion procedure, and immutable-backup exception handling.]**

## 9. Your rights

Subject to the GDPR conditions and exceptions, you can request access, rectification, erasure, restriction, portability, or objection; withdraw consent at any time; and complain to a supervisory authority. You also have rights concerning qualifying automated decision-making.

The app provides:

- a machine-readable JSON export of local data and, when signed in, known cloud account data;
- local erasure of activity, preferences, conversations, credentials, temporary artifacts, and known logs;
- cloud-account deletion, with a safeguard that requires team/licence owners to transfer or resolve ownership first so other people’s records are not silently deleted;
- immediate purpose toggles and analytics withdrawal; and
- Notion disconnect and token erasure.

Requests can also be sent to manuel@flowsight.site. The controller will verify identity proportionately and normally respond within one month. Complex or numerous requests may be extended by up to two further months where GDPR Article 12 permits, with notice during the first month.

Automated self-service export excludes bearer tokens, refresh tokens, OAuth state secrets, encryption keys, password hashes, and encrypted credential material because disclosing those items would undermine account security. This does not exclude meaningful account and integration metadata from the export.

Supervisory authority: **[REQUIRED BEFORE PRODUCTION: name and contact details for the competent lead authority; users may also complain where they live, work, or believe an infringement occurred.]**

## 10. Automated analysis

Local and optional cloud models classify activity and generate summaries or suggestions. Their output can be inaccurate. FlowSight does not use these outputs to make decisions that produce legal or similarly significant effects. Workplace customers must contractually and operationally prohibit solely automated employment decisions and provide meaningful human review and contestability for any use of reports.

## 11. Security

Current application controls include data minimisation, active-window-only capture, memory-only images, a short-lived in-memory event buffer, default exclusions for common password managers, optional-purpose separation, Windows DPAPI protection for persistent OAuth/session secrets, PKCE and state verification for direct OAuth, one-time hashed state for Notion OAuth, server-side purpose enforcement, row-level security, encrypted Notion tokens, bounded logs, Content Security Policy, retention jobs, and credential-redacted exports.

No system is perfectly secure. Report a suspected security or privacy issue to manuel@flowsight.site. Do not send access tokens, passwords, screenshots, or unnecessary personal data in the report.

## 12. Required and optional data

Account identifiers and authentication data are required only for cloud features. Local tracking can be used without a cloud account. Refusing cloud sync, cloud AI, analytics, full window-title storage, feedback, or integrations does not prevent local tracking. A requested cloud or integration feature cannot operate without the data needed to deliver that feature.

## 13. Changes to this notice

Material changes receive a new notice version. The app requires a fresh monitoring acknowledgement when its monitoring notice version changes. Where consent is the basis, a materially different purpose requires a new, specific opt-in.
