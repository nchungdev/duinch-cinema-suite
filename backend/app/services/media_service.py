import httpx
from app.core import config
from app.services import cache_manager
import urllib.parse

async def fetch_tmdb_metadata(client: httpx.AsyncClient, query: str, media_type: str = "all", page: int = 1):
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {"results": [], "total_pages": 0, "page": page}

    query_norm = query.strip().lower()
    cache_key = f"search_{media_type}_{query_norm}_p{page}"

    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

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
            if item_type not in ["movie", "tv", "collection"]:
                continue
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
            cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, payload)
        return payload
    except Exception as e:
        print(f"TMDB search error: {e}")
    return {"results": [], "total_pages": 0, "page": page}

async def fetch_kkphim_search(client: httpx.AsyncClient, query: str, media_type: str = "movie"):
    query_norm = query.strip().lower()
    cache_key = f"search_{media_type}_{query_norm}"
    
    cached = cache_manager.get_from_cache(config.KKPHIM_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

    try:
        resp = await client.get(f"https://phimapi.com/v1/api/tim-kiem?keyword={urllib.parse.quote(query)}&limit=10")
        items = resp.json().get("data", {}).get("items", [])
        
        results = []
        for item in items:
            img_prefix = "https://phimimg.com/" if not item.get("poster_url", "").startswith("http") else ""
            itype = item.get("type")
            name = item.get("name", "")
            is_tv = itype in ["series", "tvshows", "tv"] \
                    or "(Phần" in name or "Season" in name \
                    or "Tập " in item.get("episode_current", "") \
                    or "/tập" in item.get("time", "")
            parsed_media_type = "tv" if is_tv else "movie"
            
            results.append({
                "title": item.get("name"),
                "origin_name": item.get("origin_name"),
                "slug": item.get("slug"),
                "poster": img_prefix + item.get("poster_url") if item.get("poster_url") else None,
                "year": item.get("year"),
                "media_type": parsed_media_type,
                "source": "kkphim"
            })

        if results:
            cache_manager.set_to_cache(config.KKPHIM_CACHE, cache_key, results)
        return results
    except Exception:
        return []

async def fetch_tmdb_detail(client: httpx.AsyncClient, tmdb_id: int, media_type: str = "movie"):
    """Fetch full detail for a TMDB item and format for frontend."""
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?language=vi-VN"
        resp = await client.get(url, headers=headers)
            
        if resp.status_code != 200:
            return None
            
        item = resp.json()
        
        # Add season info if TV
        tmdb_seasons = []
        if media_type == "tv":
            for s in item.get("seasons", []):
                if s.get("season_number", 0) > 0: # Skip specials usually
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
            "actor": [], # TMDB requires extra call for credits, skipping for now to be fast
            "tmdb_seasons": tmdb_seasons
        }
    except Exception as e:
        print(f"TMDB detail fetch error: {e}")
        return None
