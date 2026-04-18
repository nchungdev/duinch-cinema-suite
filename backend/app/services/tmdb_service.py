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
    """Fetch full details for a movie/TV show from TMDB. Falls back to en-US if vi-VN has no overview."""
    if not config.TMDB_READ_ACCESS_TOKEN:
        return {}

    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}

    try:
        url_vi = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?language=vi-VN&append_to_response=credits"
        resp = await client.get(url_vi, headers=headers)
        data = resp.json()

        if not data.get("overview"):
            url_en = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?language=en-US&append_to_response=credits"
            resp_en = await client.get(url_en, headers=headers)
            en = resp_en.json()
            data["overview"] = en.get("overview", "")

        return data
    except Exception:
        return {}
