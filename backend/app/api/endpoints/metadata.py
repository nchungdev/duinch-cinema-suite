from fastapi import APIRouter, Request, HTTPException
from app.services.scrapers.kkphim_lookup import kkphim_get_details
from app.services.scrapers.fshare_lookup import resolve_fshare_url
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.hdvietnam_lookup import lookup_hdvietnam
from app.services import media_service
import asyncio

router = APIRouter()

@router.get("/{slug}")
async def metadata_detail(request: Request, slug: str):
    """Fetch detail by slug for KKPhim and potentially others."""
    client = request.app.state.http_client
    
    # 1. Get details from KKPhim (authorized metadata provider for slugs)
    # Using asyncio.to_thread because kkphim_get_details is synchronous
    details = await asyncio.to_thread(kkphim_get_details, slug)
    
    if "error" in details:
        return {
            "data": None,
            "error_code": 404,
            "error_msg": details["error"]
        }
        
    # Standardize result
    res_data = {
        "metadata": details,
        "local": {"exists": False},
        "links": {
            "streaming": details.get("links", []),
            "fshare": [],
            "web": []
        }
    }
    
    return {
        "data": res_data,
        "error_code": 0,
        "error_msg": ""
    }
