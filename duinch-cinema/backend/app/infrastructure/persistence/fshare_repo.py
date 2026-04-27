import psycopg2
from psycopg2.extras import DictCursor
import json
from typing import List
from app.core import config
from app.domain.models.media import DownloadableLink

def get_db_conn():
    conn = psycopg2.connect(config.DATABASE_URL)
    return conn

class FShareRepository:
    def get_links_by_tmdb_id(self, tmdb_id: str) -> List[DownloadableLink]:
        links = []
        try:
            with get_db_conn() as conn:
                with conn.cursor(cursor_factory=DictCursor) as cursor:
                    cursor.execute(
                        "SELECT * FROM fshare_links WHERE tmdb_id = %s ORDER BY is_folder DESC, scraped_at DESC",
                        (tmdb_id,)
                    )
                    for row in cursor.fetchall():
                        meta = json.loads(row["metadata"]) if row["metadata"] else {}
                        links.append(DownloadableLink(
                            name=meta.get("name", row["title"]),
                            url=row["url"],
                            size=meta.get("size", 0),
                            source=row["source"],
                            is_folder=bool(row["is_folder"]),
                            source_page=row["source_page"]
                        ))
        except psycopg2.Error: # Bỏ qua nếu bảng chưa tồn tại
            pass
        return links

fshare_repo = FShareRepository()
