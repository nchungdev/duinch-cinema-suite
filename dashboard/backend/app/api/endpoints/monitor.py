import psycopg2
from psycopg2.extras import DictCursor
import sqlite3
import json
import subprocess
import os
from fastapi import APIRouter, Query, Request, Body
from app.core import config
from app.services.response_wrapper import wrap_response

router = APIRouter()

def get_db_conn():
    try:
        # Fallback to SQLite if DATABASE_URL doesn't start with postgres
        if not config.DATABASE_URL or "postgresql" not in config.DATABASE_URL:
            db_path = os.path.join(config.DATA_ROOT, "user", "fshare_crawler.db")
            if not os.path.exists(db_path):
                return None
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            return conn
        return psycopg2.connect(config.DATABASE_URL)
    except Exception:
        return None

@router.get("/status")
async def get_pipeline_status():
    conn = get_db_conn()
    status_list = []
    raw_cnt = 0
    cooked_cnt = 0
    
    if conn:
        try:
            cursor_factory = {"cursor_factory": DictCursor} if not isinstance(conn, sqlite3.Connection) else {}
            
            with conn:
                cursor = conn.cursor(**cursor_factory)
                try:
                    cursor.execute("SELECT * FROM pipeline_status")
                    status_list = [dict(r) for r in cursor.fetchall()]
                except Exception: pass
                
                try:
                    cursor.execute("SELECT COUNT(*) FROM raw_threads")
                    raw_cnt = cursor.fetchone()[0]
                except Exception: pass
                
                try:
                    cursor.execute("SELECT COUNT(*) FROM fshare_links")
                    cooked_cnt = cursor.fetchone()[0]
                except Exception: pass
        except Exception: pass
        finally: conn.close()
            
    return wrap_response({
        "data": status_list, 
        "stats": {"total_raw": raw_cnt, "total_cooked": cooked_cnt}
    })

@router.get("/recent-raw")
async def get_recent_raw(page: int = 1, page_size: int = 20):
    conn = get_db_conn()
    if not conn: return wrap_response([])
    try:
        offset = (page - 1) * page_size
        cursor_factory = {"cursor_factory": DictCursor} if not isinstance(conn, sqlite3.Connection) else {}
        with conn:
            cursor = conn.cursor(**cursor_factory)
            if isinstance(conn, sqlite3.Connection):
                cursor.execute(f"SELECT * FROM raw_threads ORDER BY scraped_at DESC LIMIT ? OFFSET ?", (page_size, offset))
            else:
                cursor.execute(f"SELECT * FROM raw_threads ORDER BY scraped_at DESC LIMIT %s OFFSET %s", (page_size, offset))
            return wrap_response([dict(r) for r in cursor.fetchall()])
    except Exception: return wrap_response([])
    finally: conn.close()

@router.get("/recent-cooked")
async def get_recent_cooked(page: int = 1, page_size: int = 20, method: str = None, approved: int = None, sort: str = "newest"):
    conn = get_db_conn()
    if not conn: return wrap_response([])
    try:
        offset = (page - 1) * page_size
        where_clauses = []
        params = []
        
        if method:
            where_clauses.append("cook_method = ?")
            params.append(method)
        if approved is not None:
            where_clauses.append("approved = ?")
            params.append(approved)
            
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        order_sql = "ORDER BY max_scraped_at DESC"
        if sort == "oldest": order_sql = "ORDER BY max_scraped_at ASC"
        elif sort == "title": order_sql = "ORDER BY title ASC"

        query = f"""
            SELECT 
                tmdb_id,
                GROUP_CONCAT(url, '|') as urls,
                GROUP_CONCAT(title, '|') as titles,
                metadata,
                approved,
                cook_method,
                MAX(scraped_at) as max_scraped_at
            FROM fshare_links
            {where_sql}
            GROUP BY COALESCE(tmdb_id, url)
            {order_sql}
            LIMIT ? OFFSET ?
        """
        
        cursor_factory = {"cursor_factory": DictCursor} if not isinstance(conn, sqlite3.Connection) else {}
        with conn:
            cursor = conn.cursor(**cursor_factory)
            cursor.execute(query, params + [page_size, offset])
            results = []
            for r in cursor.fetchall():
                item = dict(r)
                item['urls'] = item['urls'].split('|')
                item['title'] = item['titles'].split('|')[0]
                item['scraped_at'] = item['max_scraped_at']
                results.append(item)
            return wrap_response(results)
    except Exception as e: 
        return wrap_response(error_code=500, error_message=str(e))
    finally: conn.close()

