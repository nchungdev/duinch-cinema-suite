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

    async def lookup(
        self,
        client: httpx.AsyncClient,
        tmdb_id: Optional[Any] = None,
        title: str = None,
        localize_title: str = None,
        media_type: str = "movie",
        season: int = None,
        episode: int = None,
        year: int = None,
        anchor_slug: str = None,
        force: bool = False
    ) -> List[Dict[str, Any]]:
        # OPhim doesn't have a reliable TMDB endpoint, so we rely on base search
        return await super().lookup(
            client,
            tmdb_id,
            title,
            localize_title,
            media_type,
            season,
            episode,
            year,
            anchor_slug=anchor_slug,
            force=force
        )

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
