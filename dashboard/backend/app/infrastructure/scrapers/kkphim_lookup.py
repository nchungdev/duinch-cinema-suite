import httpx
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase
from app.domain.models.media import StreamingEpisode
from app.domain.models.tmdb import TMDBInfo
from app.domain.interfaces.provider import MediaProviderPort

class KKPhimProvider(PhimAPIBase, MediaProviderPort):
    def __init__(self):
        super().__init__("kkphim", "https://phimapi.com")

_kkphim = KKPhimProvider()

async def lookup_kkphim(
    client: httpx.AsyncClient,
    tmdb_id: Optional[Any] = None,
    title: str = None,
    localize_title: str = None,
    media_type: str = "movie",
    season: int = 1,
    episode: int = None,
    year: int = None,
    force: bool = False,
    tmdb_info: Optional[TMDBInfo] = None
) -> List[StreamingEpisode]:
    return await _kkphim.lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year, force=force, tmdb_info=tmdb_info)

# Backward Compatibility
async def kkphim_get_details(slug: str):
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_details(client, slug)

async def kkphim_get_by_tmdb(media_type: str, tmdb_id: Any):
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_by_tmdb(client, media_type, str(tmdb_id))