@router.get("/cooked-urls")
async def get_all_cooked_urls():
    conn = get_db_conn()
    if not conn: return wrap_response([])
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT url FROM fshare_links")
            return wrap_response([r[0] for r in cursor.fetchall()])
    except Exception: return wrap_response([])
    finally: conn.close()
            
@router.post("/trigger/{task}")
async def trigger_task(task: str, pages: int = 1, limit: int = 100):
    script = "start_miner.sh" if task == "miner" else "start_cooker.sh"
    project_root = os.path.dirname(config.DATA_ROOT) 
    
    script_path = os.path.join(project_root, script)
    
    # Setup logging
    log_dir = os.path.join(config.DATA_ROOT, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, f"{task}.log")
    
    try:
        with open(log_file, "w") as f:
            subprocess.Popen(["bash", script_path, str(pages if task == "miner" else limit)], 
                             cwd=project_root, stdout=f, stderr=f)
        return wrap_response({"status": "success", "task": task})
    except Exception as e:
        return wrap_response(status="failed", error_code=500, error_message=str(e))

@router.get("/logs/{task}")
async def get_task_logs(task: str):
    log_file = os.path.join(config.DATA_ROOT, "logs", f"{task}.log")
    
    if not os.path.exists(log_file):
        return wrap_response({"logs": "Searching for signal... (Log file not found)"})
    
    try:
        with open(log_file, "r") as f:
            lines = f.readlines()
            return wrap_response({"logs": "".join(lines[-50:])})
    except Exception as e:
        return wrap_response(error_code=500, error_message=str(e))

@router.post("/log")
async def save_frontend_log(data: dict = Body(...)):
    log_dir = os.path.join(config.DATA_ROOT, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "frontend_error.log")
    
    try:
        import time
        with open(log_file, "a") as f:
            log_entry = {
                "timestamp": int(time.time()),
                "data": data
            }
            f.write(json.dumps(log_entry) + "\n")
        return wrap_response({"status": "logged"})
    except Exception as e:
        return wrap_response(error_code=500, error_message=str(e))

@router.post("/approve")
async def approve_link(url: str, tmdb_id: str = None, media_type: str = None):
    conn = get_db_conn()
    if not conn: return wrap_response(error_code=500, error_message="DB connection failed")
    try:
        cursor = conn.cursor()
        if tmdb_id and media_type:
            cursor.execute("SELECT metadata FROM fshare_links WHERE url = ?", (url,))
            row = cursor.fetchone()
            if row:
                try:
                    meta = json.loads(row[0])
                    meta['tmdb_id'] = tmdb_id
                    meta['media_type'] = media_type
                    cursor.execute("UPDATE fshare_links SET tmdb_id = ?, metadata = ? WHERE url = ?", (tmdb_id, json.dumps(meta), url))
                except: pass
        
        cursor.execute("UPDATE fshare_links SET approved = 1 WHERE url = ?", (url,))
        conn.commit()
        return wrap_response({"status": "success"})
    except Exception as e: return wrap_response(error_code=500, error_message=str(e))
    finally: conn.close()

@router.get("/preview-tmdb")
async def preview_tmdb(tmdb_id: str, media_type: str):
    import httpx
    # Fallback to API Key if token is missing or truncated
    api_key = os.getenv("TMDB_KEY", "1c821e175c07645a12d003cc8d42d454")
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?api_key={api_key}&language=vi-VN"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                return wrap_response({
                    "status": "success",
                    "title": data.get("title") or data.get("name"),
                    "poster_path": data.get("poster_path"),
                    "release_date": data.get("release_date") or data.get("first_air_date")
                })
            return wrap_response(error_code=resp.status_code, error_message=f"TMDB Error: {resp.status_code}")
        except Exception as e: return wrap_response(error_code=500, error_message=str(e))

