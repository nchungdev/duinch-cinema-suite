from fastapi import APIRouter, Request, Query, HTTPException
from typing import Optional, List
import asyncio
import re
from app.services import tmdb_service, media_service, cache_manager
from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.fshare_lookup import resolve_fshare_url
from app.services.scrapers.hdvietnam_lookup import lookup_hdvietnam
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent

router = APIRouter()

@router.get("/detail/{media_type}/{tmdb_id}")
async def media_detail(request: Request, media_type: str, tmdb_id: int):
    """Get full details for a movie or tv show from TMDB."""
    client = request.app.state.http_client
    details = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)
    return {
        "data": details,
        "error_code": 0,
        "error_msg": ""
    }

@router.get("/lookup")
async def lookup_sources(
    request: Request,
    media_type: str = Query(..., pattern="^(movie|tv)$"),
    title: str = Query(...),
    tmdb_id: Optional[int] = Query(None),
    year: Optional[str] = Query(None),
    season: Optional[int] = Query(None),
    episode: Optional[int] = Query(None),
    provider: str = Query("all")
):
    if media_type == "movie" and (season is not None or episode is not None):
        raise HTTPException(status_code=400, detail="Movies cannot have season or episode")
    if episode is not None and season is None:
        raise HTTPException(status_code=400, detail="Episode requires season")

    client = request.app.state.http_client
    
    # --- PHA 1: ĐỊNH DANH THỰC THỂ DUY NHẤT ---
    details = {}
    if tmdb_id:
        details = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)
    else:
        tmdb_results = await media_service.fetch_tmdb_metadata(client, title, media_type)
        if not tmdb_results:
            return {
                "data": None,
                "error_code": 404,
                "error_msg": f"Không tìm thấy phim '{title}' trên TMDB."
            }
        
        match = None
        clean_query = title.lower().strip()
        if year:
            match = next((item for item in tmdb_results if (item.get("title", "").lower() == clean_query or item.get("origin_name", "").lower() == clean_query) and item.get("year") == str(year)), None)
        if not match:
            match = next((item for item in tmdb_results if item.get("title", "").lower() == clean_query or item.get("origin_name", "").lower() == clean_query), None)
        if not match:
            return {
                "data": None,
                "error_code": 404,
                "error_msg": f"Không tìm thấy phim khớp chính xác '{title}'."
            }
        tmdb_id = match.get("tmdb_id")
        details = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)

    if not details or not tmdb_id:
        return {
            "data": None,
            "error_code": 500,
            "error_msg": "Failed to fetch authoritative metadata."
        }

    target_title = details.get("title") or details.get("name")
    target_origin = details.get("original_title") or details.get("original_name")
    target_year = (details.get("release_date") or details.get("first_air_date") or "")[:4]
    
    metadata_response = {
        "title": target_title, "original_title": target_origin,
        "tmdb_id": tmdb_id, "media_type": media_type, "year": target_year,
        "poster": f"https://image.tmdb.org/t/p/w500{details.get('poster_path')}" if details.get('poster_path') else None,
        "backdrop": f"https://image.tmdb.org/t/p/original{details.get('backdrop_path')}" if details.get('backdrop_path') else None,
        "overview": details.get("overview")
    }
    if season: metadata_response["season"] = season
    if episode: metadata_response["episode"] = episode

    # --- PHA 2: TÌM NGUỒN ---
    search_query = target_title
    if target_year:
        search_query = f"{target_title} {target_year}"
    
    if media_type == "tv" and season:
        if episode:
            search_query = f"{target_title} S{int(season):02d}E{int(episode):02d}"
        else:
            search_query = f"{target_title} S{int(season):02d}"

    tasks = []
    if provider in ["all", "kkphim"]:
        tasks.append(lookup_kkphim(client, str(tmdb_id), target_title, media_type, season, episode))
    if provider in ["all", "ophim"]:
        tasks.append(lookup_ophim(client, tmdb_id, target_title, media_type, season, episode))
        
    async def surgical_provider_search(scraper_func, query):
        try: return await scraper_func(query)
        except Exception: return []

    if provider in ["all", "fshare"]:
        async def wrap_fshare(q):
            f_res = await asyncio.gather(lookup_thuviencine(q), lookup_google_fshare(q), lookup_hdvietnam(q), return_exceptions=True)
            links = []
            for r in f_res:
                if isinstance(r, list): links.extend(r)
            if not links: return []
            expanded = await asyncio.gather(*[resolve_fshare_url(l["url"], client) for l in links], return_exceptions=True)
            fshare_final = []
            for source_link, resolved_items in zip(links, expanded):
                if isinstance(resolved_items, list):
                    for item in resolved_items:
                        fshare_final.append({
                            "type": "download", "provider": "fshare",
                            "url": item.get("url"), "name": item.get("name"),
                            "size": item.get("size", 0), "source_page": source_link.get("source_page", "")
                        })
            return fshare_final
        tasks.append(surgical_provider_search(wrap_fshare, search_query))
    if provider in ["all", "gdrive"]:
        tasks.append(surgical_provider_search(lookup_gdrive, search_query))
    if provider in ["all", "torrent"]:
        tasks.append(surgical_provider_search(lookup_torrent, search_query))

    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    final_sources = []
    def get_link_format(url):
        if not url: return "url"
        url_lower = url.lower()
        if url_lower.startswith("magnet:"): return "magnet"
        if ".m3u8" in url_lower: return "m3u8"
        if any(x in url_lower for x in ["share/", "embed/", "player/", "storage/"]): return "embed"
        if url_lower.endswith(".mp4"): return "mp4"
        if url_lower.endswith(".mkv"): return "mkv"
        return "url"

    for res in results_list:
        if not isinstance(res, list) or not res: continue
        p_name = res[0].get("provider", "unknown")
        provider_links = []
        for item in res:
            raw_url = item.get("url") or item.get("m3u8") or item.get("embed")
            if not raw_url: continue
            link_obj = {
                "name": item.get("name"), "url": raw_url,
                "format": get_link_format(raw_url), "server": item.get("server"),
                "size": item.get("size"), "season": item.get("season") if media_type == "tv" else None,
                "episode": item.get("episode") if media_type == "tv" else None
            }
            provider_links.append({k: v for k, v in link_obj.items() if v is not None})
        final_sources.append({"provider": p_name, "links": provider_links})

    return {
        "data": {
            "sources": final_sources,
            "metadata": metadata_response
        },
        "error_code": 0,
        "error_msg": ""
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
