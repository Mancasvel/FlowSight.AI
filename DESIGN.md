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
  action-indigo: "#7a7cf1"
  action-teal: "#2cbdb4"
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
rounded:
  timer: "27px"
  card: "20px"
  dock: "24px"
  action: "16px"
  control: "11px"
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
---

# Design System: FlowSight Desktop Renderer

## Overview

**Creative North Star: "The Gridded Work Companion"**

The desktop renderer belongs to the FlowSight mobile family. A pale technical grid, slate reading text, teal signals, softly raised white panels, and one indigo-to-teal tracking action make the compact Tauri window feel related to the Android app without stretching a phone screen into desktop proportions.

The visual language carries through Today, Insights, Coach, Settings, first run, and consent. It puts a clear tracking decision beside measured time, then uses quieter cards and rails for supporting evidence. This contract describes the desktop WebView and its shared interface patterns.

**Key Characteristics:**

- A 56px pale grid behind centered, softly layered work surfaces.
- Manrope for headings and measured display figures; Plus Jakarta Sans for reading and controls.
- Teal for state and progress, with an indigo-to-teal gradient concentrated in tracking and first-run actions.
- A floating four-tab dock that stays available in the narrow work window.

## Colors

The system is light first, with a complete deep-slate appearance for system dark mode.

### Primary

- **Signal Teal** (teal-primary / teal-progress): regular affirmative controls, live state, week marks, charts, and progress rails.
- **Soft Teal** (teal-soft): selected navigation and other quiet active surfaces. **Dark Active Teal** (teal-active-dark) keeps that signal legible on the dark dock.

### Secondary

- **Tracking Gradient Ends** (action-indigo / action-teal): the outer colors of the three-stop gradient used by tracking and selected first-run controls. Its blue midpoint is part of that treatment, not a general accent.

### Neutral

- **Gridded Canvas** (canvas-light / canvas-dark) with **Grid Lines** (grid-line-light / grid-line-dark): the background field in each appearance.
- **Card Surface** (surface-light / surface-dark): grouped content, forms, navigation, and dialogs.
- **Slate Reading Ink** (slate-ink-light / slate-ink-dark) and **Supporting Text** (muted-text-light / muted-text-dark): the main and secondary text pairs.
- **Panel Border** (border-light / border-dark): quiet separation around layered surfaces.

**The Signal Rule.** Use teal to show state, progress, selection, or a real action. Concentrate the indigo-to-teal gradient on tracking and first-run decisions.

## Typography

**Display Font:** Manrope (sans-serif fallback).

**Body Font:** Plus Jakarta Sans (sans-serif fallback).

Manrope gives headings and measured time a strong, friendly shape. Plus Jakarta Sans keeps explanatory copy, form labels, and dense settings readable at desktop-window sizes.

### Hierarchy

- **Display** (800, 46px, 1.12): centered elapsed time; 40px in the narrow window and 52px at 600px and wider. Tabular numerals keep the timer steady.
- **Headline** (800, 34px, 1.16): Today, Insights, and You headings; 30px at 380px and narrower.
- **Title** (800, 15px): card headings and section titles.
- **Body** (13px, 1.5): standard reading and control text; secondary explanations commonly use 11–12px.
- **Kicker** (800, 11px, 0.16em, uppercase): brief teal section cues such as Today and Your Space.

**The Measurement Rule.** Keep numbers aligned with tabular numerals while preserving the same Manrope display voice as the rest of the interface.

## Layout

The default Tauri window is 370 × 700px and remains usable at 340 × 400px. A 48px branded title bar sits above a scrollable content pane. The base pane uses 24px top and 20px side padding and reserves 112px below content so the floating dock does not cover controls. The grid repeats every 56px in both appearances.

Today centers within 640px; Insights and Settings center within 760px. At 520px, these surfaces retain their single-column reading order. At 600px and wider, content padding grows to 30px vertically and 28px horizontally, goal and task cards can sit in two columns, and Settings gains a two-column arrangement. At 380px and narrower, padding contracts to 18px top and 15px sides, while the timer, dock, and actions reduce their dimensions.

The four-tab dock floats 14px above the window bottom, spans the available width with 12px outer margins, and stops growing at 540px. In the narrow variant it sits 8px above the bottom. Consent dialogs remain bounded by viewport height; the monitoring notice leaves its action row fixed while details scroll.

## Elevation & Depth

This interface uses soft depth. White cards have fine borders and diffuse low-opacity shadows; the timer adds a faint cool tint; the floating dock and modal surfaces have stronger shadows because they sit above scrolling content. The title bar stays nearly flat. Dark mode changes the layers to deep slate surfaces while retaining the grid and border separation.

### Shadow Vocabulary

- **Surface lift** (0 8px 28px rgb(30 53 68 / 0.045)): the theme's low, ambient surface shadow.
- **Dock lift** (0 18px 36px rgb(40 67 86 / 0.13), 0 3px 9px rgb(40 67 86 / 0.06)): separates navigation from content underneath.
- **Consent lift** (0 20px 56px rgb(23 50 64 / 0.2)): makes a blocking decision legible above its dimmed background.

**The Layer Rule.** Give ordinary content a quiet lift; reserve the stronger shadow for persistent navigation and blocking overlays.

## Shapes

The timer surface has generous corners (27px), ordinary cards use 20–21px, the floating dock uses 24px, and the monitoring dialog uses 22px. Primary tracking actions use 16px corners; ordinary fields and buttons use 11px. Status badges, week marks, and progress rails use circular or fully rounded forms where their state benefits from it.

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

The four-tab dock holds Today, Insights, Coach, and Settings, with icon and text visible together. Each item is at least 51px tall in the default layout; the selected item has a pale teal fill and teal icon and label. The dock remains floating while content scrolls.

### Timer and evidence

The Today surface centers status and tabular time above a linear goal rail, goal and streak labels, and the tracking action. Insights uses a weekly day strip, a measured-time card, focus ratio rail, and task bars. These visuals show observed time and focus without turning the screen into a score.

### Monitoring consent

A bounded dialog keeps its heading and action row visible at 340 × 400px. The details occupy an independently scrollable middle region. A “Read remaining details” cue appears while hidden text remains, advances the text when activated, and disappears at the end; the actions stay anchored in light and dark appearances.

## Do's and Don'ts

### Do:

- **Do** use the 56px grid as a quiet background behind readable surfaces.
- **Do** keep Manrope display type and Plus Jakarta Sans reading type together across tabs.
- **Do** use the indigo-to-teal gradient for tracking and first-run primary actions, with solid teal for routine confirmations.
- **Do** keep the dock and consent actions reachable in narrow, short windows.

### Don't:

- **Don't** stretch the phone layout or its spacing directly into a wide desktop window.
- **Don't** use teal on every card or turn observed activity into a score-like visual.
- **Don't** let the floating dock cover the last controls in a scrolled pane.
- **Don't** hide remaining consent details behind a fixed action row without a visible way to reach them.
