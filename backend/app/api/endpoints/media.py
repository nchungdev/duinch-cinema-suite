from fastapi import APIRouter, Request, Query
import asyncio
import re
from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.fshare_lookup import resolve_fshare_url
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.timfshare_lookup import lookup_timfshare

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
                results = await lookup_timfshare(primary, year=year, filter_title=clean_title)
                if secondary:
                    sec = await lookup_timfshare(secondary, year=year, filter_title=clean_localize)
                    results = results + sec
            elif source == "thuviencine":
                results = await lookup_thuviencine(primary, filter_title=clean_title, year=year)
                if secondary:
                    sec = await lookup_thuviencine(secondary, filter_title=clean_localize, year=year)
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
