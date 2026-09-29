"""Local, opt-in review queue for future FlowSight model evaluation/fine-tuning.

This deliberately does NOT export screenshots, window titles, URLs, report
descriptions, or model predictions as ground truth. A future multimodal trainer
must require a separate, explicit consent and a human-reviewed image set.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCHEMA = "flowsight-review-v1"
CATEGORIES = (
    "Analysis", "Writing", "Design", "Planning", "Meeting", "Communication",
    "Documentation", "Learning", "Sales", "Admin", "Coding", "Debugging",
    "CodeReview", "Testing", "DevOps", "Database", "Research", "Browsing",
    "Idle", "General",
)
DEFAULT_EXCLUSIONS = (
    "1Password", "Bitwarden", "KeePass", "KeePassXC", "CredentialUIBroker",
)


def normalized_app(value: str | None) -> str:
    name = (value or "").strip().casefold()
    return name.removesuffix(".exe").strip()


def open_read_only(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise ValueError(f"Database does not exist: {path}")
    conn = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def exclusions_from_db(conn: sqlite3.Connection) -> set[str]:
    try:
        row = conn.execute("SELECT value FROM config WHERE key = 'privacy_settings'").fetchone()
    except sqlite3.DatabaseError as error:
        raise ValueError("Privacy settings could not be read; refusing export") from error
    if row is None:
        values = DEFAULT_EXCLUSIONS
    else:
        try:
            parsed = json.loads(row[0])
            values = parsed.get("excludedApplications", DEFAULT_EXCLUSIONS)
            if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
                raise ValueError("invalid excludedApplications")
        except (TypeError, json.JSONDecodeError, ValueError) as error:
            raise ValueError("Privacy settings are invalid; refusing export") from error
    # Always retain credential-manager exclusions, even if the app preference
    # was cleared. This tool is more conservative than normal report viewing.
    return {normalized_app(v) for v in (*DEFAULT_EXCLUSIONS, *values)}


def eligible(app: str | None, exclusions: set[str]) -> bool:
    return bool(normalized_app(app)) and normalized_app(app) not in exclusions


def atomic_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise ValueError(f"Refusing to overwrite existing review data: {path}")
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            for row in rows:
                output.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def make_queue(db: Path, days: int, limit: int) -> list[dict]:
    if not 1 <= days <= 3650 or not 1 <= limit <= 10000:
        raise ValueError("days must be 1–3650 and limit 1–10000")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    with closing(open_read_only(db)) as conn:
        exclusions = exclusions_from_db(conn)
        rows = conn.execute(
            "SELECT id, created_at, active_app, activity_type, capture_source "
            "FROM reports WHERE created_at >= ? ORDER BY created_at, id",
            (cutoff,),
        ).fetchall()
    candidates = [row for row in rows if eligible(row["active_app"], exclusions)]
    # Deterministic time-spread sampling, rather than only the newest N rows.
    stride = max(1, (len(candidates) + limit - 1) // limit)
    return [
        {
            "schema": SCHEMA,
            "report_id": row["id"],
            "created_at": row["created_at"],
            "active_app": row["active_app"],
            "capture_source": row["capture_source"],
            "model_prediction": row["activity_type"],
            "include": False,
            "reviewed_category": None,
            "reviewed_destination": None,
        }
        for row in candidates[::stride][:limit]
    ]


def safe_destination(value: object) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError("reviewed_destination must be text")
    result = value.strip()
    if not result or len(result) > 60 or any(mark in result for mark in ("/", "\\", "@", ":", "?", "#")):
        raise ValueError("reviewed_destination must be a short public app/site name, not a URL, path or account")
    return result


def split_for(app: str, destination: str | None) -> str:
    # The same public site belongs to one split even when viewed in different
    # browsers. Native apps without a destination are grouped by executable.
    # A later trainer must also hold out whole days/users; this is not a score.
    key = f"site|{destination.casefold()}" if destination else f"app|{normalized_app(app)}"
    bucket = int.from_bytes(hashlib.sha256(key.encode()).digest()[:4], "big") % 100
    return "train" if bucket < 70 else "validation" if bucket < 85 else "test"


def finalize(db: Path, queue: list[dict]) -> list[dict]:
    with closing(open_read_only(db)) as conn:
        exclusions = exclusions_from_db(conn)
        result = []
        seen = set()
        for item in queue:
            if item.get("schema") != SCHEMA or not isinstance(item.get("report_id"), int):
                raise ValueError("Invalid review queue schema or report ID")
            report_id = item["report_id"]
            if report_id in seen:
                raise ValueError(f"Duplicate report ID: {report_id}")
            seen.add(report_id)
            if item.get("include") is not True:
                continue
            row = conn.execute(
                "SELECT created_at, active_app, activity_type FROM reports WHERE id = ?", (report_id,)
            ).fetchone()
            if row is None or not eligible(row["active_app"], exclusions):
                continue  # Deleted/retained data or newly excluded app.
            category = item.get("reviewed_category")
            if category not in CATEGORIES:
                raise ValueError(f"Report {report_id} needs a human-reviewed category")
            destination = safe_destination(item.get("reviewed_destination"))
            app = row["active_app"]
            result.append({
                "schema": SCHEMA,
                "source_report_id": report_id,
                "created_at": row["created_at"],
                "active_app": app,
                "model_prediction": row["activity_type"],
                "reviewed_category": category,
                "reviewed_destination": destination,
                "split": split_for(app, destination),
                "human_reviewed": True,
            })
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    queue_parser = sub.add_parser("queue", help="create an opt-in, metadata-only review queue")
    queue_parser.add_argument("--db", type=Path, required=True)
    queue_parser.add_argument("--out", type=Path, required=True)
    queue_parser.add_argument("--days", type=int, default=30)
    queue_parser.add_argument("--limit", type=int, default=500)
    label_parser = sub.add_parser("finalize", help="export only explicitly reviewed labels")
    label_parser.add_argument("--db", type=Path, required=True)
    label_parser.add_argument("--queue", type=Path, required=True)
    label_parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "queue":
        rows = make_queue(args.db, args.days, args.limit)
    else:
        rows = finalize(args.db, read_jsonl(args.queue))
    atomic_jsonl(args.out, rows)
    print(f"Wrote {len(rows)} local records to {args.out}. No data was uploaded.")
    if args.command == "queue":
        print("All records start with include=false; manually review before finalize.")
    else:
        counts = {split: sum(row["split"] == split for row in rows) for split in ("train", "validation", "test")}
        print(f"Reviewed split counts: {counts}. This is NOT a vision training set without consented images.")


if __name__ == "__main__":
    main()
