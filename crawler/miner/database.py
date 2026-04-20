import psycopg2
from psycopg2.extras import DictCursor
import json
import time
from typing import List
from . import config

class MinerRepository:
    def __init__(self):
        self._init_db()

    def _get_conn(self):
        return psycopg2.connect(config.DATABASE_URL)

    def _init_db(self):
        try:
            with self._get_conn() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS raw_threads (
                            thread_url TEXT PRIMARY KEY,
                            title TEXT,
                            source TEXT,
                            node_url TEXT,
                            raw_links JSONB,
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
        except psycopg2.Error as e:
            print(f"[Miner DB] Init error: {e}")

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

    def is_thread_fresh(self, thread_url, ttl):
        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=DictCursor) as cursor:
                cursor.execute("SELECT scraped_at FROM raw_threads WHERE thread_url = %s", (thread_url,))
                res = cursor.fetchone()
                return (now - res['scraped_at']) < ttl if res else False

    def save_raw_thread(self, thread_url, title, source, node_url, links):
        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO raw_threads (thread_url, title, source, node_url, raw_links, scraped_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT(thread_url) DO UPDATE SET 
                        title = EXCLUDED.title, raw_links = EXCLUDED.raw_links, scraped_at = EXCLUDED.scraped_at
                """, (thread_url, title, source, node_url, json.dumps(links), now))

db = MinerRepository()
