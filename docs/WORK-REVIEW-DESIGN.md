# Work review surface

This document records the built Insights report and its inline local choice form. [PRODUCT.md](../PRODUCT.md) owns product behavior and privacy constraints; [DESIGN.md](../DESIGN.md) remains the governing visual system. This is an Operate surface within the established FlowSight mobile family, with no new visual world or system-wide design rule.

## Overview

Insights offers Today, Last 7 days, and Last 30 days before report generation. The existing report modal presents recorded activity and interpretation, then lets the person write one choice, use a report suggestion through **Try this change**, or choose **Keep my current plan**. Each opens the same editable form; saving is an explicit action.

The report header identifies Local AI or rule-based origin, the number of days with recorded activity, and the limit that recorded activity does not cover the whole working day. An adjacent sharing line shows the loaded activity-sync and cloud-AI state and explains requested report sharing through MCP. If settings cannot be loaded, it directs the person to Settings instead of guessing their state. The empty Insights guide explains how to begin tracking and that an empty report cannot support recommendations.

## Colors

The surface inherits slate foregrounds, theme surfaces, borders, and teal signals. The form's affirmative action uses the existing Session Action Teal (`#087f78`), with `#066b65` on hover and white labels. Origin and sharing text in the dark report hero use the established pale teal (`#d4e7e7`). Supporting privacy copy and saved-date metadata use the theme's muted foreground; field labels and choice text use its main foreground.

## Typography

The modal inherits Manrope headings and Plus Jakarta Sans reading and control text from the mobile-family theme. The choice heading is 16px. Explanations and fields are 12px; form labels use weight 650. Privacy, date/status metadata, and saved context are 11px. Long choice text wraps within its column. Existing localized labels and locale-formatted history dates remain part of the same interface.

## Layout

The choice section lives inside the existing scrollable report modal, between the report overview and detailed evidence. It shares the report's reading column at the default 370 × 700px window, the 340 × 400px minimum, and the 900 × 800px wide view. It adds no separate page, navigation item, or overlay.

Section padding is 24px vertically and 32px horizontally, contracting to 20px and 22px at widths up to 520px. The single-column form has an 8px gap and a 20px top margin. Action rows wrap with an 8px gap; buttons grow for wrapped labels and retain a 38px minimum height. Saved history begins 20px below the form or initial actions and uses separated rows with 14px vertical padding.

## Elevation & Depth

The existing modal supplies the raised surface and backdrop. The choice section adds a quiet top border, and saved rows use the same theme border. The inline form does not introduce another raised card or shadow.

## Shapes

Fields retain the established gently rounded control shape (11px corners), theme background and foreground, a one-pixel theme border, and 10px padding. Textareas have a 70px minimum height and can resize vertically. Buttons, fields, selects, and the history summary retain a visible 3px theme-primary focus outline with a 3px offset.

## Components

- **Choice form:** Your choice (required, up to 500 characters), Review on (required date), What happened? (To review, Tried, Not tried, Discarded), and optional Result or context (up to 1,000 characters). New choices default to To review with a review date seven days ahead. A draft retains the report period it came from.
- **Saved choices:** a disclosure lists saved text, outcome, review date, optional context, and **Review or edit**. It opens automatically when a To review record is due. Opening an existing choice exposes **Delete choice**, which asks for confirmation.
- **Draft preservation:** unsaved text, date, outcome, and context survive report attachment or refresh. Activating a suggestion or another saved choice asks before replacing edited fields; declining retains the draft. Activating the same saved choice focuses its current form. Cancel closes the draft, and history disclosure state is retained within the controller.
- **Feedback and recovery:** a polite live status region reports save/delete results and loading or mutation failures. Mutation controls are disabled while the request is pending. Empty or whitespace-only choice text receives an instruction and focus before saving. A transient failure retains the draft for retry. If an edited saved record is no longer available, the form retains its context, explains the missing record, removes its Delete action, and offers **Save as new choice**; only that explicit submit creates a new record.

Choices are private local records. The surface states their exclusion from report/PDF, MCP, and cloud sync. As defined in PRODUCT.md, they inherit local retention and erasure; the explicit personal data export includes them. Saving a choice does not apply a plan or execute a report suggestion.

## Do's and Don'ts

- **Do** keep the decision, its privacy explanation, and its result feedback inside the existing report reading flow.
- **Do** preserve the person's draft and its original report context until they save, cancel, or explicitly accept replacement.
- **Do** keep origin, observed coverage, and loaded sharing state visible alongside report interpretation.
- **Don't** present recommendations, saved choices, or outcomes as verified productivity judgments.
- **Don't** promote this form's spacing or state behavior into a new global design contract.

## Source and evidence

Implementation: [work-review.mjs](../apps/agent/src/renderer/work-review.mjs), [work-review.css](../apps/agent/src/renderer/work-review.css), [status-report.mjs](../apps/agent/src/renderer/status-report.mjs), [index.html](../apps/agent/src/renderer/index.html), and the existing [mobile-theme.css](../apps/agent/src/renderer/mobile-theme.css).

The finish disposition at `C:\Users\manue\codex_sessions\flowsight_2026-10-01\mirofish\release\finish-verdict.md` is **Ship for the scoped finish review**, with FR-01 and FR-02 resolved. Captures in the adjacent `release\evidence` directory show the actual compiled renderer with synthetic Tauri IPC/storage and no user data. They are renderer evidence, not a volunteer study or evidence of native storage execution. Verification details belong in that technical verdict and project logs, rather than feature truth here.

The existing `.impeccable/design.json` has a session-specific extension for onboarding and planning, but no general report-surface slot. It is unchanged; this document records the scoped addition without inventing sidecar schema. DESIGN.md is unchanged.
