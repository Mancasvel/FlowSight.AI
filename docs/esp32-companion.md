# USB touchscreen companion

FlowSight 6.1.1 for Windows supports the [FlowSight ESP32](https://github.com/Mancasvel/FlowSight-ESP32) firmware 0.2.0 over USB-C. Open FlowSight and connect the device; the app discovers a compatible serial adapter and verifies the firmware identity before sending state. No Wi-Fi setup is required.

The companion mirrors the app's displayed clock, timer mode, recorded daily time, daily goal, tracking status, and current calendar title when one is available. English and Spanish follow the app's language preference. Start, pause, resume, stop, timer-mode changes, and ending a Pomodoro break use the same application actions as the desktop controls, including existing startup notices and total-focus protections.

The desktop renderer is the timer authority. Native events refresh its snapshot every 500 ms while connected, including when the window is hidden. The device never advances a separate timer. After five seconds without a fresh snapshot it freezes the last reading, displays a disconnected message, and disables tracking controls. Reopening FlowSight or reconnecting USB restores synchronization.

Only one process can open the serial port. Quit FlowSight before flashing the device or using its diagnostic USB client. Touch calibration and brightness belong to the device and persist across normal firmware updates.

## Implementation

- `src-tauri/src/esp32_companion.rs` handles serial discovery, the protocol-2 identity check, bounded UTF-8 JSON lines, fresh snapshots, connection-specific acknowledgements, and deduplicated explicit control IDs.
- `src/renderer/esp32-companion.mjs` transports renderer events and serializes control execution.
- `esp32Snapshot()` and `esp32Action()` in the renderer use existing timer, calendar, localization, and monitoring functions. A stale pause request cannot be interpreted as resume.
- USB discovery is currently implemented on Windows. Other platforms retain their existing behavior without a serial worker.
- No account token, calendar credential, screenshot, or monitoring history is sent to the device. Calendar event titles can appear on the physical screen when already available in the app.

The firmware repository documents the JSON protocol, hardware wiring, and flashing procedure.
