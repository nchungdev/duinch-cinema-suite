from fastapi import APIRouter, Request, HTTPException
from typing import Optional, List
import asyncio
import json
import os
from app.core import config
from app.services import media_service, cache_manager
# Assuming scrapers moved to app/services/scrapers (per mkdir command)
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare

router = APIRouter()

def find_existing_path(title: str, media_type: str):
    if not title or not title.strip(): return None
    base = os.path.join(config.STORAGE_PATH, "Movies" if media_type == "movie" else "TV Shows")
    if not os.path.exists(base): return None
    title_clean = title.lower().strip()
    for root, dirs, files in os.walk(base):
        for d in dirs:
            if title_clean == d.lower().strip() or f"({title_clean})" in d.lower(): 
                return os.path.join(root, d)
        for f in files:
            if title_clean in f.lower(): return root
    return None

def check_local_storage_sync(title: str, media_type: str):
    path = find_existing_path(title, media_type)
    return {"exists": True, "path": path} if path else {"exists": False}

@router.get("/search/{query}")
async def fast_search(request: Request, query: str, media_type: str = "all"):
    client = request.app.state.http_client
    tmdb_task = media_service.fetch_tmdb_metadata(client, query, media_type)
    kk_task = media_service.fetch_kkphim_search(client, query, media_type)
    
    meta_results, kk_results = await asyncio.gather(tmdb_task, kk_task)
    kk_map = {item["title"].lower().strip(): item["slug"] for item in kk_results}
    
    combined = []
    seen = set()
    for item in meta_results:
        clean_title = item["title"].lower().strip()
        if clean_title in kk_map: item["slug"] = kk_map[clean_title]
        combined.append(item)
        seen.add(clean_title)
        
    for item in kk_results:
        clean_title = item["title"].lower().strip()
        if clean_title not in seen:
            combined.append(item)
            seen.add(clean_title)

    if not combined: return {"error": "No results found"}
    return {"results": combined, "type": "list"}

@router.get("/metadata/{slug}")
async def get_movie_metadata(slug: str):
    try:
        # Note: In a fully modular world, kkphim_lookup logic should be a service function
        # But for now keeping the subprocess call to reuse existing script logic
        proc = await asyncio.create_subprocess_exec(
            "python3", "app/services/scrapers/kkphim_lookup.py", slug,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        metadata = json.loads(stdout.decode())
        if "error" in metadata: return {"error": metadata["error"]}

        title = metadata["title"]
        local_res = await asyncio.to_thread(check_local_storage_sync, title, metadata.get("type", "movie"))
        
        return {
            "metadata": metadata,
            "links": {
                "streaming": metadata.get("links", []),
                "fshare": [],
                "web": []
            },
            "local": local_res,
            "type": "detail"
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/lookup/fshare-discovery/{slug}")
async def fshare_discovery(slug: str, title: str):
    try:
        t_cine = lookup_thuviencine(title)
        t_google = lookup_google_fshare(title)
        results = await asyncio.gather(t_cine, t_google)
        combined_fshare = results[0] + results[1]
        return {"fshare": combined_fshare, "success": True}
    except Exception as e:
        return {"error": str(e), "success": False}
