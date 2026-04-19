import asyncio
import re
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.fshare_lookup import resolve_fshare_url, lookup_timfshare
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.phimapi_base import tmdb_get_info

router = APIRouter()

DISCOVERY_SOURCES = [
    {"source_type": "m3u8",        "source": "kkphim"},
    {"source_type": "m3u8",        "source": "ophim"},
    {"source_type": "fshare",      "source": "timfshare"},
    {"source_type": "fshare",      "source": "thuviencine"},
    {"source_type": "fshare",      "source": "web"},
    {"source_type": "torrent",     "source": "default"},
    {"source_type": "gdrive",      "source": "googlesearch"}
]

async def _run_scraper_task(client, tmdb_id, media_type, title, localize_title, year, season, episode, source_type, source, force, tmdb_info: Dict[str, Any] = {}):
    """Core logic to run a single scraper and normalize its results."""
    clean_title    = re.sub(r'\(.*?\)', '', title).strip()
    clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None

    # [STRATEGY] Build queries based on source power
    def _build_refined_query(base: str) -> str:
        parts = [base]
        if media_type == "movie" and year: parts.append(str(year))
        if season and episode: parts.append(f"S{season:02d}E{episode:02d}")
        elif season: parts.append(f"Season {season}")
        elif media_type == "tv" and year: parts.append(str(year))
        return " ".join(parts)

    primary_refined = _build_refined_query(clean_title)
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
                results = await lookup_timfshare(primary_refined, year=year, filter_title=clean_title, media_type=media_type, tmdb_info=tmdb_info)
            elif source == "thuviencine":
                results = await lookup_thuviencine(primary_refined)
            elif source == "web":
                results = await lookup_google_fshare(clean_title, year, None, None)

        elif source_type == "gdrive":
            results = await lookup_gdrive(primary_refined)

        raw_count = len(results) if results else 0
        status_icon = "🟢" if raw_count > 0 else "⚪"
        print(f"[Discovery] {status_icon} {source_type.upper():<7} | {source:<12} | Found: {raw_count:<3} | Provider Query: '{clean_title if source_type == 'm3u8' else primary_refined}'")

        if results is None: results = []
        seen_urls = set()
        deduped = []
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed") or r.get("magnet")
            if url and url not in seen_urls:
                if source_type == "m3u8": r["type"] = "streamable"
                else: r.setdefault("type", "downloadable")
                r["provider"] = (r.get("source") or source or "UNKNOWN").upper()
                deduped.append(r)
                seen_urls.add(url)

        if source_type == "m3u8":
            # Group by server and keep them distinct
            server_map = {}
            for r in deduped:
                # Add Provider prefix to server name to keep them separate on UI
                provider_prefix = (r.get("provider") or source).upper()
                srv = r.get("server") or "Server"
                full_srv_name = f"[{provider_prefix}] {srv}"
                
                if full_srv_name not in server_map: server_map[full_srv_name] = []
                ep_data = {
                    "type": r["type"], "provider": provider_prefix, "server": srv,
                    "name": r.get("name"), "m3u8": r.get("m3u8"), "embed": r.get("embed"),
                    "season": r.get("season", 1)
                }
                server_map[full_srv_name].append(ep_data)
            final_results = [{"server": srv, "episodes": eps} for srv, eps in server_map.items()]
        else:
            final_results = deduped

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
