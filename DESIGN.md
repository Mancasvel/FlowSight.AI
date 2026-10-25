---
name: FlowSight Desktop Renderer
description: The FlowSight mobile visual family adapted to a compact Tauri work window.
colors:
  canvas-light: "#fbfcfb"
  canvas-dark: "#101d25"
  surface-light: "#ffffff"
  surface-dark: "#1a2c36"
  slate-ink-light: "#303c50"
  slate-ink-dark: "#e5f0f1"
  muted-text-light: "#6c7d91"
  muted-text-dark: "#adbec8"
  border-light: "#e3ecf0"
  border-dark: "#2a414b"
  grid-line-light: "rgb(63 93 120 / 0.075)"
  grid-line-dark: "rgb(194 226 233 / 0.055)"
  teal-primary: "#1ab5aa"
  teal-progress: "#25b9ad"
  teal-soft: "#e8f8f5"
  teal-active-dark: "#6cdfd0"
  session-action: "#087f78"
  session-action-hover: "#066b65"
  bip-accent: "#167b6d"
  action-indigo: "#7a7cf1"
  action-teal: "#2cbdb4"
  report-header: "#254451"
  report-attention-light: "#935719"
  report-attention-dark: "#ffd29c"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.16
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  studio-title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 750
    lineHeight: 1.4
  body:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
  label:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.16em"
  report-grade:
    fontFamily: "Manrope, sans-serif"
    fontSize: "72px"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.035em"
rounded:
  timer: "27px"
  card: "20px"
  dock: "24px"
  action: "16px"
  control: "11px"
  studio-control: "9px"
  dialog: "22px"
  pill: "999px"
spacing:
  tight: "8px"
  stack: "12px"
  surface: "20px"
  content-inline: "20px"
  content-block: "24px"
  wide-inline: "28px"
components:
  button-primary:
    backgroundColor: "{colors.teal-primary}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "38px"
  button-secondary:
    backgroundColor: "#f7fbfa"
    textColor: "#2b5961"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#147d76"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "38px"
  button-tracking:
    textColor: "{colors.surface-light}"
    rounded: "{rounded.action}"
    padding: "0 16px"
    height: "52px"
  input:
    backgroundColor: "{colors.surface-light}"
    textColor: "#34445a"
    rounded: "{rounded.control}"
    padding: "8px 11px"
    height: "39px"
  card:
    backgroundColor: "rgb(255 255 255 / 0.97)"
    textColor: "{colors.slate-ink-light}"
    rounded: "{rounded.card}"
    padding: "20px"
  badge-success:
    backgroundColor: "#def7f0"
    textColor: "#0a766c"
    rounded: "{rounded.pill}"
    padding: "5px 8px"
  bottom-nav:
    backgroundColor: "rgb(255 255 255 / 0.96)"
    textColor: "#8191a3"
    rounded: "{rounded.dock}"
    padding: "7px"
    width: "min(calc(100% - 24px), 540px)"
    team-width: "min(calc(100% - 24px), 340px)"
    team-layout: "Two equal-width flex destinations with visible icon/label pairs; feedback clears the dock."
  timer-surface:
    textColor: "{colors.slate-ink-light}"
    rounded: "{rounded.timer}"
    padding: "22px 22px 20px"
  consent-dialog:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.slate-ink-light}"
    rounded: "{rounded.dialog}"
    padding: "24px"
    width: "min(100%, 470px)"
  button-session:
    backgroundColor: "{colors.session-action}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  report-grade:
    textColor: "{colors.surface-light}"
    typography: "{typography.report-grade}"
---

# Design System: FlowSight Desktop Renderer

## Overview

**Creative North Star: "The Gridded Work Companion"**

The desktop renderer belongs to the FlowSight mobile family. A pale technical grid, slate reading text, teal signals, softly raised white panels, and one indigo-to-teal tracking action make the compact Tauri window feel related to the Android app without stretching a phone screen into desktop proportions.

The visual language carries through Today, Insights, Settings, first run, and consent. It puts a clear tracking decision beside measured time, then uses quieter cards and rails for supporting evidence. This contract describes the desktop WebView and its shared interface patterns.

