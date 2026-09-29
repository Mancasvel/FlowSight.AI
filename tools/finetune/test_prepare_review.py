import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from prepare_review import finalize, make_queue, split_for


class ReviewQueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "flowsight.sqlite"
        with closing(sqlite3.connect(self.db)) as conn:
            conn.executescript(
                "CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);"
                "CREATE TABLE reports (id INTEGER PRIMARY KEY, created_at TEXT, "
                "active_app TEXT, activity_type TEXT, capture_source TEXT, "
                "description TEXT, window_title TEXT);"
            )
            conn.execute(
                "INSERT INTO config VALUES (?, ?)",
                ("privacy_settings", json.dumps({"excludedApplications": ["Messages"]})),
            )
            for app, category in [
                ("Code.exe", "Coding"), ("Messages.exe", "Communication"),
                ("Bitwarden.exe", "Admin"), (None, "General"),
            ]:
                conn.execute(
                    "INSERT INTO reports (created_at, active_app, activity_type, capture_source, description, window_title) "
                    "VALUES (datetime('now'), ?, ?, 'periodic', 'private secret text', 'private window title')",
                    (app, category),
                )
            conn.commit()

    def test_queue_excludes_private_apps_and_content(self):
        queue = make_queue(self.db, 30, 500)
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]["active_app"], "Code.exe")
        self.assertFalse(queue[0]["include"])
        self.assertNotIn("private secret text", json.dumps(queue))
        self.assertNotIn("private window title", json.dumps(queue))

    def test_only_human_reviewed_items_are_finalized(self):
        queue = make_queue(self.db, 30, 500)
        self.assertEqual(finalize(self.db, queue), [])
        queue[0].update(include=True, reviewed_category="Coding", reviewed_destination="Visual Studio Code")
        result = finalize(self.db, queue)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["reviewed_category"], "Coding")
        self.assertTrue(result[0]["human_reviewed"])
        self.assertNotIn("private secret text", json.dumps(result))

    def test_split_is_stable_and_grouped_by_app_and_site(self):
        self.assertEqual(split_for("Code.exe", "GitHub"), split_for("code", "github"))
        self.assertEqual(split_for("Chrome.exe", "GitHub"), split_for("Arc.exe", "github"))
        self.assertEqual(split_for("Code.exe", None), split_for("code", None))

    def test_invalid_destination_is_rejected(self):
        queue = make_queue(self.db, 30, 500)
        queue[0].update(include=True, reviewed_category="Coding", reviewed_destination="https://private.example/path")
        with self.assertRaises(ValueError):
            finalize(self.db, queue)


if __name__ == "__main__":
    unittest.main()
