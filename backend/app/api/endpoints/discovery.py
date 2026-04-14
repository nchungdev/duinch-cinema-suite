from fastapi import APIRouter, Request
from app.core import config
from app.services import cache_manager
import time

router = APIRouter()

@router.get("/")
async def discovery_list(request: Request, category: str = "new", page: int = 1):
    http_client = request.app.state.http_client
    
    cache_key = f"discovery_{category}_{page}"
    cached = cache_manager.get_from_cache(config.KKPHIM_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached:
        return cached

    try:
        if category == "new":
            url = f"https://phimapi.com/danh-sach/phim-moi-cap-nhat?page={page}"
        else:
            url = f"https://phimapi.com/v1/api/danh-sach/{category}?page={page}"
            
        resp = await http_client.get(url)
        data = resp.json()
        
        items = []
        raw_items = data.get("items", []) or data.get("data", {}).get("items", [])
        raw_pagination = data.get("pagination") or data.get("data", {}).get("params", {}).get("pagination", {})
        
        for item in raw_items:
            img_prefix = "https://phimimg.com/" if not item.get("poster_url", "").startswith("http") else ""
            items.append({
                "title": item.get("name"),
                "origin_name": item.get("origin_name"),
                "slug": item.get("slug"),
                "poster": img_prefix + item.get("poster_url") if item.get("poster_url") else None,
                "year": item.get("year"),
                "media_type": "tv" if "(Phần" in item.get("name") or "Season" in item.get("name") or category in ["phim-bo", "tv-shows"] else "movie"
            })
            
        res_data = {
            "items": items,
            "pagination": raw_pagination,
            "success": True
        }
        
        cache_manager.set_to_cache(config.KKPHIM_CACHE, cache_key, res_data)
        return res_data
    except Exception as e:
        return {"error": str(e), "success": False}