Onboarding and session planning follow the Operate direction within this incumbent family: compact labelled controls, useful examples, visible progress and status, and an explicit primary action at each decision. Their dark teal actions support white labels while the existing lighter teal continues to carry state and progress.

Build in public extends this Operate direction inside Online. It keeps the gridded ground and compact type, with labelled choices, open rows, and quiet separators. Clear evidence, editable prompts, and returned proposals share the same working surface and retain their distinct meanings.

**Key Characteristics:**

- A 56px pale grid behind centered, softly layered work surfaces.
- Manrope for headings and measured display figures; Plus Jakarta Sans for reading and controls.
- Teal for state and progress, with an indigo-to-teal gradient concentrated in tracking and first-run actions.
- A floating five-control dock that stays available in the narrow work window.

## Colors

The system is light first, with a complete deep-slate appearance for system dark mode.

### Primary

- **Signal Teal** (teal-primary / teal-progress): regular affirmative controls, live state, week marks, charts, and progress rails.
- **Soft Teal** (teal-soft): selected navigation and other quiet active surfaces. **Dark Active Teal** (teal-active-dark) keeps that signal legible on the dark dock.
- **Session Action Teal** (session-action / session-action-hover): solid affirmative controls in the session planner and onboarding footer. The scoped focus treatment uses Session Action Teal in light appearance and Dark Active Teal in dark appearance.
- **Studio Teal** (bip-accent): text actions, selected checkboxes, active view underlines, status copy, and focus outlines inside Build in public. Dark appearance reuses Dark Active Teal. Headings and form labels use the actual theme foreground; supporting copy uses the muted foreground. Filled primary buttons retain the incumbent Signal Teal treatment.
- **Report progress:** current-period rails and improvement evidence reuse Session Action Teal in light appearance and Dark Active Teal in dark appearance. The grade's filled segments use Dark Active Teal against the slate header.

### Secondary

- **Tracking Gradient Ends** (action-indigo / action-teal): the outer colors of the three-stop gradient used by tracking and selected first-run controls. Its blue midpoint is part of that treatment, not a general accent.
- **Report Attention** (report-attention-light / report-attention-dark): scoped to declines and the next-goal column. Prior-period comparison rails remain muted foreground at 45% opacity, so attention does not replace the previous/current identity.

### Neutral

- **Gridded Canvas** (canvas-light / canvas-dark) with **Grid Lines** (grid-line-light / grid-line-dark): the background field in each appearance.
- **Card Surface** (surface-light / surface-dark): grouped content, forms, navigation, and dialogs.
- **Slate Reading Ink** (slate-ink-light / slate-ink-dark) and **Supporting Text** (muted-text-light / muted-text-dark): the main and secondary text pairs.
- **Panel Border** (border-light / border-dark): quiet separation around layered surfaces.
- **Report Header** (report-header): the individual report's solid slate ground in both appearances; the focus grade reads in white with pale supporting copy.

**The Signal Rule.** Use teal to show state, progress, selection, or a real action. Concentrate the indigo-to-teal gradient on tracking and first-run decisions.

## Typography

**Display Font:** Manrope (sans-serif fallback).

**Body Font:** Plus Jakarta Sans (sans-serif fallback).

Manrope gives headings and measured time a strong, friendly shape. Plus Jakarta Sans keeps explanatory copy, form labels, and dense settings readable at desktop-window sizes.

### Hierarchy

- **Display** (800, 46px, 1.12): centered elapsed time; 40px in the narrow window and 52px at 600px and wider. Tabular numerals keep the timer steady.
- **Headline** (800, 34px, 1.16): Today, Insights, and You headings; 30px at 380px and narrower.
- **Title** (800, 15px): card headings and section titles.
- **Studio title** (750, 14px, 1.4): the useful subject at the start of Build in public idea, prompt, and proposal rows.
- **Body** (13px, 1.5): standard reading and control text; secondary explanations commonly use 11–12px.
- **Kicker** (800, 11px, 0.16em, uppercase): brief teal section cues such as Today and Your Space.
- **Report grade** (800, 72px, 1.08): the individual report's tabular focus figure with a smaller /10 denominator (20px). The figure contracts to 60px at widths of 600px and below; its verdict uses Manrope (750, 18px, 1.35), reducing to 16px in that compact layout.

