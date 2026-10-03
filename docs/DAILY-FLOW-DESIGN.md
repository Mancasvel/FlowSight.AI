# Daily Flow component design

## Overview

Daily Flow lives in Insights/Reports directly below its header, incorporating the familiar date and weekday strip into one native disclosure. Fresh reload closes it while today's localized date, streak, chevron, and seven weekday dots remain visible. It is absent from Today and its timer. This narrow Operate refinement retains FlowSight's Manrope / Plus Jakarta Sans, slate text, teal signals, and gridded canvas; `DESIGN.md` and `PRODUCT.md` remain the governing contracts.

## Colors

All component colors inherit CSS custom properties; Daily Flow introduces no palette. Values below come from `mobile-theme.css` and `public/theme-dark-mobile.css` and are consumed as `hsl(var(--token))`.

| Token | Light HSL | Dark HSL | Component use |
| --- | --- | --- | --- |
| `--card` | `0 0% 100%` | `209 25% 13%` | Panel fill |
| `--foreground` | `222 47% 11%` | `190 22% 91%` | Heading, mission, current day |
| `--muted-foreground` | `215 16% 43%` | `199 15% 74%` | Notes, day labels, pending milestones |
| `--muted` | `210 27% 96%` | `207 21% 18%` | Progress track and summary hover |
| `--primary` | `175 100% 36%` | `172 66% 63%` | Progress fill |
| `--accent-foreground` | `176 91% 25%` | `172 75% 75%` | Earned dot fill/border, today border, win count, and streak value |
| `--border` / `--ring` | `216 24% 88%` / `176 79% 37%` | `203 15% 29%` / `172 71% 62%` | Panel/dividers and disclosure focus |

## Typography

The collapsed date uses inherited Plus Jakarta Sans at 12px; the streak label is 11px with a teal 700-weight value and tabular numerals. Weekdays use short localized names at 11px, with today's label at weight 800. Inside the detail, the heading uses Manrope at 15px / 800. Mission text is 13px; its count is 11px / 700 with tabular numerals. Supporting copy and milestone rows use 11px; explanatory copy has 1.6 line height. The milestone heading uses Manrope at 11px / 700, and week counts use tabular numerals.

## Layout

The disclosure follows Insights' existing centered column (760px maximum), with `4px 0 18px` margin and a transparent outer surface. Its summary is a block containing a header grid (`minmax(0, 1fr) auto 16px`, 12px gap, 44px minimum height) and the single weekday strip; the chevron is 16px. The week uses seven grid columns, 6px gaps, and `0 4px 12px` padding; labels sit 8px above 17px circles. Detail begins 8px below the summary with `18px 20px` padding. At 380px and narrower, header gaps become 8px, detail padding becomes 16px, and the mission row wraps. Interior heading/count rows use 12px flex gaps. The progress rail is 4px tall with 2px corners; the daily-win check is 16px.

## Elevation & Depth

The expanded detail uses the theme card fill and a 1px border, without a component shadow; its corners inherit `--radius: 16px`. The summary has 6px corners and gains the muted theme fill on hover. A top border and 12px padding separate the milestone section. Weekday circles use the incumbent empty/filled ring treatment: transparent fill and 2px theme border, with teal fill/border for earned days and a teal border for today.

## Components

- **Disclosure:** the stable outer `details` node is moved into a slot after the Insights header whenever report content renders, including empty history. Its native open state survives progress refreshes and tab navigation; a fresh reload closes it. Refresh restores main-summary focus when that summary held focus. Opening rotates the chevron 180 degrees and exposes progress, weekly target, rest copy, and all milestones beneath the unchanged weekday strip.
- **Daily progress:** one win requires 15 saved tracked minutes; pauses and breaks do not count. The rail exposes a labelled 0–100 progressbar, while copy shows remaining whole minutes rounded up or an earned check and “Daily win.” The hours goal remains independent.
- **Week:** one Monday–Sunday dot strip lives inside the summary and remains visible both closed and open; there is no duplicate strip in the detail. Earned days use filled circles; today has a bold label and accented circle border without an offset outline. The strip uses `span` elements with `role="list"` and `role="listitem"`, full localized date/state labels, and `aria-current="date"` for today; decorative circles are hidden from assistive technology. The expanded detail shows the three-day weekly target and copy confirming that rest days keep milestones.
- **Milestones:** a section visible within the expanded detail shows the next target and cumulative wins. Rows are First step (1), Finding rhythm (3), Building momentum (7), and Steady practice (30); earned rows show teal “Earned” labels. The note identifies saved time as the measure, without assessing work quality. There is no nested disclosure.
- **Settings:** a labelled native checkbox, “Show Daily Flow and personal milestones,” hides the entire outer disclosure. Visibility defaults on and persists in localStorage; a storage failure announces that the preference applies for this session. Re-enabling refreshes progress. Theme and language use the renderer's existing choices; open state is not persisted.
- **Loading/error:** the date and weekday dots remain visible, with an em dash for unavailable streak data. Before progress arrives, weekday labels carry their dates without earned-state claims. A failed refresh retains the last known earned marks. Loading and failure messages live inside the expandable detail; failure copy explains that tracking still works and offers the existing ghost-style Retry button. A successful retry restores progress.
- **Keyboard and announcements:** native checkbox, disclosure, and Retry controls follow normal keyboard interaction. The summary has a 2px theme-ring focus outline with 3px offset; checkbox and Retry inherit the existing focus styling. A visually hidden, polite, atomic status region announces a newly earned win and any milestone.
- **Motion:** only a live transition into today's first win celebrates; initial earned loads are quiet. The current day circle scales 0.85 → 1.12 → 1 over 600ms with `cubic-bezier(0.16, 1, 0.3, 1)`. The latest celebration date is persisted to prevent repeats. Reduced motion removes the animation.

## Evidence and scope

Source: `apps/agent/src/renderer/daily-flow.css`, `daily-flow-ui.mjs`, `daily-flow.mjs`, and `index.html`. The independent `REVIEW-WEEK-VISIBLE.md` returned ship for the corrected visible-week contract after inspecting all 28 valid feature screenshots in `.impeccable/review/daily-flow-week-visible/`: English/Spanish, light/dark, 900/370/320px, and earned/empty states. Measured minimum text contrast is 5.06:1 light and 8.73:1 dark. The production build, 99 renderer tests, and browser suite passed; browser assertions cover default closure, one visible weekday strip, keyboard opening, stable open state, navigation, hiding, retry, empty history, and midnight. Captures use synthetic Tauri IPC and fictional local records; they establish renderer evidence, not installed native-runtime verification. Reward calculations and native privacy/data rules are unchanged by this correction; their product documentation is `docs/DAILY-FLOW.md`.
