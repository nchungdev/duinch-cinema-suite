import httpx
import os
from app.core import config

async def get_tmdb_details(client: httpx.AsyncClient, tmdb_id: int, media_type: str):
    token = config.TMDB_READ_ACCESS_TOKEN
    api_key = os.getenv("TMDB_KEY", "1c821e175c07645a12d003cc8d42d454")
    
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?language=vi-VN&api_key={api_key}"
    headers = {"accept": "application/json"}
    
    if token and len(token) > 100:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        resp = await client.get(url, headers=headers)
        return resp.json()
    except Exception: return {}
