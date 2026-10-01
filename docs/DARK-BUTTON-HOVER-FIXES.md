# Dark button hover correction

Prepared on 2026-10-01, following the onboarding preview correction.

## Cause

The dark stylesheet supplied base surfaces for secondary buttons, maximising
the window, and stopping tracking, but the light theme's more specific hover
selectors still won. The affected controls jumped to near-white backgrounds
while retaining pale foreground text. The local Work report button also had a
light focus-visible background rule.

## Change

Explicit dark interactive selectors now retain the dark palette and add only
a little light:

| Control | Base | Hover |
| --- | --- | --- |
| Secondary / Work report | `#204341` | `#294e4b` |
| Window controls | `#162630` | `#20343e` |
| Stop tracking | `#412d31` | `#4d373b` |
| Ghost on the settings surface | `#1a2c36` | `#213741` |
| Session/setup/PDF solid teal actions | `#087f78` | `#0c837c` |

Rules are gated by `html[data-theme="dark"]`, which the existing theme
preference controller sets for both system and manual dark mode. The hover
selectors exclude disabled controls. The Work report's focus-visible surface
stays dark, while its existing keyboard focus outline remains available.

## Verification

`node scripts/verify-dark-button-hovers.mjs --capture-before` captured the original
fault. `node scripts/verify-dark-button-hovers.mjs` tested the changed renderer
with isolated synthetic Tauri responses at 370×700 and 900×800. This does not
start/stop real tracking, operate calendars, or inspect personal activity.

All 14 measured hover cases passed, including solid teal Continue actions.
Keyboard focus outlines remain visible and disabled controls retain their base
fill during pointer hover. Affected buttons previously increased HSL
lightness by approximately 73–80 percentage points. The changed states increase
it by approximately 3.5–4.7 points. Measured hovered text contrast ranges from
at least 4.5:1 for the tested controls. The before/after screenshots and
computed-style JSON are stored in `.impeccable/review/` and were visually inspected.

Examples:

- `dark-hover-onboarding-secondary-compact-before.png`
- `dark-hover-onboarding-secondary-compact-after.png`
- `dark-hover-stop-compact-before.png`
- `dark-hover-stop-compact-after.png`
- `dark-button-hovers-before.json`
- `dark-button-hovers-after.json`