**The Measurement Rule.** Keep numbers aligned with tabular numerals while preserving the same Manrope display voice as the rest of the interface.

**The Subject First Rule.** In Build in public lists, lead with the useful idea title. Keep the source excerpt, recorded signals, network, and status subordinate to that subject.

## Layout

The Windows title bar includes a moon/sun control. It follows the system appearance until the user makes a choice, then persists that choice locally.

The default Tauri window is 370 × 700px and remains usable at 340 × 400px. A 48px branded title bar sits above a scrollable content pane. The base pane uses 24px top and 20px side padding and reserves 112px below content so the floating dock does not cover controls. The grid repeats every 56px in both appearances.

Today centers within 640px; Insights and Settings center within 760px. At 520px, these surfaces retain their single-column reading order. At 600px and wider, content padding grows to 30px vertically and 28px horizontally, goal and task cards can sit in two columns, and Settings gains a two-column arrangement. At 380px and narrower, padding contracts to 18px top and 15px sides, while the timer, dock, and actions reduce their dimensions.

The five-control dock floats 14px above the window bottom, spans the available width with 12px outer margins, and stops growing at 540px. In the narrow variant it sits 8px above the bottom. Consent dialogs remain bounded by viewport height; the monitoring notice leaves its action row fixed while details scroll.

The five-step onboarding overlay uses a vertical flex layout: the progress header and footer keep their space, and the middle body shrinks and scrolls. The footer is a static flex child with an opaque theme background and its own reserved space. A remaining-content button advances the body by roughly four fifths of its visible height and becomes “Back to top” at the end; its row stays reserved for any step that overflows. Save and connection feedback occupies a persistent live region in the footer so messages remain visible while the body scrolls.

The Today planner remains an expandable section in the existing reading column at 370 × 700px, 340 × 400px, and 900px wide. Its form uses a 14px rhythm, two equal-width time fields, a full-width intention field, and a chronological proposal list with a 96px time column. Confirmation and discard actions wrap from a 120px basis instead of forcing a narrow window to scroll horizontally.

Online keeps Leagues and Build in public in one in-place, two-choice tab strip. The studio has an accessible heading but no duplicate visible title or slogan below the selected outer tab. Its four views follow immediately: Ideas, Prompts, Contenido, and Ajustes (Ideas, Prompts, Content, and Settings in English). Their underline navigation uses an 18px gap, 36px minimum-height controls, and a returned-content count. The outer strip uses 3px inset padding, 34px minimum-height controls, and an 8px gap below it.

Ideas leads with a compact two-column toolbar: the work period occupies the first column and Find ideas / More ideas occupies the second. The columns use a 9px gap and 38px minimum-height controls. Optional text direction sits in a disclosure below the toolbar. Open idea rows follow their count heading; retained earlier ideas and saved selections remain separate. A selected count and Prepare prompts action open a dedicated inline setup step in place of the list.

At 700px and wider, the studio is capped at 760px and the optional portrait preview at 360px, within the containing Online layout. Idea rows use the available studio width. Setup keeps networks in divided groups; style and profile fields stack in compact windows and sit in two equal columns from 560px. Studio content uses 12px top and 40px bottom padding in addition to the shared pane's dock allowance. At heights of 550px or less, the top padding contracts to 8px and toolbar controls to a 34px minimum height. The shared shell and reading order carry through all four views.

The individual report stays inside the existing scrollable preview, capped at 900px wide and a height of min(94vh, 1000px). Its header leads with the focus grade and paired verdict/delta; the progress section follows before the narrative overview. Above 600px, improvements and next goals use two equal open columns with a 28px gap, and the three comparison measures use equal columns with a 22px gap. Progress padding is 26px 36px 20px. At 600px and below, both groups become single columns, progress padding becomes 22px, and a fine rule with 20px top padding separates next goals from improvements. The grade/verdict row wraps instead of forcing horizontal overflow. At the 340 × 400px minimum window, the preview body scrolls to reveal the comparison and later content.

## Elevation & Depth

