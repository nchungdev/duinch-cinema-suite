from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, FileResponse
import time
import os
import asyncio

router = APIRouter()

@router.get("", response_class=HTMLResponse)
async def monitor_ui():
    """Serve the standalone monitor UI."""
    static_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "monitor.html")
    return FileResponse(static_file)

@router.get("/health")
async def health_check(request: Request):
    client = request.app.state.http_client
    
    results = {}
    
    # 1. Check TMDB
    try:
        from app.core import config
        start = time.time()
        headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
        # Ping a small TMDB endpoint
        resp = await client.get("https://api.themoviedb.org/3/configuration", headers=headers, timeout=5)
        results["tmdb"] = {
            "name": "TMDB API",
            "status": "up" if resp.status_code == 200 else "down",
            "latency": f"{int((time.time() - start) * 1000)}ms",
            "code": resp.status_code
        }
    except Exception as e:
        results["tmdb"] = {"name": "TMDB API", "status": "error", "message": str(e)}

    # 2. Check Scrapers (Ping main URLs)
    scrapers = {
        "kkphim": ("KKPhim", "https://phimapi.com/index.php"),
        "ophim": ("OPhim", "https://ophim1.com/index.php")
    }
    
    for key, (name, url) in scrapers.items():
        try:
            start = time.time()
            resp = await client.get(url, timeout=5)
            results[key] = {
                "name": name,
                "status": "up" if resp.status_code < 500 else "down",
                "latency": f"{int((time.time() - start) * 1000)}ms",
                "code": resp.status_code
            }
        except Exception as e:
            results[key] = {"name": name, "status": "error", "message": str(e)}
            
    # 3. Cache Stats
    def _count_files(dir_path):
        if not os.path.exists(dir_path): return 0
        return len([f for f in os.listdir(dir_path) if os.path.isfile(os.path.join(dir_path, f))])

    def _get_dir_size(dir_path):
        """Calculate total size of a directory in MB."""
        if not os.path.exists(dir_path): return 0.0
        total = 0
        for root, _, files in os.walk(dir_path):
            for f in files:
                fp = os.path.join(root, f)
                if os.path.isfile(fp):
                    total += os.path.getsize(fp)
        return round(total / (1024 * 1024), 2)

    def _get_redis_stats():
        """Retrieve Redis memory usage and key count."""
        try:
            from app.services.cache_manager import _get_redis
            r = _get_redis()
            if not r: return None
            info = r.info("memory")
            return {
                "status": "up",
                "used_memory": info.get("used_memory_human", "0B"),
                "peak_memory": info.get("used_memory_peak_human", "0B"),
                "keys": r.dbsize()
            }
        except:
            return {"status": "error"}

    try:
        results["cache"] = {
            "name": "System Cache",
            "status": "up",
            "file_system": {
                "tmdb": {"count": _count_files(config.TMDB_CACHE), "size": f"{_get_dir_size(config.TMDB_CACHE)} MB"},
                "kkphim": {"count": _count_files(config.KKPHIM_CACHE), "size": f"{_get_dir_size(config.KKPHIM_CACHE)} MB"},
                "images": {"count": _count_files(config.IMAGE_CACHE_DIR), "size": f"{_get_dir_size(config.IMAGE_CACHE_DIR)} MB"},
                "total_size": f"{_get_dir_size(config.CACHE_ROOT)} MB"
            },
            "redis": _get_redis_stats()
        }
    except:
        results["cache"] = {"name": "System Cache", "status": "error"}

    # 4. Recent Requests
    try:
        from app.main import recent_requests
        results["requests"] = list(recent_requests)
    except:
        results["requests"] = []

    return {
        "data": results,
        "error_code": 0,
        "error_msg": ""
    }
