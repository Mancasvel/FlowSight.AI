# Reviewed sessions and linked calendars

Session suggestions run locally. Generating, revising and discarding a proposal
never writes a provider event. A proposal records its actual calendar destination
and the user confirms the displayed blocks before the native writer runs.

## Destination and availability

- A configured provider is honored; a disconnected selection requires reconnection.
- Otherwise Google is selected when connected, then Microsoft.
- Google uses the connected account's owned primary calendar. Microsoft uses its
  editable default calendar. The destination is retained with the proposal.
- Without a connected provider, reviewed blocks are saved to FlowSight locally.
- Availability is read before planning and checked again before saving. Google
  uses expanded events, compatible with the existing `calendar.events.owned`
  scope. Both providers exclude free/cancelled events and validate time ranges.
- A provider error is visible; it does not silently redirect a linked save locally.

## Recovering interrupted saves

The encrypted local agent document stores the reviewed session and stable local
event identities before the first remote write. Google uses deterministic event
IDs and private properties. Microsoft uses a deterministic transaction ID and
legacy private properties. Each write first checks for an unchanged existing block.
An uncertain response triggers a read, with no immediate repeated POST.

The session is marked complete and mirrored in the local calendar only after all
provider IDs have been confirmed. A restart displays an incomplete journal and
requires an explicit retry. A retry validates owner, target, availability, and the
existing blocks. It does not rewrite calendar events that have been edited.

The user can explicitly stop the remaining save. Already sent events are kept,
known confirmed events are mirrored, and uncertain results are disclosed. The
journal records abandonment separately from successful completion. No provider
events are deleted. The user should inspect the linked calendar after abandoning
an interrupted request, because the provider may have committed before losing its
reply. A later proposal reads that calendar's current busy intervals.

Calendar tokens, save journals and journal-created mirrors are scoped to the
signed-in FlowSight owner. Switching accounts does not expose another owner's
session or block the current account. Existing local state is preserved.

## Counted tasks

An explicit request for N exercises, problems, tasks or items is a host invariant
in English and Spanish. The planner uses one work block per counted item, with
actual rest blocks. Named topics must match the requested count. Explicit item
durations have priority. Without duration evidence, free time after reserving
breaks is divided into provisional per-item estimates. Matching recorded daily
task time can supply a visibly labeled proxy; it is not measured exercise time.
Items that do not fit remain visible as unscheduled work.

## Verification

The Windows 5.0.12 candidate passes 235 native tests (two optional tests ignored),
89 renderer tests, format and Clippy. Sixteen synthetic HTTP provider tests cover
availability, DST/all-day events, creation, uncertain responses, 409 recovery,
partial saves, permissions, edits, duplicates and untrusted page links. Native
tests also cover journal recovery, completion, abandonment, migration and account
isolation. Production Chromium tests cover Spanish/English confirmation,
destination text, partial recovery after restart and explicit abandonment.

Real local Qwen was exercised with synthetic context: four ADDA exercises became
four 67-minute work blocks and three ten-minute rests in a five-hour window;
a requested revision preserved four items and reserved fifteen-minute rests.
No private databases or real provider calendars were used in verification.

The Coach regression is separately tested against production renderer history,
new replies, navigation, Markdown and escaped HTML in Spanish and English. Its
cause was a string variable shadowing the HTML tagged-template function.
