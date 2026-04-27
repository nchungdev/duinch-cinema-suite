from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(), override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from contextlib import asynccontextmanager
import httpx
from app.api.endpoints import search, media, recommended, downloader, proxy, monitor, detail, user, stream
from collections import deque
import time

# Global storage for recent requests
recent_requests = deque(maxlen=20)

from apscheduler.schedulers.background import BackgroundScheduler
import sqlite3
import os
import subprocess
import psycopg2
from psycopg2.extras import DictCursor
from app.core import config

# --- Pipeline Scheduler ---
scheduler = BackgroundScheduler()

def run_worker_task(script_name, args):
    """Run miner/cooker script from scheduler."""
    script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), script_name)
    print(f"[SCHEDULER] 🚀 Auto-starting task: {script_name} with args {args}")
    subprocess.Popen(["bash", script_path] + args, start_new_session=True)

async def reload_pipeline_scheduler():
    """Reload all jobs from database."""
    scheduler.remove_all_jobs()
    try:
        conn = psycopg2.connect(config.DATABASE_URL)
        with conn:
            with conn.cursor(cursor_factory=DictCursor) as cursor:
                cursor.execute("SELECT * FROM pipeline_schedule WHERE enabled = TRUE")
                for row in cursor.fetchall():
                    task = row['task_name']
                    script = "start_miner.sh" if task == "miner" else "start_cooker.sh"
                    args = ["1"] if task == "miner" else ["100"] # Defaults
                    
                    scheduler.add_job(
                        run_worker_task, 
                        'cron', 
                        hour=row['hour'], 
                        minute=row['minute'], 
                        args=[script, args],
                        id=f"job_{task}",
                        replace_existing=True
                    )
                    print(f"[SCHEDULER] Scheduled {task} at {row['hour']:02d}:{row['minute']:02d}")
        conn.close()
    except Exception as e:
        print(f"[SCHEDULER] Error loading schedule: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=10)
    # Start Scheduler
    await reload_pipeline_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown()
    await app.state.http_client.aclose()

app = FastAPI(
    title="Duinch Cinema API",
    description="Business-Logic focused API Architecture",
    version="4.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

@app.middleware("http")
async def log_requests(request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    
    # Don't log internal monitor/health pings to keep clean
    if "/api/monitor/health" not in request.url.path:
        recent_requests.append({
            "path": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "duration": f"{int(duration * 1000)}ms",
            "timestamp": time.strftime("%H:%M:%S")
        })
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
@app.get("/monitor", response_class=HTMLResponse)
async def get_monitor_gui():
    static_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "monitor.html")
    if os.path.exists(static_file):
        with open(static_file, "r") as f:
            return f.read()
    return "Monitor GUI file not found"

app.include_router(detail.router, prefix="/api", tags=["Detail"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(media.router, prefix="/api/media", tags=["Media"])
app.include_router(recommended.router, prefix="/api", tags=["Recommended"])
app.include_router(downloader.router, prefix="/api/downloader", tags=["Downloader"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["Proxy"])
app.include_router(monitor.router, prefix="/api/monitor", tags=["Monitor"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(stream.router, prefix="/api/stream", tags=["Streaming"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8086, reload=True)
