from fastapi import APIRouter, Request, HTTPException
from app.infrastructure.clients import tmdb_client
from app.services.response_wrapper import wrap_response
from typing import Union

router = APIRouter()

@router.get("/movie/{tmdb_id}")
async def movie_detail(request: Request, tmdb_id: str):
    """Fetch full movie details from TMDB."""
    if not tmdb_id or tmdb_id == "undefined":
        return wrap_response(error_code=400, error_message="Invalid TMDB ID")
    
    try:
        id_int = int(tmdb_id)
    except ValueError:
        return wrap_response(error_code=400, error_message="TMDB ID must be numeric")

    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_detail(client, id_int, "movie")
    if not data:
        return wrap_response(error_code=404, error_message="Movie not found")
    
    return wrap_response({"metadata": data, "local": {"exists": False}})

@router.get("/tv/{tmdb_id}")
async def tv_detail(request: Request, tmdb_id: str):
    """Fetch full TV details from TMDB."""
    if not tmdb_id or tmdb_id == "undefined":
        return wrap_response(error_code=400, error_message="Invalid TMDB ID")
    
    try:
        id_int = int(tmdb_id)
    except ValueError:
        return wrap_response(error_code=400, error_message="TMDB ID must be numeric")

    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_detail(client, id_int, "tv")
    if not data:
        return wrap_response(error_code=404, error_message="TV show not found")
    
    return wrap_response({"metadata": data, "local": {"exists": False}})

@router.get("/tv/{tmdb_id}/season/{season_number}")
async def tv_season_detail(request: Request, tmdb_id: int, season_number: int):
    """Fetch detailed season metadata including episode thumbnails."""
    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_season(client, tmdb_id, season_number)
    if not data:
        return wrap_response(error_code=404, error_message="Season not found")
    return wrap_response(data)
