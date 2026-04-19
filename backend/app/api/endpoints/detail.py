from fastapi import APIRouter, Request, HTTPException
from app.infrastructure.clients import tmdb_client

router = APIRouter()

@router.get("/movie/{tmdb_id}")
async def movie_detail(request: Request, tmdb_id: int):
    """Fetch full movie details from TMDB."""
    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_detail(client, tmdb_id, "movie")
    if not data:
        raise HTTPException(status_code=404, detail="Movie not found")
    return {"data": {"metadata": data, "local": {"exists": False}}, "error_code": 0, "error_msg": ""}

@router.get("/tv/{tmdb_id}")
async def tv_detail(request: Request, tmdb_id: int):
    """Fetch full TV details from TMDB."""
    client = request.app.state.http_client
    data = await tmdb_client.fetch_tmdb_detail(client, tmdb_id, "tv")
    if not data:
        raise HTTPException(status_code=404, detail="TV show not found")
    return {"data": {"metadata": data, "local": {"exists": False}}, "error_code": 0, "error_msg": ""}
