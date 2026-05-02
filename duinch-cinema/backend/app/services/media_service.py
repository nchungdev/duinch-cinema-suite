import httpx
import os
from typing import List, Dict, Any
from app.core import config

async def fetch_tmdb_metadata(client: httpx.AsyncClient, query: str, media_type: str = "movie") -> List[Dict[str, Any]]:
    api_key = os.getenv("TMDB_KEY", "1c821e175c07645a12d003cc8d42d454")
    token = config.TMDB_READ_ACCESS_TOKEN
    
    headers = {"accept": "application/json"}
    if token and len(token) > 100:
        headers["Authorization"] = f"Bearer {token}"

    if media_type == "multi":
        url = f"https://api.themoviedb.org/3/search/multi?query={query}&language=vi-VN&api_key={api_key}"
    else:
        url = f"https://api.themoviedb.org/3/search/{media_type}?query={query}&language=vi-VN&api_key={api_key}"
        
    try:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200: return []
        
        data = resp.json()
        results = []
        for item in data.get("results", []):
            # TMDB multi search results include a media_type field
            effective_mt = item.get("media_type") or media_type
            if effective_mt not in ["movie", "tv"]: continue

            results.append({
                "tmdb_id": item.get("id"),
                "title": item.get("title") or item.get("name"),
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "year": (item.get("release_date") or item.get("first_air_date", "0000"))[:4],
                "media_type": effective_mt
            })
        return results
    except Exception:
        return []
