# Daily Flow component design

## Overview

Daily Flow extends the existing Today surface immediately after the timer and before the session planner. It retains FlowSight's Manrope / Plus Jakarta Sans, slate text, teal signals, and gridded canvas. This is a component record; `DESIGN.md` and `PRODUCT.md` remain the governing contracts.

## Colors

All component colors inherit CSS custom properties; Daily Flow introduces no palette. Values below come from `mobile-theme.css` and `public/theme-dark-mobile.css` and are consumed as `hsl(var(--token))`.

| Token | Light HSL | Dark HSL | Component use |
| --- | --- | --- | --- |
| `--card` | `0 0% 100%` | `209 25% 13%` | Panel fill |
| `--foreground` | `222 47% 11%` | `190 22% 91%` | Heading, mission, current day |
| `--muted-foreground` | `215 16% 43%` | `199 15% 74%` | Notes, day labels, pending milestones |
| `--muted` | `210 27% 96%` | `207 21% 18%` | Progress track and day circles |
| `--primary` | `175 100% 36%` | `172 66% 63%` | Progress fill |
| `--accent` / `--accent-foreground` | `174 62% 94%` / `176 91% 25%` | `174 27% 20%` / `172 75% 75%` | Earned checks and counts |
| `--border` / `--ring` | `216 24% 88%` / `176 79% 37%` | `203 15% 29%` / `172 71% 62%` | Panel/dividers and disclosure focus |

## Typography

The heading uses Manrope at 15px / 800. Mission text uses inherited Plus Jakarta Sans at 13px; its count uses 11px / 700 and tabular numerals. Supporting copy, week labels, and milestone rows use 11px; explanatory copy has 1.6 line height. Week counts also use tabular numerals.

## Layout

The panel follows Today's existing centered column (640px maximum), with 14px top and 20px bottom margin. Padding is 18px vertically and 20px horizontally; at 380px and narrower it becomes 16px, and the mission row wraps. Heading and count rows use flex alignment with 12px gaps. The week is a seven-column grid with 6px gaps; day circles measure 28px and checks 16px. The progress rail is 4px tall with 2px corners.

## Elevation & Depth

Daily Flow uses the theme card fill and a 1px border, without a component shadow. Its corners inherit `--radius: 16px`. A top border and 12px padding separate the milestone disclosure; earned day circles use a pale/deep teal layer rather than added elevation.

## Components

- **Daily progress:** one win requires 15 saved tracked minutes; pauses and breaks do not count. The rail exposes a labelled 0–100 progressbar, while copy shows remaining whole minutes rounded up or an earned check and “Daily win.” The hours goal remains independent.
- **Week:** Monday–Sunday marks accompany a target of three earned days. Earned days show checks; today has bold text and a 1px outline with 2px offset; future circles have transparent fills and borders. Each item has a full date/state label, and today has `aria-current="date"`. Rest-day copy says milestones remain earned.
- **Milestones:** a native, initially collapsed `details` disclosure shows the next target and cumulative wins. Rows are First step (1), Finding rhythm (3), Building momentum (7), and Steady practice (30); earned rows show teal “Earned” labels. The note identifies saved time as the measure, without assessing work quality. Refresh preserves disclosure state and restores focus when its summary held focus.
- **Settings:** a labelled native checkbox, “Show Daily Flow and personal milestones,” hides the panel and timer streak together. Visibility defaults on and persists in localStorage; a storage failure announces that the preference applies for this session. Re-enabling refreshes progress. Theme and language use the renderer's existing choices.
- **Loading/error:** initial loading shows a heading and loading message, with an em dash for the streak. Failed requests show an unavailable message explaining that tracking still works and an existing ghost-style Retry button. A successful retry restores progress.
- **Keyboard and announcements:** native checkbox, disclosure, and Retry controls follow normal keyboard interaction. The summary has a 2px theme-ring focus outline with 4px offset; checkbox and Retry inherit the existing focus styling. A visually hidden, polite, atomic status region announces a newly earned win and any milestone.
- **Motion:** only a live transition into today's first win celebrates; initial earned loads are quiet. The current day circle scales 0.85 → 1.12 → 1 over 600ms with `cubic-bezier(0.16, 1, 0.3, 1)`. The latest celebration date is persisted to prevent repeats. Reduced motion removes the animation.

## Evidence and scope

Source: `apps/agent/src/renderer/daily-flow.css`, `daily-flow-ui.mjs`, `daily-flow.mjs`, and `index.html`. The independent feature review returned ship after inspecting 14 screenshots in `.impeccable/review/daily-flow/`. Measured settled text contrast was at least 5.20:1 in light appearance and 8.73:1 in dark appearance. Captures use synthetic Tauri IPC; they establish renderer evidence, not installed native-runtime verification. Product rules and data handling are documented in `docs/DAILY-FLOW.md`.
