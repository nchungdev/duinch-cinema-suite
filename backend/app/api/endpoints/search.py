from fastapi import APIRouter, Request, Query
from app.services import media_service

router = APIRouter()

@router.get("")
@router.get("/{q}")
async def media_search(request: Request, q: str = None, media_type: str = "movie"):
    """Search for movies or tv shows from TMDB."""
    query = q or request.query_params.get("q")
    if not query:
        return {"data": {"results": []}, "error_code": 0, "error_msg": ""}
        
    client = request.app.state.http_client
    results = await media_service.fetch_tmdb_metadata(client, query, media_type)
    return {
        "data": {"results": results},
        "error_code": 0,
        "error_msg": ""
    }
