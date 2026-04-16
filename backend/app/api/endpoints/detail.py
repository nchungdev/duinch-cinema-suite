from fastapi import APIRouter, Request, HTTPException
from app.services import tmdb_service
import asyncio

router = APIRouter()

async def _build_detail(client, tmdb_id: int, media_type: str):
    """Fetch TMDB detail and format for frontend. No streaming lookup here."""
    raw = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)
    if not raw or raw.get("success") is False:
        raise HTTPException(status_code=404, detail=f"TMDB {media_type}/{tmdb_id} not found")

    tmdb_seasons = []
    if media_type == "tv":
        for s in raw.get("seasons", []):
            if s.get("season_number", 0) > 0:
                tmdb_seasons.append({
                    "season_number": s["season_number"],
                    "name": s.get("name"),
                    "episode_count": s.get("episode_count", 0),
                })

    metadata = {
        "title": raw.get("title") or raw.get("name"),
        "origin_name": raw.get("original_title") or raw.get("original_name"),
        "poster": f"https://image.tmdb.org/t/p/w500{raw['poster_path']}" if raw.get("poster_path") else None,
        "poster_url": f"https://image.tmdb.org/t/p/w500{raw['poster_path']}" if raw.get("poster_path") else None,
        "thumb_url": f"https://image.tmdb.org/t/p/original{raw['backdrop_path']}" if raw.get("backdrop_path") else None,
        "content": raw.get("overview", ""),
        "year": int((raw.get("release_date") or raw.get("first_air_date") or "0")[:4] or 0),
        "time": f"{raw.get('runtime', 0)} min" if media_type == "movie" else f"{raw.get('number_of_episodes', 0)} tập",
        "quality": "4K" if raw.get("vote_average", 0) > 8 else "HD",
        "lang": raw.get("original_language", "en").upper(),
        "type": "series" if media_type == "tv" else "single",
        "category": [{"name": g["name"]} for g in raw.get("genres", [])],
        "actor": [p["name"] for p in raw.get("credits", {}).get("cast", [])[:10]],
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "tmdb_seasons": tmdb_seasons,
    }

    return {
        "data": {
            "metadata": metadata,
            "local": {"exists": False},
            "links": {"streaming": [], "fshare": [], "web": []},
        },
        "error_code": 0,
        "error_msg": "",
    }


@router.get("/movie/{tmdb_id}")
async def movie_detail(request: Request, tmdb_id: int):
    """TMDB metadata for a movie."""
    return await _build_detail(request.app.state.http_client, tmdb_id, "movie")


@router.get("/tv/{tmdb_id}")
async def tv_detail(request: Request, tmdb_id: int):
    """TMDB metadata for a TV show (includes season list)."""
    return await _build_detail(request.app.state.http_client, tmdb_id, "tv")
