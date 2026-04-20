import sqlite3
import json
import time
import os
from typing import Dict, Any, Optional
from app.core import config

_db_path = os.path.join(config.USER_DIR, "user_data.db")

class SQLiteUserRepo:
    def __init__(self):
        self.db_path = _db_path
        self._init_db()

    def _get_conn(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initialize SQLite tables for user data."""
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS kv_store (
                    device_id TEXT,
                    category TEXT,
                    key TEXT,
                    value TEXT,
                    updated_at INTEGER,
                    PRIMARY KEY (device_id, category, key)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS item_store (
                    device_id TEXT,
                    category TEXT,
                    item_id TEXT,
                    data TEXT,
                    updated_at INTEGER,
                    PRIMARY KEY (device_id, category, item_id)
                )
            """)
            conn.commit()

    def get_user_data(self, device_id: str, category: str) -> Dict[str, Any]:
        """Retrieve all items for a category."""
        with self._get_conn() as conn:
            if category == "settings":
                cursor = conn.execute("SELECT key, value FROM kv_store WHERE device_id = ? AND category = ?", (device_id, category))
                return {row["key"]: json.loads(row["value"]) for row in cursor}
            else:
                cursor = conn.execute("SELECT item_id, data FROM item_store WHERE device_id = ? AND category = ?", (device_id, category))
                return {row["item_id"]: json.loads(row["data"]) for row in cursor}

    def save_user_item(self, device_id: str, category: str, item_id: str, data: Any):
        """Save a specific item."""
        now = int(time.time())
        data_json = json.dumps(data, ensure_ascii=False)
        with self._get_conn() as conn:
            if category == "settings":
                conn.execute("""
                    INSERT INTO kv_store (device_id, category, key, value, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(device_id, category, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                """, (device_id, category, item_id, data_json, now))
            else:
                conn.execute("""
                    INSERT INTO item_store (device_id, category, item_id, data, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(device_id, category, item_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                """, (device_id, category, item_id, data_json, now))
            conn.commit()

# Singleton instance
user_repo = SQLiteUserRepo()
