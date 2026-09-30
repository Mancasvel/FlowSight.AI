# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The primary interface is a compact, resizable Tauri desktop WebView. The current repository ships the Windows agent; desktop operating conventions still apply to its controls and window chrome.

## Users

Individuals doing knowledge work, especially developers, who want to understand their own work patterns without turning activity data into employee surveillance. The desktop user is the primary audience for this redesign; extending the same visual work to a separate public website remains an open scope decision.

## Product Purpose

FlowSight records and interprets local work activity so a person can review time, sustained focus, interruptions, and work context, then decide what to change. A useful result is an evidence-grounded review, not a productivity score.

## Positioning

Sensitive screen-context analysis runs on the user's device. The user chooses when local tracking runs and separately opts into any cloud sync or cloud AI features.

## Operating Context

- A narrow desktop window defaults to 370 × 700 px and can be resized down to 340 × 400 px.
- The main tasks are Today (start/pause tracking and set a goal or task), Insights (inspect activity and generate a local work report), and Settings/You (account, privacy, integrations, and app preferences). The local agent works proactively in the background and uses tools according to the user's permissions; it has no chat tab.
- Closing the window hides it in the system tray; quitting is a separate action.

## Capabilities and Constraints

- Preserve the working commands, IDs, consent flows, optional cloud gates, local report/PDF export, and light/dark appearance during visual redesigns.
- A local report can use AI or a clearly identified rule-based fallback. Do not present either as a verified judgment of the person's productivity.
- Tracking, data sharing, analytics, and window-title storage have distinct consent controls; optional sharing is off by default.
- The source is available under AGPL-3.0. Individual distribution and monthly cloud plans are separate commercial matters; the interface must not imply a purchase or entitlement it has not verified.

## Brand Commitments

- Retain the FlowSight name and existing logo unless the user explicitly requests a rebrand.
- The desktop app must visually belong to the existing FlowSight mobile family (`FlowSight.Mobile` / `FlowSight.Android`): light gridded canvas, slate typography, teal-led signals, softly layered panels, and a clear primary action. Adapt the proportions and control density for a compact resizable desktop window rather than copying a phone screen pixel for pixel.
- Ratio was an earlier reference, but the user rejected the Ratio-led desktop rendition. The mobile app is now the governing visual authority for this renderer.

## Evidence on Hand

- Product behavior and positioning: `README.md`, `apps/agent/src/renderer/index.html`, and `apps/agent/src-tauri/tauri.conf.json`.
- No user research, independent usability results, or verified productivity benchmarks were supplied for this redesign.

## Product Principles

1. Show what was observed and separate it from interpretation.
2. Keep tracking and sharing under the user's control.
3. Make the most common desktop actions reachable at the default compact size.
4. Remain useful when cloud features or local AI are unavailable.
