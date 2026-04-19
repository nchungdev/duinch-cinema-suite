import httpx
import urllib.parse
from typing import List, Dict, Optional, Any
from app.core import config
from app.infrastructure.cache.redis_cache import cache_manager

async def fetch_tmdb_search(client: httpx.AsyncClient, query: str, media_type: str = "all", page: int = 1) -> Dict[str, Any]:
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {"results": [], "total_pages": 0, "page": page}

    query_norm = query.strip().lower()
    cache_key = f"search_{media_type}_{query_norm}_p{page}"
    
    cached = cache_manager.get_discovery("tmdb_search", cache_key, page)
    if cached: return cached

    if media_type == "all":
        url = f"https://api.themoviedb.org/3/search/multi?query={urllib.parse.quote(query)}&include_adult=false&language=vi-VN&page={page}"
    else:
        url = f"https://api.themoviedb.org/3/search/{media_type}?query={urllib.parse.quote(query)}&include_adult=false&language=vi-VN&page={page}"

    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, headers=headers)
        body = resp.json()
        raw_results = body.get("results", [])
        total_pages = body.get("total_pages", 1)
        results = []
        for item in raw_results:
            item_type = item.get("media_type") or media_type
            if item_type not in ["movie", "tv", "collection"]: continue
            normalized_type = "tv" if item_type == "tv" else "movie"
            results.append({
                "title": item.get("title") or item.get("name"),
                "origin_name": item.get("original_title") or item.get("original_name"),
                "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                "tmdb_id": item.get("id"),
                "slug": str(item.get("id")),
                "overview": item.get("overview"),
                "media_type": normalized_type,
                "actual_type": item_type,
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "source": "tmdb"
            })

        payload = {"results": results, "total_pages": total_pages, "page": page}
        if results:
            cache_manager.set_discovery("tmdb_search", cache_key, page, payload)
        return payload
    except Exception as e:
        print(f"TMDB search error: {e}")
    return {"results": [], "total_pages": 0, "page": page}

async def fetch_tmdb_detail(client: httpx.AsyncClient, tmdb_id: int, media_type: str = "movie") -> Optional[Dict[str, Any]]:
    """Fetch full detail for a TMDB item and format for frontend."""
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?language=vi-VN"
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200: return None
        item = resp.json()
        
        tmdb_seasons = []
        if media_type == "tv":
            for s in item.get("seasons", []):
                if s.get("season_number", 0) > 0:
                    tmdb_seasons.append({
                        "season_number": s.get("season_number"),
                        "name": s.get("name"),
                        "episode_count": s.get("episode_count")
                    })

        return {
            "title": item.get("title") or item.get("name"),
            "origin_name": item.get("original_title") or item.get("original_name"),
            "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
            "poster_url": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
            "thumb_url": f"https://image.tmdb.org/t/p/original{item.get('backdrop_path')}" if item.get('backdrop_path') else None,
            "content": item.get("overview", ""),
            "year": int((item.get("release_date") or item.get("first_air_date", "0000-"))[:4]),
            "time": f"{item.get('runtime', 0)} min" if media_type == "movie" else f"{item.get('number_of_episodes', 0)} episodes",
            "quality": "4K" if item.get('vote_average', 0) > 8 else "HD",
            "lang": item.get("original_language", "en").upper(),
            "type": "series" if media_type == "tv" else "single",
            "category": [{"name": g.get("name")} for g in item.get("genres", [])],
            "actor": [],
            "tmdb_seasons": tmdb_seasons
        }
    except Exception as e:
        print(f"TMDB detail fetch error: {e}")
        return None

async def get_tmdb_alternative_titles(client: httpx.AsyncClient, tmdb_id: int, media_type: str) -> List[str]:
    """Fetch all alternative titles for a movie or TV show from TMDB."""
    if not config.TMDB_READ_ACCESS_TOKEN: return []
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}/alternative_titles"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        raw_titles = data.get("results" if media_type == "tv" else "titles", [])
        return list(set([t.get("title") for t in raw_titles if t.get("title")]))
    except Exception: return []
