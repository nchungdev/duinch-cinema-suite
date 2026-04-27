import sqlite3
import psycopg2
from psycopg2.extras import DictCursor
import json
import time
import os
from typing import List
from . import config

class CookerRepository:
    def __init__(self):
        self.is_sqlite = not config.DATABASE_URL or "postgresql" not in config.DATABASE_URL
        self._init_db()

    def _get_conn(self):
        if self.is_sqlite:
            # Fallback to shared SQLite DB
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
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS fshare_links (
                        url TEXT PRIMARY KEY,
                        tmdb_id TEXT,
                        media_type TEXT,
                        title TEXT,
                        quality TEXT,
                        is_folder BOOLEAN,
                        source TEXT,
                        source_page TEXT,
                        metadata TEXT,
                        scraped_at BIGINT,
                        approved INTEGER DEFAULT 0,
                        cook_method TEXT
                    )
                """)
                if not self.is_sqlite:
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fshare_links_tmdb_id ON fshare_links(tmdb_id)")
                else:
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fshare_links_tmdb_id ON fshare_links(tmdb_id)")
        except Exception as e:
            print(f"[Cooker DB] Init error: {e}")

    def update_status(self, task_name, status, progress="", current_item="", success_inc=0, error_inc=0, last_error=None):
        now = int(time.time())
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if self.is_sqlite:
                cursor.execute("""
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
                cursor.execute("""
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

    def get_pending_raw_threads(self, limit=100):
        p = self._get_placeholder()
        with self._get_conn() as conn:
            cursor = self._get_cursor(conn)
            cursor.execute(f"SELECT * FROM raw_threads ORDER BY scraped_at DESC LIMIT {p}", (limit,))
            return [dict(row) for row in cursor.fetchall()]

    def save_cooked_link(self, url, tmdb_id, media_type, title, quality, is_folder, source, source_page):
        now = int(time.time())
        metadata = json.dumps({"name": f"[{source}] {title}"}, ensure_ascii=False)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if self.is_sqlite:
                cursor.execute("""
                    INSERT INTO fshare_links (url, tmdb_id, media_type, title, quality, is_folder, source, source_page, metadata, scraped_at, cook_method)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(url) DO UPDATE SET 
                        tmdb_id = excluded.tmdb_id, media_type = excluded.media_type, title = excluded.title,
                        quality = excluded.quality, scraped_at = excluded.scraped_at, cook_method = excluded.cook_method
                """, (url, tmdb_id, media_type, title, quality, is_folder, source, source_page, metadata, now, 'auto'))
            else:
                cursor.execute("""
                    INSERT INTO fshare_links (url, tmdb_id, media_type, title, quality, is_folder, source, source_page, metadata, scraped_at, cook_method)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(url) DO UPDATE SET 
                        tmdb_id = EXCLUDED.tmdb_id, media_type = EXCLUDED.media_type, title = EXCLUDED.title,
                        quality = EXCLUDED.quality, scraped_at = EXCLUDED.scraped_at, cook_method = EXCLUDED.cook_method
                """, (url, tmdb_id, media_type, title, quality, is_folder, source, source_page, metadata, now, 'auto'))
            conn.commit()

db = CookerRepository()
