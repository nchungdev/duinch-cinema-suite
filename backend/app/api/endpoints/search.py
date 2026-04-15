from fastapi import APIRouter, Request, Query
from app.services import media_service

router = APIRouter()

@router.get("")
async def media_search(request: Request, q: str, media_type: str = "movie"):
    """Search for movies or tv shows from TMDB."""
    client = request.app.state.http_client
    results = await media_service.fetch_tmdb_metadata(client, q, media_type)
    return {"results": results, "success": True}
