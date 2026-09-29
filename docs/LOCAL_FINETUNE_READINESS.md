# Local model evolution: reviewed data before fine-tuning

FlowSight 5's bundled `Qwen3.5-2B-Q6_K.gguf` is a quantized **base model**, not a
fine-tune trained on anyone's work. The app continues to infer locally. Its
ordinary monitoring does **not** retain screenshots for training, and this
release does not turn that on.

## What existing usage can contribute

The local SQLite `reports` table contains the model's activity prediction,
capture time/source, and trusted foreground-app metadata. The description is
also usually model-generated. These are candidates for **human review**, not
ground truth; training on them directly would teach the model its own errors.
Old screenshots cannot be reconstructed from this table.

The opt-in developer tool `tools/finetune/prepare_review.py` creates a local
JSONL queue with only IDs, timestamps, app names and predicted categories. It
does not read or write screenshots, titles, descriptions, URLs, messages or
account names, and it does not upload anything. Password-manager apps and the
user's current excluded-app list are filtered. No row is included in reviewed
labels unless a person explicitly changes `include` to `true` and supplies a
`reviewed_category` from the app's category set. The finalizer rechecks current
exclusions and missing/deleted rows.

Example (only run on a database you own, and keep outputs private):

```powershell
python tools/finetune/prepare_review.py queue --db 'C:\path\to\flowsight.sqlite' --out 'C:\private\review_queue.jsonl' --days 30
# Review the selected records against your own FlowSight history, then edit the
# queue's include/reviewed_category/reviewed_destination fields locally.
python tools/finetune/prepare_review.py finalize --db 'C:\path\to\flowsight.sqlite' --queue 'C:\private\review_queue.jsonl' --out 'C:\private\reviewed_labels.jsonl'
```

The `train`/`validation`/`test` labels are a deterministic **planning split**
that keeps the same app/site group together. A real evaluation must additionally
hold out entire days, sessions and (for a public model) users, and check balance
across categories. A handful of reviewed records is not sufficient to train.

## Gate before a future multimodal fine-tune

1. Add a separate, explicit, revocable opt-in for *short-lived local image
   examples*; do not repurpose monitoring consent. Exclude private apps before
   capture, verify the captured HWND, redact account/person/document/message
   information, and show each image to the user before retaining it. Never use
   a screen-coordinate crop that can include an overlapping window.
2. Attach a human-reviewed category and, only when genuinely visible, a public
   app/site destination. Record provenance and a content hash; discard unclear
   screens. Keep personal images local and outside Git, cloud sync, telemetry,
   support bundles and crash logs. Provide per-example deletion.
3. Freeze a blind benchmark **before** training. Compare the old and candidate
   models on categories, destinations, refusals/empty answers, privacy leakage,
   report factuality, CPU latency, RAM, and Windows/macOS/Linux startup.
4. Train a small adapter only from reviewed data; never use uncorrected
   predictions as labels. Merge the adapter into the original HF checkpoint,
   then re-quantize and revalidate both model and projector as needed. A LoRA
   does not magically modify today's GGUF.
5. Keep a rollback path and ship the candidate only if the blind test improves
   the important error classes without regressing privacy or reliability.

The queue is useful now for making future evaluations possible. It is **not** a
multimodal training set, and no automatic fine-tuning occurs in the app.
