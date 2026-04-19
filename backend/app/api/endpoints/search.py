from fastapi import APIRouter, Request
from app.infrastructure.clients import tmdb_client

router = APIRouter()

@router.get("")
async def media_search(request: Request, q: str = None, media_type: str = "all", page: int = 1):
    """Search TMDB — supports media_type=all|movie|tv and pagination."""
    query = q or request.query_params.get("q")
    if not query:
        return {"data": {"results": [], "total_pages": 0, "page": 1}, "error_code": 0, "error_msg": ""}

    client = request.app.state.http_client
    payload = await tmdb_client.fetch_tmdb_search(client, query, media_type, page)
    return {
        "data": payload,
        "error_code": 0,
        "error_msg": ""
    }
