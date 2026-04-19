from fastapi import APIRouter, Request, Query, HTTPException
import asyncio
import re
from typing import List, Dict, Any, Optional
from app.services import tmdb_service
from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.fshare_lookup import resolve_fshare_url, lookup_timfshare
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.phimapi_base import tmdb_get_info

router = APIRouter()

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
    provider: str = Query(...),  # kkphim, ophim, torrent, fshare, thuviencine, gdrive
    force: bool = Query(False),
):
    """Unified discovery endpoint for all providers. Supports streamable and downloadable types."""
    client = request.app.state.http_client
    clean_title    = re.sub(r'\(.*?\)', '', title).strip()
    clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None

    # Helper to build search queries
    def _build_query(base: str) -> str:
        parts = [base]
        if media_type == "movie" and year:
            parts.append(str(year))
        if season and episode:
            parts.append(f"S{season:02d}E{episode:02d}")
        elif season:
            parts.append(f"Season {season}")
        elif media_type == "tv" and year:
            parts.append(str(year))
        return " ".join(parts)

    primary   = _build_query(clean_title)
    secondary = _build_query(clean_localize) if clean_localize else None

    results = []
    
    try:
        # Get TMDB info for scoring heuristics
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {}

        if provider == "kkphim":
            results = await lookup_kkphim(client, tmdb_id, primary, secondary, media_type, season, episode if media_type != "tv" else None, year, force=force)
        elif provider == "ophim":
            results = await lookup_ophim(client, tmdb_id, primary, secondary, media_type, season, episode if media_type != "tv" else None, year, force=force)
        elif provider == "torrent":
            results = await lookup_torrent(clean_title, tmdb_id, media_type, season if media_type != "tv" else None, episode if media_type != "tv" else None, year, tmdb_info=tmdb_info)
        elif provider == "fshare":
            results = await lookup_google_fshare(clean_title, year, season if media_type != "tv" else None, episode if media_type != "tv" else None)
            if clean_localize:
                sec_res = await lookup_google_fshare(clean_localize, year, season if media_type != "tv" else None, episode if media_type != "tv" else None)
                results.extend(sec_res)
        elif provider == "thuviencine":
            results = await lookup_thuviencine(primary)
            if secondary:
                sec_res = await lookup_thuviencine(secondary)
                results.extend(sec_res)
        elif provider == "gdrive":
            results = await lookup_gdrive(primary)
            if secondary:
                sec_res = await lookup_gdrive(secondary)
                results.extend(sec_res)
        
        # Deduplicate & Ensure 'type'
        if results is None: results = []
        seen_urls = set()
        final_results = []
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed") or r.get("magnet")
            if url and url not in seen_urls:
                if provider in ["kkphim", "ophim"]: r["type"] = "streamable"
                else: r.setdefault("type", "downloadable")
                final_results.append(r)
                seen_urls.add(url)

        return {
            "data": {
                "results": final_results,
                "provider": provider,
                "success": True
            },
            "error_code": 0,
            "error_msg": ""
        }
    except Exception as e:
        print(f"Discovery error for {provider}: {e}")
        return {
            "data": {"results": [], "provider": provider, "success": False},
            "error_code": 500,
            "error_msg": str(e)
        }

@router.get("/expand-folder")
async def folder_expand(request: Request, url: str, provider: str = "fshare"):
    """Standalone endpoint to expand folder URLs."""
    try:
        client = request.app.state.http_client
        if provider == "fshare":
            files = await resolve_fshare_url(url, client)
            return {
                "data": {"results": files},
                "error_code": 0,
                "error_msg": ""
            }
        return {
            "data": None,
            "error_code": 400,
            "error_msg": f"Provider {provider} not supported"
        }
    except Exception as e:
        return {
            "data": None,
            "error_code": 500,
            "error_msg": str(e)
        }
