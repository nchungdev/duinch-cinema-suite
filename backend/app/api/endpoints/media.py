from fastapi import APIRouter, Request, Query, HTTPException
import asyncio
import re
from typing import List, Dict, Any, Optional
from app.services import tmdb_service
from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.fshare_lookup import resolve_fshare_url
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.timfshare_lookup import lookup_timfshare

router = APIRouter()

@router.get("/detail/{media_type}/{tmdb_id}")
async def media_detail(request: Request, media_type: str, tmdb_id: int):
    """Get full details for a movie/tv show — metadata from TMDB + streaming from KKPhim."""
    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'movie' or 'tv'")

    client = request.app.state.http_client

    # ── 1. TMDB metadata ──────────────────────────────────────────────────────
    raw = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)
    if not raw or raw.get("success") is False:
        raise HTTPException(status_code=404, detail=f"TMDB {media_type}/{tmdb_id} not found")

    tmdb_seasons = []
    if media_type == "tv":
        for s in raw.get("seasons", []):
            if s.get("season_number", 0) > 0:
                tmdb_seasons.append({
                    "season_number": s["season_number"],
                    "name": s.get("name"),
                    "episode_count": s.get("episode_count", 0),
                })

    metadata = {
        "title": raw.get("title") or raw.get("name"),
        "origin_name": raw.get("original_title") or raw.get("original_name"),
        "poster": f"https://image.tmdb.org/t/p/w500{raw['poster_path']}" if raw.get("poster_path") else None,
        "poster_url": f"https://image.tmdb.org/t/p/w500{raw['poster_path']}" if raw.get("poster_path") else None,
        "thumb_url": f"https://image.tmdb.org/t/p/original{raw['backdrop_path']}" if raw.get("backdrop_path") else None,
        "content": raw.get("overview", ""),
        "year": int((raw.get("release_date") or raw.get("first_air_date") or "0")[:4] or 0),
        "time": f"{raw.get('runtime', 0)} min" if media_type == "movie" else f"{raw.get('number_of_episodes', 0)} tập",
        "quality": "4K" if raw.get("vote_average", 0) > 8 else "HD",
        "lang": raw.get("original_language", "en").upper(),
        "type": "series" if media_type == "tv" else "single",
        "category": [{"name": g["name"]} for g in raw.get("genres", [])],
        "actor": [],
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "tmdb_seasons": tmdb_seasons,
    }

    # ── 2. KKPhim streaming links (default backup) ───────────────────
    streaming_links = []
    try:
        from app.services.scrapers.kkphim_lookup import kkphim_get_by_tmdb, format_kkphim_links
        res = await asyncio.to_thread(kkphim_get_by_tmdb, media_type, tmdb_id)
        if res and not res.get("error") and res.get("status") is True and res.get("episodes"):
            streaming_links = format_kkphim_links(res["episodes"])
    except Exception as e:
        print(f"KKPhim lookup error for {media_type}/{tmdb_id}: {e}")

    return {
        "data": {
            "metadata": metadata,
            "local": {"exists": False},
            "links": {
                "streaming": streaming_links,
                "fshare": [],
                "web": [],
            },
        },
        "error_code": 0,
        "error_msg": "",
    }


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
    source_type: str = Query(...),  # m3u8, torrent, fshare, gdrive, dailymotion
    source: str = Query(None),      # kkphim, ophim | timfshare, thuviencine, web | googlesearch | dailymotion
):
    """
    Unified discovery endpoint.
    source_type = what kind of link (m3u8, fshare, torrent, gdrive, dailymotion)
    source      = which scraper/API provides it
    """
    client = request.app.state.http_client
    clean_title    = re.sub(r'\(.*?\)', '', title).strip()
    clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None

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
        # ── M3U8 streaming ────────────────────────────────────────────────────
        if source_type == "m3u8":
            if source == "kkphim":
                results = await lookup_kkphim(client, tmdb_id, clean_title, clean_localize, media_type, season, episode, year)
            elif source == "ophim":
                results = await lookup_ophim(client, tmdb_id, clean_title, clean_localize, media_type, season, episode, year)

        # ── Torrent ───────────────────────────────────────────────────────────
        elif source_type == "torrent":
            results = await lookup_torrent(clean_title, tmdb_id, media_type, season, episode, year)

        # ── FShare ────────────────────────────────────────────────────────────
        elif source_type == "fshare":
            if source == "timfshare":
                results = await lookup_timfshare(clean_title, year, season, episode)
                if clean_localize:
                    sec = await lookup_timfshare(clean_localize, year, season, episode)
                    results = results + sec
            elif source == "thuviencine":
                results = await lookup_thuviencine(primary, filter_title=clean_title)
                if secondary:
                    sec = await lookup_thuviencine(secondary, filter_title=clean_localize)
                    results = results + sec
            elif source == "web":
                results = await lookup_google_fshare(clean_title, year, season, episode)
                if clean_localize:
                    sec = await lookup_google_fshare(clean_localize, year, season, episode)
                    results = results + sec

        # ── Google Drive ──────────────────────────────────────────────────────
        elif source_type == "gdrive":
            results = await lookup_gdrive(primary)
            if secondary:
                sec = await lookup_gdrive(secondary)
                results.extend(sec)

        # ── Dailymotion ───────────────────────────────────────────────────────
        elif source_type == "dailymotion":
            results = []  # TODO: implement dailymotion scraper

        # ── Normalize: ensure source_type + source on every result, drop legacy provider ──
        for r in results:
            r["source_type"] = source_type
            r.setdefault("source", source or source_type)  # scrapers may already set their own `source`
            r.pop("provider", None)

        # ── Deduplicate by URL ────────────────────────────────────────────────
        seen_urls: set = set()
        final_results = []
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed")
            if url and url not in seen_urls:
                final_results.append(r)
                seen_urls.add(url)

        return {
            "data": {
                "source_type": source_type,
                "source": source,
                "results": final_results,
            },
            "error_code": 0,
            "error_msg": ""
        }
    except Exception as e:
        print(f"Discovery error for {source_type}/{source}: {e}")
        return {
            "data": {"source_type": source_type, "source": source, "results": []},
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
