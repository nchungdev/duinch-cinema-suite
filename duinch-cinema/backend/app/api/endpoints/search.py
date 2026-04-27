from fastapi import APIRouter, Request
from app.infrastructure.clients import tmdb_client

router = APIRouter()

@router.get("")
async def media_search(request: Request, q: str = None, media_type: str = "all", page: int = 1):
    """
    Search TMDB — supports media_type=all|movie|tv and pagination.
    Returns a FLAT structure for direct frontend compatibility.
    """
    query = q or request.query_params.get("q")
    if not query:
        return {"results": [], "total_pages": 0, "page": 1}

    client = request.app.state.http_client
    payload = await tmdb_client.fetch_tmdb_search(client, query, media_type, page)
    
    # Return payload DIRECTLY (payload contains results, total_pages, page)
    return payload
