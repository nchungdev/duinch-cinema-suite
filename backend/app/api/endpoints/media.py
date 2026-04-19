from fastapi import APIRouter, Request, Query
from fastapi.responses import StreamingResponse
import asyncio
import re
import json
from typing import List, Dict, Any

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

    def _build_query(base: str) -> str:
        parts = [base]
        if media_type == "movie" and year:
            parts.append(str(year))
        is_p2p_or_direct = source_type in ["torrent", "fshare", "gdrive"]
        if is_p2p_or_direct and media_type == "tv":
            if year: parts.append(str(year))
        else:
            if season and episode: parts.append(f"S{season:02d}E{episode:02d}")
            elif season: parts.append(f"Season {season}")
            elif media_type == "tv" and year: parts.append(str(year))
        return " ".join(parts)

    primary   = _build_query(clean_title)
    secondary = _build_query(clean_localize) if clean_localize else None
    results = [] # Initialize as empty list

    try:
        if source_type == "m3u8":
            target_ep = None if media_type == "tv" else episode
            # USE primary/secondary instead of bare titles to include year/season in API search
            if source == "kkphim":
                res = await lookup_kkphim(client, tmdb_id, primary, secondary, media_type, season, target_ep, year, force=force)
                if res: results = res
            elif source == "ophim":
                res = await lookup_ophim(client, tmdb_id, primary, secondary, media_type, season, target_ep, year, force=force)
                if res: results = res

        elif source_type == "torrent":
            t_season = None if media_type == "tv" else season
            t_episode = None if media_type == "tv" else episode
            results = await lookup_torrent(clean_title, tmdb_id, media_type, t_season, t_episode, year, tmdb_info=tmdb_info)

        elif source_type == "fshare":
            if source == "timfshare":
                results = await lookup_timfshare(primary, year=year, filter_title=clean_title, media_type=media_type, tmdb_info=tmdb_info)
                if secondary:
                    sec = await lookup_timfshare(secondary, year=year, filter_title=clean_localize, media_type=media_type, tmdb_info=tmdb_info)
                    results.extend(sec)
            elif source == "thuviencine":
                results = await lookup_thuviencine(primary, filter_title=clean_title, year=year, media_type=media_type)
                if secondary:
                    sec = await lookup_thuviencine(secondary, filter_title=clean_localize, media_type=media_type)
                    results.extend(sec)
            elif source == "web":
                g_season = None if media_type == "tv" else season
                g_episode = None if media_type == "tv" else episode
                results = await lookup_google_fshare(clean_title, year, g_season, g_episode, media_type)
                if clean_localize:
                    sec = await lookup_google_fshare(clean_localize, year, g_season, g_episode, media_type)
                    results.extend(sec)

        elif source_type == "gdrive":
            results = await lookup_gdrive(primary)
            if secondary:
                sec = await lookup_gdrive(secondary)
                results.extend(sec)

        # Normalize & Deduplicate
        if results is None: results = []
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed") or r.get("magnet")
            s_type = "HLS"
            if r.get("embed") or "embed" in str(url).lower(): s_type = "EMBED"
            elif source_type == "torrent" or (url and str(url).startswith("magnet:")): s_type = "P2P"
            elif source_type in ["fshare", "gdrive"]: s_type = "DIRECT"
            r["stream_type"] = s_type
            prov = str(r.get("source") or source or "UNKNOWN").upper()
            if prov in ["TIMFSHAREAPI", "TIMFSHAREHTML"]: prov = "TIMFSHARE"
            if prov in ["DUCKDUCKGO", "BRAVESEARCH"]: prov = "WEB"
            r["provider"] = prov
            r["source_type"] = source_type
            r.setdefault("source", source or source_type)

        seen_urls = set()
        deduped = []
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed") or r.get("magnet")
            if url and url not in seen_urls:
                deduped.append(r)
                seen_urls.add(url)

        if source_type == "m3u8":
            server_map = {}
            for r in deduped:
                srv = r.get("server") or r.get("provider") or "Server"
                if srv not in server_map: server_map[srv] = []
                ep = {k: v for k, v in r.items() if k not in ("server", "source_type", "source") and v is not None}
                server_map[srv].append(ep)
            final_results = [{"server": srv, "episodes": eps} for srv, eps in server_map.items()]
        else:
            final_results = deduped

        return {"source_type": source_type, "source": source, "results": final_results, "error": None}
    except Exception as e:
        print(f"[Discovery] Error in {source_type}/{source}: {e}")
        return {"source_type": source_type, "source": source, "results": [], "error": str(e)}

@router.get("/discovery-stream")
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

    async def event_generator():
        tasks = []
        for src in DISCOVERY_SOURCES:
            task = asyncio.create_task(
                _run_scraper_task(
                    client, tmdb_id, media_type, title, localize_title, year, season, episode,
                    src["source_type"], src["source"], force, tmdb_info=tmdb_info
                )
            )
            tasks.append(task)
        
        init_payload = {"type": "init", "total_sources": len(tasks), "sources": DISCOVERY_SOURCES}
        yield f"data: {json.dumps(init_payload)}\n\n"

        for completed_task in asyncio.as_completed(tasks):
            result = await completed_task
            payload = {"type": "result", "data": result}
            yield f"data: {json.dumps(payload)}\n\n"
            
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/discovery")
async def discovery(
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
    return {
        "data": { "source_type": source_type, "source": source, "results": result["results"] },
        "error_code": 500 if result["error"] else 0,
        "error_msg": result["error"] or ""
    }

@router.get("/torrent-files")
async def torrent_files(request: Request, info_hash: str):
    try:
        client = request.app.state.http_client
        resp = await client.get(f"https://apibay.org/f.php?id={info_hash}")
        data = resp.json()
        files = [{"name": f.get("name", ""), "size": int(f.get("size", 0))} for f in data if f.get("name") != ".pad"]
        return {"data": {"files": files}, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": {"files": []}, "error_code": 500, "error_msg": str(e)}

@router.get("/expand-folder")
async def folder_expand(request: Request, url: str, provider: str = "fshare"):
    try:
        client = request.app.state.http_client
        if provider == "fshare":
            files = await resolve_fshare_url(url, client)
            return { "data": {"results": files}, "error_code": 0, "error_msg": "" }
        elif provider == "torrent" or provider == "apibay":
            info_hash = None
            if "xt=urn:btih:" in url:
                m = re.search(r"btih:([a-fA-F0-9]+)", url)
                if m: info_hash = m.group(1)
            else:
                info_hash = url
            if not info_hash: return {"data": {"results": []}, "error_code": 400, "error_msg": "Invalid hash"}
            resp = await client.get(f"https://apibay.org/f.php?id={info_hash}")
            data = resp.json()
            files = [{ "name": f.get("name", ""), "size": int(f.get("size", 0)), "is_folder": False, "url": None } for f in data if f.get("name") != ".pad"]
            return { "data": {"results": files}, "error_code": 0, "error_msg": "" }
        return { "data": None, "error_code": 400, "error_msg": f"Provider {provider} not supported" }
    except Exception as e:
        return { "data": None, "error_code": 500, "error_msg": str(e) }
