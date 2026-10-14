# Build in public: local ideas and assistant briefs

## Product decision

FlowSight.AI → Online → Build in public is a personal studio inside the desktop app. Its job is to find possible stories in the work already observed locally, then prepare a useful prompt for a more capable assistant. The user explicitly chose this model: social profiles are added in FlowSight, independently of Buffer capacity; FlowSight does not publish. Codex or another connected assistant develops the content and handles any later publication through its own tools.

## Journey

1. Find up to five concrete stories from today, the last week or the last month. Optional direction guides retrieval before model generation. A local checkbox includes user-authored Codex prompts from that period. The original minimized source remains the evidence; requests do not establish completion. Sparse evidence produces fewer ideas, without filling the batch with generic variations.
2. Compare the current ideas, reopen earlier local batches, or add a manual highlight. Review and correct the facts, then explicitly Save and select the highlight to store it online. Regeneration and draft retention alone do not upload evidence.
3. Choose networks, independent social profiles and a style per network. LinkedIn offers practical learning, behind the scenes and technical breakdowns; X offers a short thought, a process thread and a conversation; Instagram offers a carousel, visual idea and reel script.
4. FlowSight builds and saves an editable prompt containing evidence, project/voice, profile, style and output requirements. Users can copy it to any assistant.
5. Connected assistants use `get_content_context` to collect selected evidence, profiles, briefs and preferences, `set_content_direction({text})` to guide the next local idea selection, and `save_content_drafts` to return proposals. Setting direction does not itself collect work. Full threads, scripts and slide plans belong in `details`; the post or first message belongs in `body`. An optional visual outline is editable in the app.
6. Publication is outside FlowSight. The assistant uses the tools the user has connected and the chosen content. No approval, scheduling or send endpoint is exposed by FlowSight.

## Architecture and privacy

Local discovery does not require a valid online session. The renderer resolves the stored account identity through `get_current_user`, which reads local configuration without validating a JWT, then restores that owner's local ideas and cached settings. Users without a stored account use a separate device-local cache. Finding ideas calls only `bip_collect_local`; it never waits for a cloud direction save or studio request. Direction, period, Codex prompt choice, previous batches and local corrections survive reopening. Pending direction synchronizes to the same owner when the online studio recovers, with `expected_owner` protection; local evidence still uploads only through Save and select. Online connection failures remain informational during local discovery. Actual local model failures preserve the previous ideas and remain visible.

The Tauri host reads local reports and, when selected, user messages from local Codex session files. It never consumes assistant responses, tool output or system instructions as user work. It applies private-term and credential filtering, uses event dates, deduplicates messages and reads with bounded line buffers. Prompts carry zero measured seconds and are visibly identified as requests with unconfirmed outcomes. Requested identifiers constrain retrieval; other direction terms rank by corpus rarity before measured time. Meaningful source content drives grouping, avoiding shared screen-analysis scaffolding. The model summarizes one source at a time with bounded requests. The host retains source identity and facts, rejects repeated titles and excludes already used sources before generation. Unsupported generated title concepts fall back to the source title. Current/history/manual work and the optional prompt-source choice stay in an owner-scoped local cache. Only explicitly saved highlights become online evidence. Network-specific prompt templates and later assistant development remain separate from local discovery.

The original publishing tables/migrations remain for migration compatibility, but direct publisher code and routes were removed when the user clarified the workflow. The user's cloud Buffer credential was deleted; Codex retains its separate encrypted official Buffer MCP credential.

## Interface contract

The implemented surface follows the Operate direction inside the existing compact Manrope/Plus Jakarta Sans, teal and gridded Tauri application. Online keeps Leagues and Build in public as in-place outer tabs. Build in public uses four views: Ideas, Prompts, Contenido and Ajustes (Ideas, Prompts, Content and Settings in English). An accessible heading remains, but the duplicate visible heading and slogan are absent. Studio navigation leads directly into the work, with the shared dock available in compact, minimum and wide windows.

Ideas starts with the period and Find ideas / More ideas in a compact two-column toolbar, followed by optional direction and a local Codex prompt-source checkbox. Comparable rows lead with their useful title, a short source excerpt, and recorded signals/date/angle metadata. Current results, earlier local ideas and saved selections remain distinguishable. A completed search without matches clears the current batch into history and explains the missing topic; an exhausted regeneration retains the current work and reports that no new ideas were found. The selected count and Prepare prompts action open a separate inline setup step. Style and profile fields stack at compact widths and sit side by side from 560px. Prompts and Contenido also lead with the useful subject, leaving network/style/state as metadata and complete content in their editors. Ajustes contains independent FlowSight social profiles, the scoped MCP connection and project/voice/cadence preferences in flat separated groups.

