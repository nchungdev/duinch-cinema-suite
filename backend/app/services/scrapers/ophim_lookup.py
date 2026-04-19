import httpx
import json
import os
import re
import asyncio
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase

class OPhimProvider(PhimAPIBase):
    def __init__(self):
        super().__init__("ophim", "https://ophim1.com")

_ophim = OPhimProvider()

async def lookup_ophim(
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
    return await _ophim.lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year, force=force)
