# Data Protection Impact Assessment — FlowSight Activity Monitoring

Status: draft requiring controller/DPO approval before production
Assessment date: 23 August 2026
Assessment owner: **[REQUIRED]**
DPO/adviser consulted: **[REQUIRED OR NOT APPLICABLE WITH REASON]**
Approved by: **[REQUIRED]**

## Screening decision

A DPIA is required before workplace deployment. FlowSight performs systematic observation of a person’s computer activity and may be used in an employment context, where there is a power imbalance and a risk that generated reports influence management decisions. Active-window images may incidentally expose highly private or special-category information even though the product is designed not to retain it. The processing therefore presents likely high risk under GDPR Article 35 and common supervisory-authority monitoring criteria.

An individual using the app solely for their own private productivity has a materially different risk profile, but the cloud provider’s processing remains in scope and should stay covered by this assessment.

## Processing description

When the user deliberately starts tracking, native foreground and UI Automation listeners observe the active application, window/control events, and task context. Raw events remain in a two-minute in-memory ring. At configured intervals and selected window events, the app captures the foreground window and sends the image to a local model server bound to loopback. The local model generates a short generic activity description and category. The image is discarded after inference. The report is stored in local SQLite with application name, duration, timestamps, provenance, optional task/ticket, and an optional full window title.

Cloud sync, cloud AI, analytics, and integrations are distinct downstream paths:

```text
Foreground window + UI events
        │
        ├─ transient memory ──> local model ──> local summary/history
        │                                      │
        │                                      ├─ optional cloud sync ──> Supabase/team viewers
        │                                      ├─ optional cloud AI ────> Azure OpenAI
        │                                      └─ requested Notion publish ─> Notion
        │
        └─ optional aggregate metrics ──> pseudonymous analytics record

Cloud individual report request ──> Supabase ──> OpenRouter/model provider
Account/authentication ────────────> Supabase Auth
Jira/Linear linking ───────────────> provider OAuth/API
```

See `docs/DATA-PROCESSING-INVENTORY.md` for fields and retention.

## Purpose, necessity, and proportionality

The primary purpose is to help a user understand and report their own work patterns. Periodic capture can provide richer activity classification than a manual timer, but it is intrinsically intrusive. The implementation reduces the scope by requiring an explicit start, capturing the active window rather than the whole display, using local inference, not recording keystrokes or idle signals, not writing screenshots to disk, discarding raw events quickly, excluding sensitive apps, generating generic summaries, and making raw title storage optional.

The controller must still document why less intrusive alternatives—manual task selection, application-name-only tracking, or timer-only reporting—do not adequately meet each workplace purpose. If a purpose can be achieved with one of those alternatives, screenshot/UI processing is not necessary for that purpose and must not be enabled.

Cloud processing is not necessary for local tracking. It is split into off-by-default purposes. Team access is justified only where the controller can show a defined need and proportional manager visibility; general employee surveillance, behavioural scoring, or speculative future use is outside the assessed purpose.

## Consultation

Before workplace launch, record:

- affected employee/user feedback and product changes made in response;
- works-council, union, or employee-representative consultation where required;
- DPO or independent privacy-adviser advice and any decision not to follow it;
- security review and penetration-test outcome;
- accessibility review of notices, controls, exports, and deletion;
- processor and international-transfer due diligence.

## Risk assessment

Scale: likelihood and severity are Low, Medium, or High after considering current technical controls. “Residual” assumes the production blockers are completed; otherwise the risk remains High.

