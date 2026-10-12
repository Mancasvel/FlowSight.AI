# Build in public: local ideas and assistant briefs

## Product decision

FlowSight.AI → Online → Build in public is a personal studio inside the desktop app. Its job is to find possible stories in the work already observed locally, then prepare a useful prompt for a more capable assistant. The user explicitly chose this model: social profiles are added in FlowSight, independently of Buffer capacity; FlowSight does not publish. Codex or another connected assistant develops the content and handles any later publication through its own tools.

## Journey

1. Generate five editorial alternatives from today, the last week or the last month. Recorded time and recurrence, audience interest, distinctiveness and optional text direction guide selection. The original minimized observation remains the evidence. A small number of real topics can support several different approaches; selection must not turn activity into invented achievements.
2. Compare the current ideas, reopen earlier local batches, or add a manual highlight. Review and correct the facts, then explicitly Save and select the highlight to store it online. Regeneration and draft retention alone do not upload evidence.
3. Choose networks, independent social profiles and a style per network. LinkedIn offers practical learning, behind the scenes and technical breakdowns; X offers a short thought, a process thread and a conversation; Instagram offers a carousel, visual idea and reel script.
4. FlowSight builds and saves an editable prompt containing evidence, project/voice, profile, style and output requirements. Users can copy it to any assistant.
5. Connected assistants use `get_content_context` to collect selected evidence, profiles, briefs and preferences, `set_content_direction({text})` to guide the next local idea selection, and `save_content_drafts` to return proposals. Setting direction does not itself collect work. Full threads, scripts and slide plans belong in `details`; the post or first message belongs in `body`. An optional visual outline is editable in the app.
6. Publication is outside FlowSight. The assistant uses the tools the user has connected and the chosen content. No approval, scheduling or send endpoint is exposed by FlowSight.

## Architecture and privacy

The Tauri host reads existing local reports, groups related work and asks the installed model to identify subjects and assess editorial interest. The host composes five distinct editorial questions from those subjects and assigned angles, so a new angle changes the conversation without adding product capabilities or outcomes. The renderer supports manual/daily/weekly local suggestions while the app is open. Current and earlier idea batches, recent topic/angle keys and unfinished manual highlights stay in an owner-scoped local cache; the renderer reloads that cache while it is less than 30 days old. Only explicitly saved highlights become online evidence. Supabase stores owner-scoped evidence, profiles, briefs, returned content, text direction and scoped revocable assistant tokens. A deterministic server template assembles prompts with the selected evidence and measured signals; the external assistant develops the content.

The original publishing tables/migrations remain for migration compatibility, but direct publisher code and routes were removed when the user clarified the workflow. The user's cloud Buffer credential was deleted; Codex retains its separate encrypted official Buffer MCP credential.

## Interface contract

The implemented surface follows the Operate direction inside the existing compact Manrope/Plus Jakarta Sans, teal and gridded Tauri application. Online keeps Leagues and Build in public as in-place outer tabs. Build in public uses four views: Ideas, Prompts, Contenido and Ajustes (Ideas, Prompts, Content and Settings in English). An accessible heading remains, but the duplicate visible heading and slogan are absent. Studio navigation leads directly into the work, with the shared dock available in compact, minimum and wide windows.

Ideas starts with the period and Generate 5 ideas / 5 more ideas in a compact two-column toolbar, followed by optional direction in a disclosure. Comparable rows lead with their useful title, a short source excerpt, and recorded signals/date/angle metadata. Current results, earlier local ideas and saved selections remain distinguishable. The selected count and Prepare prompts action open a separate inline setup step. Style and profile fields stack at compact widths and sit side by side from 560px. Prompts and Contenido also lead with the useful subject, leaving network/style/state as metadata and complete content in their editors. Ajustes contains independent FlowSight social profiles, the scoped MCP connection and project/voice/cadence preferences in flat separated groups. There are no approval, scheduling or publication controls.