Recoverable profile, preference or direction save errors retain entered values. Current and earlier local ideas retain stable identities and edits across generation; unfinished manual highlights are cached locally. Evidence, prompt and proposal edits survive ordinary internal navigation and show unsaved status. Incoming MCP proposals and direction changes refresh an idle open view on the minute-based studio check, including when local idea collection is set to manual. Active editors, focused forms and ongoing requests defer the check's visible update.

## Pilot criteria

The pilot succeeds when real work produces five useful, grounded editorial alternatives, regeneration varies the approaches while retaining prior work, the person's selected ideas become useful network-specific prompts, and a connected assistant returns editable proposals to the app. The full native/database/MCP path must be verified for the final revision. Measure idea acceptance, factual corrections required, time to a usable brief and weekly reuse. Do not measure success by generated volume. Synthetic browser fixtures and actual-user pilot evidence are recorded separately in the technical project log.

Earlier renderer/API/database/MCP evidence established incoming content without a page reload and profile/preference recovery after failed saves; its ship verdict was bounded to those two fixes. It does not establish the final five-idea revision. Native captures and synthetic renderer fixtures have different scopes and are identified in the technical project log with their executable or source revision. CI compilation of the latest native code remains pending, so this document does not claim completion of the final native pilot.

## Directed source selection

The local collector reads the complete chosen report period rather than only the newest 1,500 rows. It has no hardcoded work-keyword admission list and the editorial prompt assumes no particular project or occupation. Repetition contributes observation count and recorded seconds. Topic retrieval and used-source exclusion precede bounded model calls (at most eight new sources, stopping after five accepted ideas). Host ranking combines measured work, interest, distinctiveness and direction fit. Recorded time is not a productivity or outcome claim.

Fixed angle lists and conditional title prefixes have been removed. Titles and details come from each retrieved source; conservative grounding checks discard unsupported metadata and use the source title when the generated title introduces too many new concepts. Normalized title hashes, lexical similarity and used-origin keys prevent repeated regeneration. Empty or exhausted sources produce an explicit state; failed generation preserves previous work.

Online → Build in public → Ideas offers “What would you like to share?”; the same preference is writable through MCP `set_content_direction({text})`. It persists in `bip_settings.topic_direction` without replacing other settings. Prompts carry the preference and measured signals. The minimized source excerpt remains unchanged by title generation, local suggestions stay on-device, and Save and select remains the evidence-upload boundary. The model's interpretation must be reviewed before use.

Current and previous batches retain stable source keys and local edits. Regeneration and collection errors preserve previous work. Brief/evidence/content editors preserve unfinished changes while navigating. Five suggestions are choices, not five automatic posts.

## Incumbent-extension contract

- **THESIS:** find useful stories in observed work through up to five concrete grounded stories.
- **OWN-WORLD:** retain FlowSight's gridded light/deep-slate ground, teal signals, Manrope headings, Plus Jakarta Sans reading text and floating dock.
- **STORY:** guided selection → factual review → dedicated network/style/profile setup → saved prompt → editable assistant return.
- **FIRST VIEWPORT:** compact studio navigation and generation toolbar lead into comparable title-first rows, without a duplicate visible feature heading.
- **FORM:** open divided rows, optional direction behind a disclosure, inline editors, a separate responsive preparation step, and flat settings groups. The current renderer's native controls, typography and theme tokens corroborate this form; no new visual world is introduced.

The five promises are useful grounded alternatives, explicit selection before sharing, durable unfinished work, network-specific handoff, and visible editable assistant returns.
Incumbent FORM authority is pinned to FlowSight.AI commit `f03529ff55bc52943431ab5bbf76b72ad350906f`: `apps/agent/src/renderer/index.html` (app shell, dock and typography), `apps/agent/src/renderer/mobile-theme.css` (light native controls and surfaces), `apps/agent/src/renderer/public/theme-dark-mobile.css` (dark surfaces and controls), and `apps/agent/src/renderer/online-leagues.css` (the neighboring Online surface). Build in public extends that existing form; it does not introduce a replacement visual world. The current `build-in-public.css` and renderer implement the compact extension recorded in DESIGN.md.
