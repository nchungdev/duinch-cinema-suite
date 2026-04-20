import psycopg2
from psycopg2.extras import DictCursor
import json
import time
from typing import List
from . import config

class CookerRepository:
    def __init__(self):
        self._init_db()

    def _get_conn(self):
        return psycopg2.connect(config.DATABASE_URL)

    def _init_db(self):
        try:
            with self._get_conn() as conn:
                with conn.cursor() as cursor:
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
                            metadata JSONB,
                            scraped_at BIGINT
                        )
                    """)
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fshare_links_tmdb_id ON fshare_links(tmdb_id)")
        except psycopg2.Error as e:
            print(f"[Cooker DB] Init error: {e}")

    def update_status(self, task_name, status, progress="", current_item="", success_inc=0, error_inc=0, last_error=None):
        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor() as cursor:
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

    def reset_status(self, task_name):
        with self._get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute("UPDATE pipeline_status SET success_count=0, error_count=0, last_error=NULL, progress='0%' WHERE task_name=%s", (task_name,))

    def get_pending_raw_threads(self, limit=100):
        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=DictCursor) as cursor:
                cursor.execute("SELECT * FROM raw_threads ORDER BY scraped_at DESC LIMIT %s", (limit,))
                return [dict(row) for row in cursor.fetchall()]

    def save_cooked_link(self, url, tmdb_id, media_type, title, quality, is_folder, source, source_page):
        now = int(time.time())
        metadata = json.dumps({"name": f"[{source}] {title}"}, ensure_ascii=False)
        with self._get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO fshare_links (url, tmdb_id, media_type, title, quality, is_folder, source, source_page, metadata, scraped_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(url) DO UPDATE SET 
                        tmdb_id = EXCLUDED.tmdb_id, media_type = EXCLUDED.media_type, title = EXCLUDED.title,
                        quality = EXCLUDED.quality, scraped_at = EXCLUDED.scraped_at
                """, (url, tmdb_id, media_type, title, quality, is_folder, source, source_page, metadata, now))

db = CookerRepository()