| Risk to people | Inherent risk | Current measures | Required additional measure | Target residual risk |
|---|---|---|---|---|
| Covert or unexpected employee monitoring | High/High | Tracking off; just-in-time notice; visible controls; pause/stop | Contractual prohibition on covert use, employer notice, works-council review, deployment audit | Low/High |
| Capture of passwords, health, financial, private communications, or third-party data | High/High | Active-window-only capture; local memory processing; no image files; generic-output prompts; common password-manager exclusions; configurable exclusions | Broaden organisation-specific exclusions; user training; red-team model output; consider application-category deny rules | Medium/High |
| Window/control names leak into summaries despite title setting | Medium/High | Title field off; existing titles cleared; action-review names omitted when off; prompts prohibit transcription | Automated sensitive-string tests and periodic output sampling with synthetic data | Low/High |
| Excessive or indefinite retention | High/Medium | Local 30-day default/daily purge; cloud expiry fields; bounded chat/logs; analytics/feedback expiries | Enable and monitor production cron; backup lifecycle; retention-owner evidence | Low/Medium |
| Cloud transfer occurs without a purpose choice | High/High | Independent defaults off; native gates; RLS insert guard; AI endpoint gates | End-to-end release tests and alerting after every schema/function change | Low/High |
| AI or infrastructure provider reuses content or transfers it unexpectedly | Medium/High | Separate cloud-AI choice; minimised context; provider secrets server-side | Binding no-training terms, subprocessor list, regions, SCC/TIA, provider retention configuration | Medium/High |
| Unauthorised access to local OAuth/session tokens | Medium/High | Windows DPAPI current-user protection; no persistent WebView session; renderer-safe APIs | Device encryption requirement, OS account hygiene, endpoint security, credential-rotation procedure | Low/High |
| OAuth login CSRF, interception, or token leakage through URLs/logs | Medium/High | PKCE and state for direct OAuth; Supabase callback state; token POST body; no-store responses; token-free logs | Prefer Supabase Authorization Code + PKCE when supported end to end; penetration test loopback listener | Low/High |
| Team owner sees or deletes another person’s data | High/High | RLS; self-deletion ownership block | Test every role; implement ownership transfer; least-privilege manager views and access audit | Medium/High |
| Inaccurate classification harms a worker | High/High | Output described as approximate; no intended automated significant decisions | Binding acceptable-use terms; human review; correction/context mechanism; prohibit disciplinary scoring | Medium/High |
| Data export omits a production system or exposes a secret | Medium/High | Known-table export; credential redaction; pagination | Automated schema-to-export coverage test; include support/billing/backups; security review sample exports | Low/High |
| Erasure is partial after dependency or network failure | Medium/High | Explicit errors; local and cloud flows; provider data list; 35-day analytics expiry | Idempotent deletion job/ledger, retries, processor confirmations, backup re-deletion | Low/High |
| Re-identification of “anonymous” analytics | Medium/Medium | Correctly labelled pseudonymous; no account/email; random ID plus separate secret; 35-day expiry | Restrict logs and network metadata; aggregation thresholds if dashboards expose cohorts | Low/Medium |
| Function creep from productivity aid to surveillance | High/High | Stated purpose, local-first defaults, separate choices | Governance approval for changes, ROPA/DPIA change control, customer contract restrictions | Medium/High |
| Malicious update or compromised build exfiltrates local data | Low/High | Signed updater mechanism and CSP | Verify production signing key, reproducible release controls, key protection, update incident playbook | Low/High |

## Special-category data

FlowSight does not need special-category data and must not intentionally infer health, ethnicity, religion, political opinions, union membership, sexuality, biometrics, or similar traits. Such information can nevertheless appear on screen. Local-only transient handling and exclusions reduce but do not eliminate the risk. A workplace controller must identify whether incidental processing can realistically occur, configure exclusions, and establish an Article 9 condition before any intentional special-category processing. Without such a condition, intentional use is prohibited.

## Children and vulnerable people

The product is not assessed for monitoring children or vulnerable people. Such deployment is outside this DPIA and requires a separate assessment, safeguards, and legal review.

## Automated decision-making

The models generate categories, summaries, focus metrics, and suggestions. These are probabilistic observations, not verified facts. The assessed deployment does not permit decisions based solely on automated processing that have legal or similarly significant effects. If a customer proposes such use, do not deploy until an Article 22 assessment, lawful basis, meaningful human intervention, contestability process, bias/accuracy validation, and updated DPIA are complete.

## Residual-risk decision

Residual severity remains high for some low-likelihood events because screen content and employment consequences can be sensitive. Production approval is conditional on every “required additional measure” above and every release blocker in `docs/GDPR-COMPLIANCE.md` being completed.

- Residual risk accepted by controller: **[YES/NO — REQUIRED]**
- Reasons and evidence: **[REQUIRED]**
- Article 36 prior consultation required: **[YES/NO — REQUIRED, WITH DPO RATIONALE]**
- Review trigger/date: **[REQUIRED]**
