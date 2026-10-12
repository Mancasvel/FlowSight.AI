# Build in public: local ideas and assistant briefs

## Product decision

FlowSight.AI → Online → Build in public is a personal studio inside the desktop app. Its job is to find possible stories in the work already observed locally, then prepare a useful prompt for a more capable assistant. The user explicitly chose this model: social profiles are added in FlowSight, independently of Buffer capacity; FlowSight does not publish. Codex or another connected assistant develops the content and handles any later publication through its own tools.

## Journey

1. Review possible ideas from today, the last week or the last month. The installed local model selects topics; the original minimized observation remains the evidence. Selection must not turn activity into invented achievements.
2. Select a story and review or correct its facts. Cloud storage receives only the selected highlight.
3. Choose networks, independent social profiles and a style per network. LinkedIn offers practical learning, behind the scenes and technical breakdowns; X offers a short thought, a process thread and a conversation; Instagram offers a carousel, visual idea and reel script.
4. FlowSight builds and saves an editable prompt containing evidence, project/voice, profile, style and output requirements. Users can copy it to any assistant.
5. Connected assistants use get_content_context to collect briefs and save_content_drafts to return proposals. Full threads, scripts and slide plans belong in details; the post or first message belongs in body. An optional image outline is editable in the app.
6. Publication is outside FlowSight. The assistant uses the tools the user has connected and the chosen content. No approval, scheduling or send endpoint is exposed by FlowSight.

## Architecture and privacy

The Tauri host reads existing local reports and runs topic selection with the installed model. The renderer supports manual/daily/weekly local suggestions while the app is open; only reviewed selections are uploaded. Supabase stores owner-scoped evidence, profiles, briefs, returned content and scoped revocable assistant tokens. A deterministic server template assembles prompts; this avoids asking the small local model to invent the facts for the powerful model.

The original publishing tables/migrations remain for migration compatibility, but direct publisher code and routes were removed when the user clarified the workflow. The user's cloud Buffer credential was deleted; Codex retains its separate encrypted official Buffer MCP credential.

## Interface contract

The implemented surface follows the Operate direction inside the existing compact Manrope/teal Tauri application. Online keeps Leagues and Build in public as in-place outer tabs. Build in public uses four views: Ideas, Prompts, Contenido and Ajustes (Ideas, Prompts, Content and Settings in English). It retains one reading column, labelled fields, divided rows and the shared app navigation in compact, minimum and wide windows.

Ideas moves from local observations to an explicitly reviewed selection, then to network, style and optional profile choices. Prompts contains stored editable assistant briefs with save, copy and delete actions. Contenido receives the assistant's proposal body, full thread/script/slide plan and optional editable visual outline. Ajustes contains independent FlowSight social profiles, the scoped MCP connection and project/voice/cadence preferences. There are no approval, scheduling or publication controls.

Recoverable profile or preference save errors retain entered values. Prompt and proposal edits survive ordinary internal navigation. Incoming MCP proposals refresh an idle open view and its content count on the minute-based studio check, including when local idea collection is set to manual. Active editors, focused forms and ongoing requests defer the check's visible update.

## Pilot criteria

The pilot succeeds when one real work item produces three useful, materially different prompts, a connected assistant returns the proposals to the app, and the full native/database/MCP path is verified. Measure idea acceptance, factual corrections required, time to a usable brief and weekly reuse. Do not measure success by generated volume. Synthetic browser fixtures and actual-user pilot evidence are recorded separately in the technical project log.

The current renderer/API/database/MCP harness verifies returned content without a page reload and profile/preference draft recovery after failed saves. The twelve current compact/minimum/wide/dark captures of Ideas, Prompts and Ajustes are renderer evidence. The follow-up ship verdict is bounded to those two material fixes; it does not establish a completed native WebView2/local-collector pilot or actual-user success. The technical project log records the separate native pilot and its exact executable revision.
