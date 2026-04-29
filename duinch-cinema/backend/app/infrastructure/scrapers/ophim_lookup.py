import httpx
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase
from app.domain.models.media import ScraperEpisode
from app.domain.models.tmdb import TMDBInfo
from app.domain.interfaces.provider import MediaProviderPort

class OPhimProvider(PhimAPIBase, MediaProviderPort):
    def __init__(self):
        super().__init__("ophim", "https://ophim1.com")

_ophim = OPhimProvider()

async def lookup_ophim(
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
) -> List[ScraperEpisode]:
    return await _ophim.lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year, force=force, tmdb_info=tmdb_info)