Recoverable profile, preference or direction save errors retain entered values. Current and earlier local ideas retain stable identities and edits across generation; unfinished manual highlights are cached locally. Evidence, prompt and proposal edits survive ordinary internal navigation and show unsaved status. Incoming MCP proposals and direction changes refresh an idle open view on the minute-based studio check, including when local idea collection is set to manual. Active editors, focused forms and ongoing requests defer the check's visible update.

## Pilot criteria

The pilot succeeds when real work produces five useful, grounded editorial alternatives, regeneration varies the approaches while retaining prior work, the person's selected ideas become useful network-specific prompts, and a connected assistant returns editable proposals to the app. The full native/database/MCP path must be verified for the final revision. Measure idea acceptance, factual corrections required, time to a usable brief and weekly reuse. Do not measure success by generated volume. Synthetic browser fixtures and actual-user pilot evidence are recorded separately in the technical project log.

Earlier renderer/API/database/MCP evidence established incoming content without a page reload and profile/preference recovery after failed saves; its ship verdict was bounded to those two fixes. It does not establish the final five-idea revision. Native captures and synthetic renderer fixtures have different scopes and are identified in the technical project log with their executable or source revision. CI compilation of the latest native code remains pending, so this document does not claim completion of the final native pilot.

## Guided five-idea selection

The local collector groups related observations before selection. Repetition contributes observation count and recorded seconds instead of being discarded. The twelve strongest measured groups go to the local model for audience interest, distinctiveness and fit with the owner's optional text direction. The measured-work score combines logarithmically saturated recorded minutes (0.55) and observation count (0.45). Host ranking then combines normalized measured work (0.45), interest (0.30), distinctiveness (0.15), and direction fit (0.35 when supplied). Recorded time is not a productivity or outcome claim.

The leading topics receive five distinct angles drawn from a fixed pool of twenty. Host angle assignment is ordered, not random, and avoids recent topic/angle pairs while unused alternatives remain. With fewer topics, several angles can use the same real observation; if the recent alternatives are exhausted, the pool can be reused. The model writes a different title for each assigned angle. Empty history produces an honest empty state, and an incomplete or failed generation retains previous work.

Online → Build in public → Ideas offers “What would you like to share?”; the same preference is writable through MCP `set_content_direction({text})`. It persists in `bip_settings.topic_direction` without replacing other settings. Prompts carry the preference and measured signals. The minimized source excerpt remains unchanged by title generation, local suggestions stay on-device, and Save and select remains the evidence-upload boundary. The model's interpretation must be reviewed before use.

Current and previous batches retain stable source keys and local edits. Regeneration and collection errors preserve previous work. Brief/evidence/content editors preserve unfinished changes while navigating. Five suggestions are choices, not five automatic posts.

## Incumbent-extension contract

- **THESIS:** find useful stories in observed work through five grounded editorial alternatives.
- **OWN-WORLD:** retain FlowSight's gridded light/deep-slate ground, teal signals, Manrope headings, Plus Jakarta Sans reading text and floating dock.
- **STORY:** guided selection → factual review → dedicated network/style/profile setup → saved prompt → editable assistant return.
- **FIRST VIEWPORT:** compact studio navigation and generation toolbar lead into comparable title-first rows, without a duplicate visible feature heading.
- **FORM:** open divided rows, optional direction behind a disclosure, inline editors, a separate responsive preparation step, and flat settings groups. The current renderer's native controls, typography and theme tokens corroborate this form; no new visual world is introduced.

The five promises are useful grounded alternatives, explicit selection before sharing, durable unfinished work, network-specific handoff, and visible editable assistant returns.
Incumbent FORM authority is pinned to FlowSight.AI commit `f03529ff55bc52943431ab5bbf76b72ad350906f`: `apps/agent/src/renderer/index.html` (app shell, dock and typography), `apps/agent/src/renderer/mobile-theme.css` (light native controls and surfaces), `apps/agent/src/renderer/public/theme-dark-mobile.css` (dark surfaces and controls), and `apps/agent/src/renderer/online-leagues.css` (the neighboring Online surface). Build in public extends that existing form; it does not introduce a replacement visual world. The current `build-in-public.css` and renderer implement the compact extension recorded in DESIGN.md.
