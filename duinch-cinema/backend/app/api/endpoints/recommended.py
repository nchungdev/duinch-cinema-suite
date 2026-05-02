from fastapi import APIRouter, Request, Query
from app.core import config
from app.infrastructure.cache.redis_cache import cache_manager
import httpx

router = APIRouter()

@router.get("/trending")
async def get_trending(request: Request, media_type: str = "movie", page: int = 1):
    """Fetch trending items from TMDB with pagination."""
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}

    cache_key = f"trending_{media_type}_p{page}"
    cached = cache_manager.get_discovery("tmdb_recommended", cache_key, 1)
    if cached: return {"data": cached, "error_code": 0, "error_msg": ""}

    client = request.app.state.http_client
    url = f"https://api.themoviedb.org/3/trending/{media_type}/day?language=vi-VN&page={page}"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        raw_results = data.get("results", [])
        results = []
        for item in raw_results:
            normalized_type = "tv" if media_type == "tv" else "movie"
            tid = item.get("id")
            results.append({
                "id": tid,
                "tmdb_id": tid,
                "slug": str(tid),
                "title": item.get("title") or item.get("name") or "Unknown",
                "origin_name": item.get("original_title") or item.get("original_name"),
                "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                "media_type": normalized_type,
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "overview": item.get("overview"),
                "source": "tmdb"
            })
        
        payload = {"results": results, "total_pages": data.get("total_pages", 1), "page": page}
        if results:
            cache_manager.set_discovery("tmdb_recommended", cache_key, 1, payload)
        return {"data": payload, "error_code": 0, "error_msg": ""}
    except Exception:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}

@router.get("/movies")
async def get_popular_movies(request: Request, category: str = "popular", page: int = 1):
    """Fetch movies from TMDB with specific category."""
    return await _fetch_tmdb_discovery(request, "movie", category, page)

@router.get("/tvs")
async def get_popular_tvs(request: Request, category: str = "popular", page: int = 1):
    """Fetch TV shows from TMDB with specific category."""
    return await _fetch_tmdb_discovery(request, "tv", category, page)

async def _fetch_tmdb_discovery(request: Request, media_type: str, category: str, page: int):
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}

    cache_key = f"{media_type}_{category}_p{page}"
    cached = cache_manager.get_discovery("tmdb_discovery", cache_key, 1)
    if cached: return {"data": cached, "error_code": 0, "error_msg": ""}

    client = request.app.state.http_client
    
    # Category mapping for TMDB
    tmdb_category = category
    if category == "releases":
        tmdb_category = "now_playing" if media_type == "movie" else "on_the_air"
    
    # Specialized discovery for Animation
    if category == "animation":
        url = f"https://api.themoviedb.org/3/discover/{media_type}?language=vi-VN&page={page}&with_genres=16&sort_by=popularity.desc"
    elif tmdb_category == "now_playing":
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_category}?language=vi-VN&page={page}&region=VN"
    else:
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_category}?language=vi-VN&page={page}"
        
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        raw_results = data.get("results", [])

        # Fallback for now_playing if region=VN is empty
        if tmdb_category == "now_playing" and not raw_results:
            url_fallback = f"https://api.themoviedb.org/3/{media_type}/{tmdb_category}?language=vi-VN&page={page}"
            resp = await client.get(url_fallback, headers=headers)
            data = resp.json()
            raw_results = data.get("results", [])

        results = []
        for item in raw_results:
            tid = item.get("id")
            results.append({
                "id": tid,
                "tmdb_id": tid,
                "slug": str(tid),
                "title": item.get("title") or item.get("name") or "Unknown",
                "origin_name": item.get("original_title") or item.get("original_name"),
                "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                "media_type": media_type,
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "overview": item.get("overview"),
                "source": "tmdb"
            })
        
        payload = {"results": results, "total_pages": data.get("total_pages", 1), "page": page}
        if results:
            cache_manager.set_discovery("tmdb_discovery", cache_key, 1, payload)
        return {"data": payload, "error_code": 0, "error_msg": ""}
    except Exception:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}
