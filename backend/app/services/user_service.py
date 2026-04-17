import sqlite3
import json
import time
import os
from typing import Dict, Any, Optional
from app.core import config

_db_path = os.path.join(config.USER_DIR, "user_data.db")

def _get_conn():
    os.makedirs(os.path.dirname(_db_path), exist_ok=True)
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize SQLite tables for user data."""
    with _get_conn() as conn:
        # Table for key-value stores (settings, global states)
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
        # Table for itemized data (progress, history)
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

# Initialize on import
init_db()

def get_user_data(device_id: str, category: str) -> Dict[str, Any]:
    """Retrieve all items for a category (e.g., all progress for a user)."""
    with _get_conn() as conn:
        if category == "settings":
            cursor = conn.execute("SELECT key, value FROM kv_store WHERE device_id = ? AND category = ?", (device_id, category))
            return {row["key"]: json.loads(row["value"]) for row in cursor}
        else:
            cursor = conn.execute("SELECT item_id, data FROM item_store WHERE device_id = ? AND category = ?", (device_id, category))
            return {row["item_id"]: json.loads(row["data"]) for row in cursor}

def save_user_item(device_id: str, category: str, item_id: str, data: Any):
    """Save a specific item (e.g. one movie's progress)."""
    now = int(time.time())
    data_json = json.dumps(data, ensure_ascii=False)
    
    with _get_conn() as conn:
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

def sync_user_data(device_id: str, category: str, client_data: Dict[str, Any]) -> Dict[str, Any]:
    """Merge client data into SQLite using timestamps."""
    # 1. Get current server data
    server_data = get_user_data(device_id, category)
    
    # 2. Merge logic
    for item_id, c_val in client_data.items():
        s_val = server_data.get(item_id)
        # If client is newer, save to DB
        if not s_val or (isinstance(c_val, dict) and c_val.get("updated_at", 0) > s_val.get("updated_at", 0)):
            save_user_item(device_id, category, item_id, c_val)
            
    # 3. Return final merged state from DB
    return get_user_data(device_id, category)