This interface uses soft depth. White cards have fine borders and diffuse low-opacity shadows; the timer adds a faint cool tint; the floating dock and modal surfaces have stronger shadows because they sit above scrolling content. The title bar stays nearly flat. Dark mode changes the layers to deep slate surfaces while retaining the grid and border separation.

### Shadow Vocabulary

- **Surface lift** (0 8px 28px rgb(30 53 68 / 0.045)): the theme's low, ambient surface shadow.
- **Dock lift** (0 18px 36px rgb(40 67 86 / 0.13), 0 3px 9px rgb(40 67 86 / 0.06)): separates navigation from content underneath.
- **Consent lift** (0 20px 56px rgb(23 50 64 / 0.2)): makes a blocking decision legible above its dimmed background.

**The Layer Rule.** Give ordinary content a quiet lift; reserve the stronger shadow for persistent navigation and blocking overlays.

## Shapes

The timer surface has generous corners (27px), ordinary cards use 20–21px, the floating dock uses 24px, and the monitoring dialog uses 22px. Primary tracking actions use 16px corners; ordinary fields and buttons use 11px. Status badges, week marks, and progress rails use circular or fully rounded forms where their state benefits from it.

Build in public uses the tighter Studio Control corner for fields and the selected Online tab. Idea, prompt, proposal, and profile rows remain flat, separated by fine theme borders; the optional portrait preview uses gently rounded corners (12px).

## Components

### Buttons

- **Tracking action:** a full-width indigo-to-blue-to-teal gradient control (52px tall, 16px corners) inside the timer. Hover adds a slight lift and brightness; disabled state reduces opacity. Selected first-run controls reuse this gradient.
- **Primary:** a solid teal control (38px minimum height, 11px corners) for regular affirmative actions.
- **Secondary and ghost:** a pale bordered alternative and a low-emphasis teal text action; both gain a softer teal surface on hover.
- **Focus:** interactive elements retain a visible teal focus outline. The tracking action and progress animation stop transitioning when reduced motion is requested.

### Fields

Inputs and selects have white fills, cool borders, 11px corners, and a 39px minimum height. Focus changes the border to teal and adds a soft teal ring. In dark mode they switch to deep-slate fills with brighter text.

### Cards and badges

Standard cards use 20px corners, 20px internal padding, a fine border, and ambient lift. Compact Today controls and the weekly strip retain the same family at their own tighter sizes. Success badges are small, fully rounded, and pale teal.

### Navigation

The five-control dock holds Online, Insights, Clock, Coach, and Settings as large, icon-only controls. Each item is at least 51px tall in the default layout; its name remains available to assistive technology. The selected item has a pale teal fill and teal icon. The dock remains floating while content scrolls. The proactive local agent does not occupy navigation or expose a chat; its permissions and proposals live in Settings, and its reminders arrive as notifications.

### Timer and evidence

The Today surface centers status and tabular time above a linear goal rail, goal and streak labels, and the tracking action. Insights uses a weekly day strip, a measured-time card, focus ratio rail, and task bars. Task bars have stable colors by activity category and fill according to their displayed share of tracked time. The hourly Deep Focus chart includes all recorded local hours and uses a fixed 60-minute scale. These visuals show observed time and focus without turning the screen into a score.

### Individual report grade and progress

The individual report leads with an explicitly labelled focus grade out of 10 in the incumbent slate header. A verdict, signed point delta, and named comparison window sit beside the figure when a valid baseline exists. A ten-segment rail reinforces the grade, filling only whole points; supporting copy identifies the local AI or rule-based origin and recorded-day coverage. This is a scoped report indicator of recorded focus patterns, not an assessment of work quality or a productivity score.

The grade uses 70% sustained-focus share of eligible work plus 30% eligible time divided by eligible time plus detected distraction time, then rounds to one decimal place on the ten-point scale. More hours, meetings, collaboration, and calendar coverage do not earn points. Both periods use the same method. The calculation is available through a native disclosure below the comparison; its summary has a visible teal focus outline (2px with a 3px offset).

What improved and Where to improve are open evidence lists rather than inset cards. Each contains at most two items. Clear improvements and declines use previous → current measurements. Sustained-focus share changes by at least one percentage point, distraction minutes per eligible focus hour by at least 0.5 min/h, and the longest block by at least five minutes before a row receives an improvement or decline direction. Higher sustained-focus share and longer blocks are favorable; fewer distraction minutes are favorable. Smaller changes remain steady.