@router.get("/search-tmdb")
async def search_tmdb(q: str, y: str = None):
    import httpx
    api_key = os.getenv("TMDB_KEY", "1c821e175c07645a12d003cc8d42d454")
    
    results = []
    async with httpx.AsyncClient() as client:
        try:
            year_query = f"&primary_release_year={y}" if y and y.isdigit() else ""
            tv_year_query = f"&first_air_date_year={y}" if y and y.isdigit() else ""
            
            # Search Movie
            m_resp = await client.get(f"https://api.themoviedb.org/3/search/movie?api_key={api_key}&query={q}&language=vi{year_query}")
            if m_resp.status_code == 200:
                for r in m_resp.json().get("results", [])[:5]:
                    results.append({
                        "id": r["id"], "type": "movie", "title": r["title"], 
                        "poster": r.get("poster_path"), "date": r.get("release_date")
                    })
            
            # Search TV
            t_resp = await client.get(f"https://api.themoviedb.org/3/search/tv?api_key={api_key}&query={q}&language=vi{tv_year_query}")
            if t_resp.status_code == 200:
                for r in t_resp.json().get("results", [])[:5]:
                    results.append({
                        "id": r["id"], "type": "tv", "title": r["name"], 
                        "poster": r.get("poster_path"), "date": r.get("first_air_date")
                    })
            
            return wrap_response({"results": results})
        except Exception as e: return wrap_response(error_code=500, error_message=str(e))

@router.post("/manual-cook")
async def manual_cook(title: str, url: str, tmdb_id: str = None, media_type: str = None, season: str = None, episode: str = None):
    conn = get_db_conn()
    if not conn: return wrap_response(error_code=500, error_message="DB connection failed")
    try:
        cursor = conn.cursor()
        if tmdb_id and media_type:
            info_res = await preview_tmdb(tmdb_id, media_type)
            if info_res["error_code"] == 0:
                info = info_res["data"]
                meta = {
                    "tmdb_id": tmdb_id, "media_type": media_type, "title": info["title"],
                    "poster_path": info["poster_path"], "release_date": info["release_date"],
                    "season": season or "01", "episode": episode or "01"
                }
                cursor.execute("""
                    INSERT OR IGNORE INTO fshare_links 
                    (url, title, tmdb_id, metadata, approved, cook_method) 
                    VALUES (?,?,?,?,?,?)
                """, (url, info["title"], tmdb_id, json.dumps(meta), 0, 'manual'))
                conn.commit()
                return wrap_response({"status": "success", "mode": "manual"})
            else:
                return wrap_response(error_code=info_res["error_code"], error_message=info_res["error_message"])
        
        return wrap_response(error_code=400, error_message="Metadata required for manual promotion")
            
    except Exception as e: return wrap_response(error_code=500, error_message=str(e))
    finally: conn.close()

@router.post("/approve-bulk")
async def approve_links(urls: list[str]):
    conn = get_db_conn()
    if not conn: return wrap_response(error_code=500, error_message="DB connection failed")
    try:
        placeholder = "?" if isinstance(conn, sqlite3.Connection) else "%s"
        with conn:
            cursor = conn.cursor()
            for url in urls:
                cursor.execute(f"UPDATE fshare_links SET approved = 1 WHERE url = {placeholder}", (url,))
        return wrap_response({"status": "success"})
    except Exception as e: return wrap_response(error_code=500, error_message=str(e))
    finally: conn.close()

@router.get("/schedule")
async def get_schedule():
    conn = get_db_conn()
    if not conn: return wrap_response([])
    try:
        cursor_factory = {"cursor_factory": DictCursor} if not isinstance(conn, sqlite3.Connection) else {}
        with conn:
            cursor = conn.cursor(**cursor_factory)
            cursor.execute("SELECT * FROM pipeline_schedule")
            return wrap_response([dict(r) for r in cursor.fetchall()])
    except Exception: return wrap_response([])
    finally: conn.close()

@router.post("/schedule/{task_name}")
async def update_schedule(task_name: str, enabled: bool, hour: int, minute: int):
    conn = get_db_conn()
    if not conn: return wrap_response(error_code=500, error_message="DB connection failed")
    try:
        with conn:
            cursor = conn.cursor()
            if isinstance(conn, sqlite3.Connection):
                cursor.execute("""
                    INSERT INTO pipeline_schedule (task_name, enabled, hour, minute)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(task_name) DO UPDATE SET 
                        enabled = excluded.enabled, hour = excluded.hour, minute = excluded.minute
                """, (task_name, 1 if enabled else 0, hour, minute))
            else:
                cursor.execute("""
                    INSERT INTO pipeline_schedule (task_name, enabled, hour, minute)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT(task_name) DO UPDATE SET 
                        enabled = EXCLUDED.enabled, hour = EXCLUDED.hour, minute = EXCLUDED.minute
                """, (task_name, enabled, hour, minute))
        return wrap_response({"status": "success", "note": "Schedule updated in DB"})
    except Exception as e:
        return wrap_response(error_code=500, error_message=str(e))
    finally: conn.close()
