from fastapi import APIRouter, Request, HTTPException
from app.services.scrapers.kkphim_lookup import kkphim_get_details
from app.services.scrapers.fshare_lookup import resolve_fshare_url
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services import media_service
import asyncio

router = APIRouter()

@router.get("/{slug}")
async def metadata_detail(request: Request, slug: str, media_type: str = "movie"):
    """Fetch detail by slug for KKPhim or TMDB ID."""
    client = request.app.state.http_client
    
    # Check if slug is numeric (likely a TMDB ID from trending)
    if slug.isdigit():
        tmdb_id = int(slug)
        # Fetch from TMDB using explicit media_type — NO type-switching fallback
        # to avoid loading a TV show as a movie or vice versa
        tmdb_data = await media_service.fetch_tmdb_detail(client, tmdb_id, media_type)
        if not tmdb_data:
            raise HTTPException(status_code=404, detail=f"TMDB {media_type} ID {tmdb_id} not found")
        
        # Try to find corresponding links on KKPhim — strict media_type only
        streaming_links = []
        try:
            from app.services.scrapers.kkphim_lookup import kkphim_get_by_tmdb, format_kkphim_links
            res = await asyncio.to_thread(kkphim_get_by_tmdb, media_type, tmdb_id)
            if res and not res.get("error") and res.get("status") is True:
                if res.get("episodes"):
                    streaming_links = format_kkphim_links(res.get("episodes"))
        except Exception as e:
            print(f"KKPhim link lookup error for TMDB ID {tmdb_id} ({media_type}): {e}")

        # Standardize for frontend
        res_data = {
            "metadata": tmdb_data,
            "local": {"exists": False},
            "links": {
                "streaming": streaming_links,
                "fshare": [],
                "web": []
            }
        }
    else:
        # Get details from KKPhim
        details = await asyncio.to_thread(kkphim_get_details, slug)
        
        if "error" in details:
            return {
                "data": None,
                "error_code": 404,
                "error_msg": details["error"]
            }
            
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
