# Daily Flow component design

## Overview

Daily Flow lives in Insights/Reports directly below its header, replacing the separate date and week strip. It is a native disclosure, closed on fresh reload, showing only today's localized date, streak, and chevron until expanded. It is absent from Today and its timer. This narrow Operate refinement retains FlowSight's Manrope / Plus Jakarta Sans, slate text, teal signals, and gridded canvas; `DESIGN.md` and `PRODUCT.md` remain the governing contracts.

## Colors

All component colors inherit CSS custom properties; Daily Flow introduces no palette. Values below come from `mobile-theme.css` and `public/theme-dark-mobile.css` and are consumed as `hsl(var(--token))`.

| Token | Light HSL | Dark HSL | Component use |
| --- | --- | --- | --- |
| `--card` | `0 0% 100%` | `209 25% 13%` | Panel fill |
| `--foreground` | `222 47% 11%` | `190 22% 91%` | Heading, mission, current day |
| `--muted-foreground` | `215 16% 43%` | `199 15% 74%` | Notes, day labels, pending milestones |
| `--muted` | `210 27% 96%` | `207 21% 18%` | Progress track and day circles |
| `--primary` | `175 100% 36%` | `172 66% 63%` | Progress fill |
| `--accent` / `--accent-foreground` | `174 62% 94%` / `176 91% 25%` | `174 27% 20%` / `172 75% 75%` | Earned checks, counts, and streak value |
| `--border` / `--ring` | `216 24% 88%` / `176 79% 37%` | `203 15% 29%` / `172 71% 62%` | Panel/dividers and disclosure focus |

## Typography

The collapsed date uses inherited Plus Jakarta Sans at 12px; the streak label is 11px with a teal 700-weight value and tabular numerals. Inside the detail, the heading uses Manrope at 15px / 800. Mission text is 13px; its count is 11px / 700 with tabular numerals. Supporting copy, week labels, and milestone rows use 11px; explanatory copy has 1.6 line height. The milestone heading uses Manrope at 11px / 700, and week counts use tabular numerals.

## Layout

The disclosure follows Insights' existing centered column (760px maximum), with `4px 0 18px` margin and a transparent outer surface. Its summary uses `minmax(0, 1fr) auto 16px` grid columns, a 12px gap, and a 44px minimum height; the chevron is 16px. Detail begins 8px below the summary with `18px 20px` padding. At 380px and narrower, summary gaps become 8px, detail padding becomes 16px, and the mission row wraps. Interior heading/count rows use 12px flex gaps. The week is a seven-column grid with 6px gaps; day circles measure 28px and checks 16px. The progress rail is 4px tall with 2px corners.

## Elevation & Depth

The expanded detail uses the theme card fill and a 1px border, without a component shadow; its corners inherit `--radius: 16px`. The summary has 6px corners and gains the muted theme fill on hover. A top border and 12px padding separate the milestone section; earned day circles use a pale/deep teal layer rather than added elevation.

## Components

- **Disclosure:** the stable outer `details` node is moved into a slot after the Insights header whenever report content renders, including empty history. Its native open state survives progress refreshes and tab navigation; a fresh reload closes it. Refresh restores main-summary focus when that summary held focus. Opening rotates the chevron 180 degrees and exposes progress, week, and all milestones together.
- **Daily progress:** one win requires 15 saved tracked minutes; pauses and breaks do not count. The rail exposes a labelled 0–100 progressbar, while copy shows remaining whole minutes rounded up or an earned check and “Daily win.” The hours goal remains independent.
- **Week:** Monday–Sunday marks accompany a target of three earned days. Earned days show checks; today has bold text and a 1px outline with 2px offset; future circles have transparent fills and borders. Each item has a full date/state label, and today has `aria-current="date"`. Rest-day copy says milestones remain earned.
- **Milestones:** a section visible within the expanded detail shows the next target and cumulative wins. Rows are First step (1), Finding rhythm (3), Building momentum (7), and Steady practice (30); earned rows show teal “Earned” labels. The note identifies saved time as the measure, without assessing work quality. There is no nested disclosure.
- **Settings:** a labelled native checkbox, “Show Daily Flow and personal milestones,” hides the entire outer disclosure. Visibility defaults on and persists in localStorage; a storage failure announces that the preference applies for this session. Re-enabling refreshes progress. Theme and language use the renderer's existing choices; open state is not persisted.
- **Loading/error:** the same date/streak summary remains available, with an em dash for unavailable streak data. Loading and failure messages live inside its expandable detail. Failure copy explains that tracking still works and offers the existing ghost-style Retry button; a successful retry restores progress.
- **Keyboard and announcements:** native checkbox, disclosure, and Retry controls follow normal keyboard interaction. The summary has a 2px theme-ring focus outline with 3px offset; checkbox and Retry inherit the existing focus styling. A visually hidden, polite, atomic status region announces a newly earned win and any milestone.
- **Motion:** only a live transition into today's first win celebrates; initial earned loads are quiet. The current day circle scales 0.85 → 1.12 → 1 over 600ms with `cubic-bezier(0.16, 1, 0.3, 1)`. The latest celebration date is persisted to prevent repeats. Reduced motion removes the animation.

## Evidence and scope

Source: `apps/agent/src/renderer/daily-flow.css`, `daily-flow-ui.mjs`, `daily-flow.mjs`, and `index.html`. The fresh independent `REVIEW-INSIGHTS.md` returned ship for this placement/disclosure correction after inspecting all 28 valid feature screenshots in `.impeccable/review/daily-flow-insights/`: English/Spanish, light/dark, 900/370/320px, and earned/empty states. Measured minimum text contrast is 5.06:1 light and 8.73:1 dark. Browser assertions passed keyboard opening, stable open state, tab navigation, reload collapse, hiding, retry, empty history, and local midnight. Captures use synthetic Tauri IPC and fictional local records; they establish renderer evidence, not installed native-runtime verification. Reward calculations and native privacy/data rules are unchanged by this correction; their product documentation is `docs/DAILY-FLOW.md`.