When no measured decline qualifies, a remaining goal can still appear: sustained-focus share below 60%, or otherwise distraction time above 5 min/h. Its evidence is explicitly labelled Current and its advice describes the next focus block. A remaining goal may therefore coexist with improvements in the same period. If neither target applies, the report suggests keeping the conditions that work. These current-level goals must retain their distinction from observed declines.

The comparison repeats the previous and current grades, the prior date range, and three labelled measures: sustained focus, distraction minutes per focus hour, and longest focus block. Each measure uses paired thin rails (5px, 2px corners), previous muted and current teal, with right-aligned tabular values. The focus-share rail uses a fixed 100% scale; each other pair shares its own larger recorded value as the scale. An arrow or steady mark carries the favorable direction independently of the rail colors, including when a shorter distraction rail is an improvement. Text values and previous/current accessible labels accompany the color.

Seven days is the default report period. Today compares the same weekday one week earlier; seven-day reports compare the preceding non-overlapping seven days; thirty-day reports compare the preceding non-overlapping thirty days. A baseline requires usable eligible-focus data in both periods and an exact matching prior start/end window. Without it, the report shows the current grade and available measures, explains that it is building a baseline, and omits the point delta, previous rails, and trend marks. With insufficient current focus data, it shows an em dash and a recording prompt, with no filled grade rail or unsupported specific advice.

The PDF consumes the same progress model, including the grade, verdict, delta, improvement and next-goal evidence, comparison dates, missing-baseline states, method, and coverage. It uses a teal grade on paper and stacked text comparisons rather than reproducing the on-screen bar layout. Renderer examples are `.impeccable/review/report-progress/wide-es.png`, `compact-es.png`, `minimum-es.png`, `wide-dark.png`, and their `*-comparison.png` captures; `pdf-first-page.png` shows the PDF treatment. These are captures of the compiled renderer and export with synthetic local data, not evidence of native Tauri execution.

### Monitoring consent

A bounded dialog keeps its heading and action row visible at 340 × 400px. The details occupy an independently scrollable middle region. A “Read remaining details” cue appears while hidden text remains, advances the text when activated, and disappears at the end; the actions stay anchored in light and dark appearances.

### Session planner

The disclosure opens a labelled intention textarea and start/finish fields for today. The draft separates a summary, chronological blocks, and work that needs more time; feedback and revision sit below the blocks, followed by solid teal confirmation and a quiet discard action. A local calendar list reuses the same time-and-title geometry after confirmation. Status copy remains in a live region between the request form and draft. Labels use the actual theme foreground, with muted foreground reserved for explanations and rationale.

Planner textareas use the existing cool border and 11px corner family, 12px padding, and a 100px minimum height. Scoped affirmative actions use solid Session Action Teal. Buttons, inputs, selects, textareas, and disclosure summaries in the planner and onboarding use a solid 3px focus outline with a 3px offset in the appearance-specific focus color.

### Optional first-run setup

Each of the five steps pairs a compact heading (22px, 700, 1.25) with explanatory copy (13px), labelled controls, and a numbered progress indicator. Optional work context sits behind a disclosure. Reminder choices and calendar recap consent remain separate labelled toggles; a disabled context choice explains its relationship through the adjacent focus-reminder control. The footer's solid teal Continue/Finish action, quiet Skip setup action, and visible save errors retain the same positions as step content changes.

Inline SVG examples have purposeful geometry: staggered work, break, and review blocks explain a session; activity lines leading to a document explain a local report. Examples stop growing at 300px, carry accessible descriptions, and use foreground text for their labels. Work blocks reveal through clipping over 650ms with the existing restrained ease (cubic-bezier(0.16, 1, 0.3, 1)) and small staged delays; reduced motion removes the animation and leaves the complete example visible.

### Build in public inside Online

