import asyncio
import re
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.fshare_lookup import resolve_fshare_url, lookup_timfshare
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.phimapi_base import tmdb_get_info

router = APIRouter()

# CLEAN PIPELINE: Focus on centralized high-quality indexes
DISCOVERY_SOURCES = [
    {"source_type": "m3u8",        "source": "kkphim"},
    {"source_type": "m3u8",        "source": "ophim"},
    {"source_type": "fshare",      "source": "timfshare"},
    {"source_type": "torrent",     "source": "default"},
    {"source_type": "gdrive",      "source": "googlesearch"}
]

async def _run_scraper_task(client, tmdb_id, media_type, title, localize_title, year, season, episode, source_type, source, force, tmdb_info: Dict[str, Any] = {}):
    clean_title    = re.sub(r'\(.*?\)', '', title).strip()
    clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None

    results = []

    try:
        if source_type == "m3u8":
            target_ep = None if media_type == "tv" else episode
            if source == "kkphim": results = await lookup_kkphim(client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year, force=force)
            elif source == "ophim": results = await lookup_ophim(client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year, force=force)

        elif source_type == "torrent":
            results = await lookup_torrent(clean_title, tmdb_id, media_type, None, None, year, tmdb_info=tmdb_info)

        elif source_type == "fshare":
            if source == "timfshare":
                # Primary FShare Index
                results = await lookup_timfshare(clean_title, year=year, filter_title=clean_title, localize_title=clean_localize, media_type=media_type, tmdb_info=tmdb_info)

        elif source_type == "gdrive":
            results = await lookup_gdrive(clean_title)

        raw_count = len(results) if results else 0
        status_icon = "🟢" if raw_count > 0 else "⚪"
        print(f"[Discovery] {status_icon} {source_type.upper():<7} | {source:<12} | Found: {raw_count:<3}")

        if results is None: results = []
        
        if source_type == "m3u8":
            internal_groups = {}
            for r in results:
                m_name = r.get("movie_name") or "Movie"
                srv = r.get("server") or "Server"
                m3u8 = r.get("m3u8") or ""
                domain_match = re.search(r'https?://([^/]+)', m3u8)
                domain = domain_match.group(1) if domain_match else "unknown"
                group_key = f"{source}:{m_name}:{srv}:{domain}"
                if group_key not in internal_groups: internal_groups[group_key] = []
                internal_groups[group_key].append({
                    "type": "streamable", "provider": source.upper(), "server": srv,
                    "name": r.get("name"), "m3u8": r.get("m3u8"), "embed": r.get("embed"),
                    "season": r.get("season", 1)
                })
            final_results = [{"server": f"[{eps[0]['provider']}] {eps[0]['server']}", "episodes": eps} for eps in internal_groups.values()]
        else:
            final_results = results

        return {"source_type": source_type, "source": source, "results": final_results, "error": None}
    except Exception as e:
        print(f"[Discovery] 🔴 ERROR in {source_type}/{source}: {e}")
        return {"source_type": source_type, "source": source, "results": [], "error": str(e)}

@router.get("/stream")
async def discovery_stream(
    request: Request,
    tmdb_id: int = Query(None),
    media_type: str = Query("movie"),
    title: str = Query(...),
    localize_title: str = Query(None),
    year: str = Query(None),
    season: int = Query(None),
    episode: int = Query(None),
    force: bool = Query(False),
):
    client = request.app.state.http_client
    tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {}
    print(f"\n[SSE] 🚀 Starting Discovery Stream for: {title} ({year}) | ID: {tmdb_id}")

    async def event_generator():
        tasks = [asyncio.create_task(_run_scraper_task(client, tmdb_id, media_type, title, localize_title, year, season, episode, src["source_type"], src["source"], force, tmdb_info)) for src in DISCOVERY_SOURCES]
        yield f"data: {json.dumps({'type': 'init', 'total_sources': len(tasks), 'sources': DISCOVERY_SOURCES})}\n\n"
        for completed_task in asyncio.as_completed(tasks):
            result = await completed_task
            yield f"data: {json.dumps({'type': 'result', 'data': result})}\n\n"
        print(f"[SSE] ✅ Discovery Stream Finished\n")
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/fetch")
async def discovery_fetch(
    request: Request,
    tmdb_id: int = Query(None),
    media_type: str = Query("movie"),
    title: str = Query(...),
    localize_title: str = Query(None),
    year: str = Query(None),
    season: int = Query(None),
    episode: int = Query(None),
    source_type: str = Query(...),
    source: str = Query(None),
    force: bool = Query(False),
):
    client = request.app.state.http_client
    tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {}
    result = await _run_scraper_task(client, tmdb_id, media_type, title, localize_title, year, season, episode, source_type, source, force, tmdb_info=tmdb_info)
    return {"data": result, "error_code": 0, "error_msg": ""}

@router.get("/expand-folder")
async def folder_expand(request: Request, url: str, provider: str = "fshare"):
    try:
        client = request.app.state.http_client
        if provider == "fshare":
            files = await resolve_fshare_url(url, client)
            return { "data": {"results": files}, "error_code": 0, "error_msg": "" }
        return { "data": None, "error_code": 400, "error_msg": "Not supported" }
    except Exception as e:
        return { "data": None, "error_code": 500, "error_msg": str(e) }
