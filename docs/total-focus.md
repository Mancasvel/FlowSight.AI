# Total focus

Total focus is an intentional protection mode linked to the main tracking clock. It redirects chosen websites to a
local blocked page and leaves explicitly allowed domains or paths available. It
does not prove that the user is in a measured Deep Focus or flow state.

## Setup and use

The initial wizard has six steps. The fourth shows an illustrative block and lets
the user save blocked sites, exceptions and a 5–180 minute duration. It includes
Chrome store installation, masked pairing-key copy and a connection check. Saving
the wizard does not activate protection. Today opens the same controls in Settings.

The task is required. Starting with an empty or whitespace-only task reveals an
inline error and scrolls to the enabled task input with keyboard focus. During
activation, the button shows Starting total focus and visible progress explains
the browser acknowledgement wait (up to 90 seconds). A failed activation reveals
its error and restores the button for retry; a successful start is confirmed only
after actual browser acknowledgement.

The user must install and pair Browser Controls on the same machine. The app
shows connected, confirmed active, unconfirmed and pending release states. The
session protects HTTP(S) top-level navigation and replaces already open matched
tabs with a local page. Exceptions have higher DNR priority. No native application
processes are terminated or prevented from launching.

URL changes within single-page websites are checked as well as network navigation.
Common `www.` prefixes are normalized so blocking a site covers its main domain
and subdomains consistently.

While a session is active, FlowSight's own focus reminders are held in the local
notification digest. On Windows, the configurable notification option also
silences ordinary app banners and restores the previous registry setting after
explicit end, expiry or extension emergency end. Other FlowSight quiet-mode
owners retain their silence until they too finish; user changes to the Windows
setting are preserved. A failed browser activation rolls back notification
silence. This is the Windows banner switch, not Focus Assist allowlists or native
process blocking. It does not prevent opening messaging apps.

Held reminders appear in Total focus after the last notification hold ends and
remain stored across restarts until dismissed. Failed quiet-state reads suppress
a reminder rather than interrupting focus. Maintenance clears expired native
sessions and retries notification restoration every five seconds. On graceful
quit, Windows banners are restored; an unexpired session resumes silence when
the app reopens. Browser protection continues independently until its expiry or
emergency end, even with the app closed.

Windows, macOS and Linux share the same loopback protocol and MV3 extension. The
feature requires neither a cloud plan nor a running model. Activity tracking is a
separate choice. No messages are sent by this mode; messaging status and automatic
replies are explicitly described as a future integration.

From Windows 6.0.7, starting total focus also starts the native recorded-time
clock after browser protection is confirmed. The clock's pause and resume buttons
control total focus, and Stop or End total focus stops both without clearing daily
time. Pausing persists the exact remaining seconds, releases browser rules and
owned Windows silence, and survives restart. Resume uses the saved remaining time
and a new policy ID, confirms protection, then resumes counting. Failed resume
keeps the session paused. Native expiry and browser emergency end also stop the
linked clock, including when the window is hidden. The main timer stays on its
recorded-time display during total focus and shows the remaining focus time below;
Pomodoro preferences remain saved for ordinary sessions.

## Lifecycle and privacy

The encrypted agent state stores the session ID, intention, expiry and rules. The
extension receives the current policy at each authenticated poll (30 seconds),
reconciles its owned rule range 1000–1039 and reports acknowledgement. App controls
wait for that acknowledgement; a failed start clears the native policy. Legacy
browser rules retain their own IDs and cannot clear total focus. Total focus
exceptions apply to matching legacy blocks as well, because the user explicitly
allows those destinations during the session.

The extension persists the policy locally so protection continues across a closed
app or transient disconnection, until its fixed expiry. A Chrome alarm and startup
poll clean up expired rules. Ending in the app clears the authoritative policy;
if disconnected, the UI explains immediate release from a blocked page. That page
always offers an end button. A cancellation tombstone prevents a stale app policy
from reactivating the same session on reconnect. There is no automatic restoration
of replaced tabs, avoiding a burst of distracting pages after a session ends.

The task text is stored in the extension's local storage and displayed on the
blocked page. The extension already needs tabs access for optional tab tools and
now needs HTTP(S) host access for DNR redirects. It does not upload matched URLs,
page contents or tab titles for total focus. Pairing uses an encrypted local key
and authenticated requests to 127.0.0.1:38547.

## Agent tools

- `focus.total_start`: reviewed activation, with explicit intention and optional
  sites, exceptions and duration. Saved settings are frozen into the proposal so
  the confirmed action matches the preview.
- `focus.total_end`: reviewed release.
- `focus.total_status`: read-only preferences, session and extension status.

## Verification

Node tests cover rule ownership, allow precedence, expiry, reconnect/restart,
emergency cancellation and invalid policies. A Playwright check installs the real
MV3 extension against a synthetic loopback server and verifies open-tab and new
navigation redirects, allowed paths, disconnect, emergency end and expiry.
Renderer checks use isolated native responses, compact/minimum/wide layouts and
light/dark themes. Native tests and builds run on the matching GitHub OS runners.

UI finish review and documentation were completed by the primary agent; additional
review agents were omitted to respect the user's request to reduce PC load.

## Arc and extension updates

Arc uses the same MV3 extension on Windows and macOS. Linux uses Chrome or another
compatible Chromium browser. Version 1.0.0 supports the older browser tools but
does not apply total focus. Desktop 5.0.17 requires a recent valid focus-status
acknowledgement before enabling total focus; connection alone is insufficient.
Version 1.1.1 reports its version and returns an actual pairing result, including
a rejected key or unreachable local app. Options can be opened in Arc from
`arc://extensions` → FlowSight Browser Controls → Details → Extension options.
Store updates may request approval for HTTP(S) site access. A GitHub ZIP does not
automatically update a Chrome Web Store installation.

Desktop 6.0.5 includes Browser Controls 1.1.2 and a local recovery path when the
store version still connects without supporting total focus. Open compatible
extension folder from Total focus or Browser pairing, disable the older extension
in the browser, enable Developer mode and Load unpacked with the opened folder.
Pair the new extension using the existing local key. The folder is part of the
installed app and receives the packaged extension on subsequent desktop updates;
reload an unpacked extension in the browser after updates. Keep only one paired
Browser Controls enabled on a given browser profile.

Browser Controls 1.1.2 reports website-access readiness independently from pairing.
Rule installation errors return the actual failure through the command result,
so a failed activation clears its native policy and can be retried. Options never
claim that total focus is ready just because loopback pairing succeeded.
