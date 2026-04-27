from fastapi import APIRouter, Request
from app.core import config
from app.infrastructure.cache.redis_cache import cache_manager
import httpx

router = APIRouter()

@router.get("/trending")
async def get_trending(request: Request, media_type: str = "movie"):
    """Fetch trending items from TMDB."""
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}

    cache_key = f"trending_{media_type}"
    cached = cache_manager.get_discovery("tmdb_recommended", cache_key, 1)
    if cached: return {"data": cached, "error_code": 0, "error_msg": ""}

    client = request.app.state.http_client
    url = f"https://api.themoviedb.org/3/trending/{media_type}/day?language=vi-VN"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        raw_results = data.get("results", [])
        results = []
        for item in raw_results:
            normalized_type = "tv" if media_type == "tv" else "movie"
            tid = item.get("id")
            
            # Trả về đầy đủ id, tmdb_id và slug (alias của id) để tương thích 100% với Frontend
            results.append({
                "id": tid,
                "tmdb_id": tid,
                "slug": str(tid), # RESTORE: Frontend DiscoveryGrid uses item.slug
                "title": item.get("title") or item.get("name") or "Unknown",
                "origin_name": item.get("original_title") or item.get("original_name"),
                "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                "media_type": normalized_type,
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "overview": item.get("overview"),
                "source": "tmdb"
            })
        
        payload = {"results": results}
        if results:
            cache_manager.set_discovery("tmdb_recommended", cache_key, 1, payload)
        return {"data": payload, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}
