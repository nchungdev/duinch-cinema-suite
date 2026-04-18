import httpx
import json
import os
import re
import asyncio
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase, title_to_slug

class KKPhimProvider(PhimAPIBase):
    def __init__(self):
        super().__init__("kkphim", "https://phimapi.com")

    async def get_by_tmdb(self, client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
        """Specific KKPhim endpoint for TMDB ID."""
        type_map = {"movie": "movie", "tv": "tv"}
        api_type = type_map.get(media_type, "movie")
        path = f"/tmdb/{api_type}/{tmdb_id}"
        return await self.api_call(client, path)

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
        """KKPhim-specific lookup with TMDB ID endpoint support."""
        anchor_slug_found = anchor_slug

        # 1. TMDB ID via phimapi TMDB endpoint.
        if tmdb_id and not anchor_slug_found:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True and res.get("movie"):
                anchor_slug_found = res.get("movie", {}).get("slug")

        return await super().lookup(
            client,
            tmdb_id,
            title,
            localize_title,
            media_type,
            season,
            episode,
            year,
            anchor_slug=anchor_slug_found,
            force=force
        )

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

async def kkphim_get_details(slug: str):
    """Wrapper for external detail fetching."""
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_formatted_details(client, slug)