The compact shell gives the work list precedence over a visible feature heading. Idea, prompt, and proposal titles share the Studio Title role; ordinary reading and controls use 12px, field labels and short excerpts use 11px, and dates, recorded signals, revision metadata, and counters use 10px. Section headings remain in the incumbent heading family. The idea-count heading is a quiet 12px, 600-weight label. At wider widths, editor textareas increase to 14px. The Online tab strip shows selection with a card-colored surface; the four studio views show it with a teal underline.

Each successful local batch presents up to five concrete grounded stories. An idea row leads with a title of up to two visible lines, followed by a single-line source excerpt and one line of recorded minutes, observation count, date, and editorial angle. The excerpt and metadata truncate while the editor retains the complete evidence. Fine borders and 13px vertical row padding keep the alternatives comparable without turning them into cards. The toolbar distinguishes first generation, further generation, and the busy state; current results remain present while work is pending.

Current and earlier local batches remain distinguishable. Saved selections have their own heading and count, with a native checkbox beside a separate title/date/confirmation column at a 10px gap and a separate Review action. A labelled evidence editor allows factual corrections and confirmation; its saving copy identifies the chosen highlight as the material that moves to the private online space. Prepare prompts opens the dedicated network/style/profile step. LinkedIn, X, and Instagram choices prepare prompts for an external assistant.

Prompts and Contenido reuse the subject-first divided rows. Prompt metadata shows network, style, and whether content has returned. Proposal metadata shows network, state, origin, and revision; its preview is limited to two lines. Their editors retain the full prompt or proposal, with a visible Unsaved changes state. The content editor separates the post or first message from the full thread, script, or slide plan and optional visual outline. Explicit Save, Copy, and Delete actions remain available; the surface has no approval, scheduling, destination, or publication controls.

Ajustes groups social profiles stored independently in FlowSight, a scoped assistant connection, and project/voice preferences with a local suggestion cadence. Profile name, handle, network, and usual style give prompts context without a Buffer account requirement. Each group is separated by a fine rule and spacing, rather than additional raised cards. The surface journey and pilot boundary are recorded in `docs/BUILD_IN_PUBLIC.md`.

Fields use theme surfaces and foregrounds, a fine border, Studio Control corners, and 10px by 11px padding. Interactive studio controls have a 2px accent focus outline with a 3px offset. Same-view renders restore keyboard focus and text selection; changing views moves focus to a heading, and an editor can receive focus on its back control. A persistent live-region node announces work and failures. Button color changes take 150ms and lose their transition under reduced motion.

Profile, preference, and direction form drafts survive busy and error renders; successful writes clear the transient draft, and owner changes clear the previous owner's form state. Stable local identities retain corrected ideas across regeneration and keep prior batches on the device. Unfinished manual highlights also use local persistence. Evidence, prompt, and proposal edits remain available during ordinary internal navigation, with unsaved state visible in their editors. This draft retention does not upload evidence. A minute-based studio check updates returned content, its count, and assistant-set direction while an idle view is open, including manual idea cadence. Open editors, active forms, and ongoing requests defer this refresh so incoming content does not overwrite the user's work or steal focus.

An optional Instagram visual outline uses a programmatically drawn PNG canvas in a 4:5 portrait format (1080 × 1350). Its editable headline leads, followed by an explanation and a signature/project footer. Manrope, a pale field, and dark green reading text carry the composition; the footer has a quiet separator. The title and explanation wrap and reduce in size to fit. The preview fills the available column and keeps its portrait ratio. It is labelled as an outline for creative development, not a finished carousel or generated image asset.

## Do's and Don'ts

### Do:

- **Do** use the 56px grid as a quiet background behind readable surfaces.
- **Do** keep Manrope display type and Plus Jakarta Sans reading type together across tabs.
- **Do** use the indigo-to-teal gradient for tracking and first-run primary actions, with solid teal for routine confirmations.
- **Do** keep the dock and consent actions reachable in narrow, short windows.

### Don't:

- **Don't** stretch the phone layout or its spacing directly into a wide desktop window.
- **Don't** use teal on every card or turn observed activity into a score-like visual. The explicitly labelled individual-report focus grade is the scoped exception described above; it must retain its method and recorded-pattern limits.
- **Don't** let the floating dock cover the last controls in a scrolled pane.
- **Don't** hide remaining consent details behind a fixed action row without a visible way to reach them.
