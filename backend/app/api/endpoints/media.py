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
        
        # P2P / DIRECT: Broader search for TV (Full season packs / series)
        is_p2p_or_direct = source_type in ["torrent", "fshare", "gdrive"]
        
        if is_p2p_or_direct and media_type == "tv":
            if year: parts.append(str(year))
        else:
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
            # For TV, we want ALL episodes of the season, so we pass episode=None
            target_ep = None if media_type == "tv" else episode
            if source == "kkphim":
                results = await lookup_kkphim(client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year)
            elif source == "ophim":
                results = await lookup_ophim(client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year)

        # ── Torrent ───────────────────────────────────────────────────────────
        elif source_type == "torrent":
            t_season = None if media_type == "tv" else season
            t_episode = None if media_type == "tv" else episode
            results = await lookup_torrent(clean_title, tmdb_id, media_type, t_season, t_episode, year)

        # ── FShare ────────────────────────────────────────────────────────────
        elif source_type == "fshare":
            if source == "timfshare":
                results = await lookup_timfshare(primary, year=year, filter_title=clean_title, media_type=media_type)
                if secondary:
                    sec = await lookup_timfshare(secondary, year=year, filter_title=clean_localize, media_type=media_type)
                    results = results + sec
            elif source == "thuviencine":
                results = await lookup_thuviencine(primary, filter_title=clean_title, year=year, media_type=media_type)
                if secondary:
                    sec = await lookup_thuviencine(secondary, filter_title=clean_localize, year=year, media_type=media_type)
                    results = results + sec
            elif source == "web":
                g_season = None if media_type == "tv" else season
                g_episode = None if media_type == "tv" else episode
                results = await lookup_google_fshare(clean_title, year, g_season, g_episode, media_type)
                if clean_localize:
                    sec = await lookup_google_fshare(clean_localize, year, g_season, g_episode, media_type)
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

        # ── Normalize: ensure standardized fields on every result ─────────────
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed") or r.get("magnet")
            
            # 1. Determine Stream Type
            s_type = "HLS"
            if r.get("embed") or "embed" in str(url).lower():
                s_type = "EMBED"
            elif source_type == "torrent" or (url and str(url).startswith("magnet:")):
                s_type = "P2P"
            elif source_type in ["fshare", "gdrive"]:
                s_type = "DIRECT"
            
            r["stream_type"] = s_type

            # 2. Standardize Provider (Uppercase)
            prov = str(r.get("source") or source or "UNKNOWN").upper()
            if prov in ["TIMFSHAREAPI", "TIMFSHAREHTML"]: prov = "TIMFSHARE"
            if prov in ["DUCKDUCKGO", "BRAVESEARCH"]: prov = "WEB"
            r["provider"] = prov
            
            # Legacy fields for safety
            r["source_type"] = source_type
            r.setdefault("source", source or source_type)
            r.pop("provider_name", None)

        # ── Deduplicate by URL ────────────────────────────────────────────────
        seen_urls: set = set()
        deduped = []
        for r in results:
            url = r.get("url") or r.get("m3u8") or r.get("embed") or r.get("magnet")
            if url and url not in seen_urls:
                deduped.append(r)
                seen_urls.add(url)

        # ── Group by server name (m3u8 can have multiple named servers) ───────
        if source_type == "m3u8":
            server_map: dict = {}
            for r in deduped:
                srv = r.get("server") or r.get("provider") or "Server"
                if srv not in server_map:
                    server_map[srv] = []
                ep = {k: v for k, v in r.items()
                      if k not in ("server", "source_type", "source") and v is not None}
                server_map[srv].append(ep)
            final_results = [{"server": srv, "episodes": eps}
                             for srv, eps in server_map.items()]
        else:
            final_results = deduped

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


@router.get("/torrent-files")
async def torrent_files(request: Request, info_hash: str):
    """Fetch file list for a torrent from apibay."""
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
