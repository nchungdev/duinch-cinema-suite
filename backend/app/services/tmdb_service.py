import httpx
from app.core import config
from typing import List, Optional, Dict, Any

async def get_tmdb_alternative_titles(client: httpx.AsyncClient, tmdb_id: int, media_type: str) -> List[str]:
    """Fetch all alternative titles for a movie or TV show from TMDB."""
    if not config.TMDB_READ_ACCESS_TOKEN:
        return []
        
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}/alternative_titles"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        
        titles = []
        # TV uses 'results', Movie uses 'titles'
        raw_titles = data.get("results" if media_type == "tv" else "titles", [])
        for t in raw_titles:
            title = t.get("title")
            if title:
                titles.append(title)
        return list(set(titles))
    except Exception:
        return []

async def get_tmdb_details(client: httpx.AsyncClient, tmdb_id: int, media_type: str) -> Dict[str, Any]:
    """Fetch full details for a movie/TV show from TMDB."""
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {}
        
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?language=vi-VN"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, headers=headers)
        return resp.json()
    except Exception:
        return {}
