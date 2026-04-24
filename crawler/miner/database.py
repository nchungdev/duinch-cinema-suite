import sqlite3
import psycopg2
from psycopg2.extras import DictCursor
import json
import time
import os
from typing import List
from . import config

class MinerRepository:
    def __init__(self):
        self.is_sqlite = not config.DATABASE_URL or "postgresql" not in config.DATABASE_URL
        self._init_db()

    def _get_conn(self):
        if self.is_sqlite:
            # Fallback to shared SQLite DB in data/user/fshare_crawler.db
            db_path = os.path.abspath(os.path.join(config._project_root, "data/user/fshare_crawler.db"))
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            return conn
        return psycopg2.connect(config.DATABASE_URL)

    def _get_placeholder(self):
        return "?" if self.is_sqlite else "%s"

    def _get_cursor(self, conn):
        if self.is_sqlite:
            return conn.cursor()
        return conn.cursor(cursor_factory=DictCursor)

    def _init_db(self):
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                # Use standard SQL for table creation
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS raw_threads (
                        thread_url TEXT PRIMARY KEY,
                        title TEXT,
                        source TEXT,
                        node_url TEXT,
                        raw_links TEXT,
                        scraped_at BIGINT
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS pipeline_status (
                        task_name TEXT PRIMARY KEY,
                        status TEXT,
                        progress TEXT,
                        current_item TEXT,
                        success_count INTEGER,
                        error_count INTEGER,
                        last_error TEXT,
                        updated_at BIGINT
                    )
                """)
        except Exception as e:
            print(f"[Miner DB] Init error: {e}")

    def update_status(self, task_name, status, progress="", current_item="", success_inc=0, error_inc=0, last_error=None):
        now = int(time.time())
        p = self._get_placeholder()
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if self.is_sqlite:
                cursor.execute(f"""
                    INSERT INTO pipeline_status (task_name, status, progress, current_item, success_count, error_count, last_error, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(task_name) DO UPDATE SET 
                        status = excluded.status, progress = excluded.progress, current_item = excluded.current_item,
                        success_count = pipeline_status.success_count + excluded.success_count,
                        error_count = pipeline_status.error_count + excluded.error_count,
                        last_error = COALESCE(excluded.last_error, pipeline_status.last_error),
                        updated_at = excluded.updated_at
                """, (task_name, status, progress, current_item, success_inc, error_inc, last_error, now))
            else:
                cursor.execute(f"""
                    INSERT INTO pipeline_status (task_name, status, progress, current_item, success_count, error_count, last_error, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(task_name) DO UPDATE SET 
                        status = EXCLUDED.status, progress = EXCLUDED.progress, current_item = EXCLUDED.current_item,
                        success_count = pipeline_status.success_count + EXCLUDED.success_count,
                        error_count = pipeline_status.error_count + EXCLUDED.error_count,
                        last_error = COALESCE(EXCLUDED.last_error, pipeline_status.last_error),
                        updated_at = EXCLUDED.updated_at
                """, (task_name, status, progress, current_item, success_inc, error_inc, last_error, now))
            conn.commit()

    def reset_status(self, task_name):
        p = self._get_placeholder()
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE pipeline_status SET success_count=0, error_count=0, last_error=NULL, progress='0%' WHERE task_name={p}", (task_name,))
            conn.commit()

    def is_thread_fresh(self, thread_url, ttl):
        now = int(time.time())
        p = self._get_placeholder()
        with self._get_conn() as conn:
            cursor = self._get_cursor(conn)
            cursor.execute(f"SELECT scraped_at FROM raw_threads WHERE thread_url = {p}", (thread_url,))
            res = cursor.fetchone()
            return (now - res['scraped_at']) < ttl if res else False

    def save_raw_thread(self, thread_url, title, source, node_url, links):
        now = int(time.time())
        p = self._get_placeholder()
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if self.is_sqlite:
                cursor.execute(f"""
                    INSERT INTO raw_threads (thread_url, title, source, node_url, raw_links, scraped_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(thread_url) DO UPDATE SET 
                        title = excluded.title, raw_links = excluded.raw_links, scraped_at = excluded.scraped_at
                """, (thread_url, title, source, node_url, json.dumps(links), now))
            else:
                cursor.execute(f"""
                    INSERT INTO raw_threads (thread_url, title, source, node_url, raw_links, scraped_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT(thread_url) DO UPDATE SET 
                        title = EXCLUDED.title, raw_links = EXCLUDED.raw_links, scraped_at = EXCLUDED.scraped_at
                """, (thread_url, title, source, node_url, json.dumps(links), now))
            conn.commit()

db = MinerRepository()
