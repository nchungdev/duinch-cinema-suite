import httpx
from typing import List, Dict, Optional
from app.core import config
from app.services import cache_manager

async def fetch_tmdb_metadata(client: httpx.AsyncClient, query: str, media_type: str = "movie"):
    if not config.TMDB_READ_ACCESS_TOKEN:
        return []
    
    query_norm = query.strip().lower()
    cache_key = f"{media_type}_{query_norm}"
    
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

    url = f"https://api.themoviedb.org/3/search/multi?query={query}&include_adult=false&language=vi-VN&page=1"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, headers=headers)
        raw_results = resp.json().get("results", [])
        results = []
        for item in raw_results:
            item_type = item.get("media_type")
            if media_type == "all":
                if item_type not in ["movie", "tv"]: continue
            elif item_type != media_type:
                continue
                
            results.append({
                "title": item.get("title") or item.get("name"),
                "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                "tmdb_id": item.get("id"),
                "overview": item.get("overview"),
                "media_type": item_type,
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "source": "tmdb"
            })
        
        if results:
            cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, results)
        return results
    except Exception:
        pass
    return []

async def fetch_kkphim_search(client: httpx.AsyncClient, query: str, media_type: str = "movie"):
    query_norm = query.strip().lower()
    cache_key = f"search_{media_type}_{query_norm}"
    
    cached = cache_manager.get_from_cache(config.KKPHIM_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

    try:
        resp = await client.get(f"https://phimapi.com/v1/api/tim-kiem?keyword={query}&limit=10")
        items = resp.json().get("data", {}).get("items", [])
        
        results = []
        for item in items:
            img_prefix = "https://phimimg.com/" if not item.get("poster_url", "").startswith("http") else ""
            results.append({
                "title": item.get("name"),
                "origin_name": item.get("origin_name"),
                "slug": item.get("slug"),
                "poster": img_prefix + item.get("poster_url") if item.get("poster_url") else None,
                "year": item.get("year"),
                "media_type": media_type,
                "source": "kkphim"
            })

        if results:
            cache_manager.set_to_cache(config.KKPHIM_CACHE, cache_key, results)
        return results
    except Exception:
        return []
