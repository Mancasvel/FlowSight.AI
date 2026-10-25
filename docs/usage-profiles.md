# License-based usage profiles

The desktop starts with a Team-first choice. The server selects `individual`, `team_employee`, or `team_manager` using active license dates and verified ownership/admin membership of the selected team. A global `profiles.role` label is not an authorization source. An Individual license is required to switch from an active Team plan to Individual. An expired Team context retains the simplified shell without paid capabilities.

The employee desktop has Clock and Settings, one Parar/Continuar action and the actual local device clock. Personal scores, leagues, alerts, reports, coach, goals, Pomodoro, Build in public and focus automations are unavailable in Team profiles. Native execution gates enforce the same boundary. Context changes release previous focus/quiet protection and clear pending personal actions; personal preferences remain available if a licensed Individual profile is restored.

Invitation enrollment is atomic: authentication, target email, expiry, team status, license dates, license seats and one-time use are checked. New members receive `member`, inherit the Team plan and receive the employee preset. Enrollment never acknowledges a notice, starts tracking or enables sharing.

Activity sharing has a separate explicit setting. Captures are bound to the account, selected team and sharing grant before inference. Only records from that unchanged context and grant may upload, including on retry. Enabling sharing never imports old private history. Switching account/team/profile disables sharing, cloud AI and automatic monitoring. Each new identity must acknowledge the notice; refresh of the same identity preserves that acknowledgement.

Team uploads contain account/team IDs, UTC capture date, elapsed seconds, neutral `work/meetings/other` totals and ticket references restricted to project keys configured for that team. Unattributed time stays unattributed. They exclude narratives, application/site/window names, URLs, screenshots, focus notes, distraction scores and inferred productivity or attendance. Database triggers minimize new uploads from older clients as well. Existing historical records are retained under narrowed self/manager access; they are not retroactively claimed to have been minimized.

The desktop clock covers the whole device on the local calendar day. Shared sessions use UTC capture dates, matching dashboard periods. These totals are identified and are not anonymous. They do not establish hours worked, presence, billable time, productivity or whether a task is complete.

Workers can read their own activity and their explicitly assigned actions/handoffs. Managers can read authorized team totals and coordination. Direct REST row-level policies enforce these scopes; recipient acknowledgement cannot change handoff context. Employee pages do not mount analytics or personal-coach providers. PM signals invite review of coordination and shared meeting/contact coverage, without secretly forwarding individual distraction notifications.

Session refresh uses one native mutex and encrypted canonical storage. Requests that receive HTTP 401 retry once after renewing the original identity. Rotation cannot restore a logged-out account or move credentials to another account. JavaScript keeps neither a persistent token copy nor a competing automatic refresher.
