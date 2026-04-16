from fastapi import APIRouter, Request, Query
from app.core import config
from app.services import cache_manager, tmdb_service
import urllib.parse

router = APIRouter()

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMG = "https://image.tmdb.org/t/p"

def _headers():
    return {
        "Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}",
        "accept": "application/json",
    }

def _fmt_tmdb(item: dict, media_type: str = None) -> dict:
    mt = media_type or item.get("media_type", "movie")
    poster = item.get("poster_path")
    backdrop = item.get("backdrop_path")
    return {
        "tmdb_id": item.get("id"),
        "media_type": mt,
        "title": item.get("title") or item.get("name"),
        "origin_name": item.get("original_title") or item.get("original_name"),
        "overview": item.get("overview"),
        "year": (item.get("release_date") or item.get("first_air_date") or "")[:4],
        "rating": item.get("vote_average"),
        "poster": f"{TMDB_IMG}/w500{poster}" if poster else None,
        "backdrop": f"{TMDB_IMG}/original{backdrop}" if backdrop else None,
        "popularity": item.get("popularity"),
    }

async def _tmdb_get(client, path: str, params: dict = None):
    try:
        url = f"{TMDB_BASE}{path}"
        resp = await client.get(url, headers=_headers(), params=params or {})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}

@router.get("/discovery")
async def discovery_list(request: Request, category: str = "new", page: int = 1):
    """Discovery from PhimAPI (KKPhim/OPhim)."""
    http_client = request.app.state.http_client
    cache_key = f"discovery_{category}_{page}"
    cached = cache_manager.get_from_cache(config.KKPHIM_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached:
        return {
            "data": cached,
            "error_code": 0,
            "error_msg": ""
        }

    try:
        url = f"https://phimapi.com/danh-sach/phim-moi-cap-nhat?page={page}" if category == "new" else f"https://phimapi.com/v1/api/danh-sach/{category}?page={page}"
        resp = await http_client.get(url)
        data = resp.json()
        items = []
        raw_items = data.get("items", []) or data.get("data", {}).get("items", [])
        
        for item in raw_items:
            img_prefix = "https://phimimg.com/" if not item.get("poster_url", "").startswith("http") else ""
            items.append({
                "title": item.get("name"), "origin_name": item.get("origin_name"),
                "slug": item.get("slug"), "year": item.get("year"),
                "poster": img_prefix + item.get("poster_url") if item.get("poster_url") else None,
                "media_type": "tv" if category in ["phim-bo", "tv-shows"] or "Tập" in item.get("episode_current", "") else "movie"
            })
        
        res_data = {
            "results": items, 
            "pagination": data.get("pagination") or data.get("data", {}).get("params", {}).get("pagination", {})
        }
        cache_manager.set_to_cache(config.KKPHIM_CACHE, cache_key, res_data)
        return {
            "data": res_data,
            "error_code": 0,
            "error_msg": ""
        }
    except Exception as e:
        return {
            "data": None,
            "error_code": 500,
            "error_msg": str(e)
        }

@router.get("/trending")
async def tmdb_trending(request: Request, media_type: str = "all", time_window: str = "day", page: int = 1):
    """TMDB Trending."""
    client = request.app.state.http_client
    data = await _tmdb_get(client, f"/trending/{media_type}/{time_window}", {"page": page, "language": "vi-VN"})
    if "error" in data:
        return {"data": None, "error_code": 500, "error_msg": data["error"]}
    return {
        "data": {"results": [_fmt_tmdb(i) for i in data.get("results", [])]},
        "error_code": 0,
        "error_msg": ""
    }

@router.get("/movies")
async def tmdb_movies(request: Request, category: str = "popular", page: int = 1):
    """TMDB Movies by category (popular, top_rated, now_playing, upcoming)."""
    client = request.app.state.http_client
    data = await _tmdb_get(client, f"/movie/{category}", {"page": page, "language": "vi-VN", "region": "VN"})
    if "error" in data:
        return {"data": None, "error_code": 500, "error_msg": data["error"]}
    return {
        "data": {"results": [_fmt_tmdb(i, "movie") for i in data.get("results", [])]},
        "error_code": 0,
        "error_msg": ""
    }

@router.get("/tvs")
async def tmdb_tvs(request: Request, category: str = "popular", page: int = 1):
    """TMDB TV Shows by category (popular, top_rated, on_the_air, airing_today)."""
    client = request.app.state.http_client
    data = await _tmdb_get(client, f"/tv/{category}", {"page": page, "language": "vi-VN"})
    if "error" in data:
        return {"data": None, "error_code": 500, "error_msg": data["error"]}
    return {
        "data": {"results": [_fmt_tmdb(i, "tv") for i in data.get("results", [])]},
        "error_code": 0,
        "error_msg": ""
    }

@router.get("/similar/{media_type}/{tmdb_id}")
async def tmdb_similar(request: Request, media_type: str, tmdb_id: int, page: int = 1):
    """Similar media from TMDB."""
    client = request.app.state.http_client
    data = await _tmdb_get(client, f"/{media_type}/{tmdb_id}/similar", {"page": page, "language": "vi-VN"})
    if "error" in data:
        return {"data": None, "error_code": 500, "error_msg": data["error"]}
    return {
        "data": {"results": [_fmt_tmdb(i, media_type) for i in data.get("results", [])]},
        "error_code": 0,
        "error_msg": ""
    }
@router.get("/lookup/fshare-discovery/{slug}")
async def fshare_discovery(request: Request, slug: str, title: str = Query(...)):
    """Deep lookup for FShare links by title/slug."""
    from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
    from app.services.scrapers.google_search_lookup import lookup_google_fshare
    from app.services.scrapers.hdvietnam_lookup import lookup_hdvietnam
    import asyncio
    
    search_query = f"{title} fshare"
    try:
        tasks = [lookup_thuviencine(search_query), lookup_google_fshare(search_query), lookup_hdvietnam(search_query)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        links = []
        for res in results:
            if isinstance(res, list):
                links.extend(res)
        
        return {
            "fshare": links,
            "success": True
        }
    except Exception as e:
        return {
            "fshare": [],
            "success": False,
            "error": str(e)
        }
