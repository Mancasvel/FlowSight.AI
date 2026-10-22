# Observable task progression

FlowSight measures screen progression separately from task category, tracked
time and the focus grade. Input frequency is never an evidence source.

The periodic active-window capture already used for local classification now
also feeds an in-memory comparison with the last meaningfully different frame.
An averaged 48×27 RGB signature filters small changes such as a blinking caret,
clock or mouse cursor. At least 3% of cells must change by an average of 12
channel levels before a frame counts as a visible change. Gradual changes are
compared with the reference frame, rather than discarded on each sample.

The existing local vision call adds an exact engagement field: work, reading,
live meeting, playing media, waiting or unknown. A process name alone cannot
establish reading or a live call. This field describes a possible context;
it cannot prove attention or completion.

After **more than 20 continuous minutes** without a meaningful change:

- Work or waiting becomes **possible stagnation**.
- Reading, a live meeting or playback becomes **no observable changes, possible
  passive activity**. It is measured separately and carries no automatic penalty.
- Missing, failed or ambiguous model evidence remains **uncertain activity**.

Reports show the longest complete unchanged interval and the measured time
beyond the threshold, separately for those three cases. For example, a 21-minute
static interval has a full duration of 21 minutes and one minute beyond the
threshold. These figures are observations, not judgements of performance.
Mandatory evidence and uncertainty survive optional local-model ranking and
appear in both English and Spanish report output, including the existing PDF.

Pausing/resuming monitoring, capture failures, long sampling gaps, changing
task/account/window, and foreground/window-lifecycle events reset comparison.
UI control focus alone does not reset it. Excluded applications are skipped.
The timer starts with the first valid frame; historical rows cannot be
retroactively classified from repeated generic descriptions.

Only a small JSON record of state, observed duration, unchanged duration and
the threshold excess is saved in the original local `reports` row. The visual
signature and context digest are never persisted or uploaded. Existing report
retention, export and erasure apply to the saved metadata. No extra model call,
keyboard/mouse hook, audio capture or new backend schema is required.

This is a heuristic over sampled active-window content. It cannot establish
that someone is reading a static page, distinguish every small meaningful edit
from UI noise, or equate a moving screen with an advancing task. Large unrelated
animations can count as visible changes. Background work may progress without
appearing in the foreground window. Those limits are why the output stays
observational and does not change task categories, focus grades or league scores.
