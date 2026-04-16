from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, FileResponse
import time
import os
import asyncio
from app.services import cache_manager

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
    try:
        results["cache"] = {
            "name": "System Cache",
            "status": "up",
            "details": {
                "tmdb": len(cache_manager._cache.get("tmdb_cache.json", {})),
                "kkphim": len(cache_manager._cache.get("kkphim_cache.json", {}))
            }
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
