from fastapi import APIRouter, Request, HTTPException
from app.infrastructure.clients import tmdb_client
from typing import Union

router = APIRouter()

@router.get("/movie/{tmdb_id}")
async def movie_detail(request: Request, tmdb_id: str):
    """Fetch full movie details from TMDB. Accepts string to handle 'undefined' from frontend gracefully."""
    if not tmdb_id or tmdb_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid TMDB ID")
    
    try:
        id_int = int(tmdb_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="TMDB ID must be numeric")

    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_detail(client, id_int, "movie")
    if not data:
        raise HTTPException(status_code=404, detail="Movie not found")
    return {"data": {"metadata": data, "local": {"exists": False}}, "error_code": 0, "error_msg": ""}

@router.get("/tv/{tmdb_id}")
async def tv_detail(request: Request, tmdb_id: str):
    """Fetch full TV details from TMDB."""
    if not tmdb_id or tmdb_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid TMDB ID")
    
    try:
        id_int = int(tmdb_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="TMDB ID must be numeric")

    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_detail(client, id_int, "tv")
    if not data:
        raise HTTPException(status_code=404, detail="TV show not found")
    return {"data": {"metadata": data, "local": {"exists": False}}, "error_code": 0, "error_msg": ""}
@router.get("/tv/{tmdb_id}/season/{season_number}")
async def tv_season_detail(request: Request, tmdb_id: int, season_number: int):
    """Fetch season details from TMDB."""
    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_season(client, tmdb_id, season_number)
    if not data:
        raise HTTPException(status_code=404, detail="Season not found")
    return {"data": data, "error_code": 0, "error_msg": ""}
