import httpx
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase

class KKPhimProvider(PhimAPIBase):
    def __init__(self):
        super().__init__("kkphim", "https://phimapi.com")

_kkphim = KKPhimProvider()

async def lookup_kkphim(
    client: httpx.AsyncClient,
    tmdb_id: Optional[Any] = None,
    title: str = None,
    localize_title: str = None,
    media_type: str = "movie",
    season: int = None,
    episode: int = None,
    year: int = None,
    force: bool = False
) -> List[Dict[str, Any]]:
    return await _kkphim.lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year, force=force)

# Backward Compatibility
async def kkphim_get_details(slug: str):
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_details(client, slug)

async def kkphim_get_by_tmdb(media_type: str, tmdb_id: Any):
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_by_tmdb(client, media_type, str(tmdb_id))
