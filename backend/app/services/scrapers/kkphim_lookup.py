import httpx
import json
import os
import re
import asyncio
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase, title_to_slug, tmdb_get_info

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

# --- BACKWARD COMPATIBILITY HELPERS ---

async def kkphim_get_details(slug: str):
    """Wrapper for legacy metadata endpoint."""
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_formatted_details(client, slug)

async def kkphim_get_by_tmdb(media_type: str, tmdb_id: Any):
    """Legacy wrapper for TMDB ID lookup."""
    async with httpx.AsyncClient() as client:
        return await _kkphim.get_by_tmdb(client, media_type, str(tmdb_id))

def format_kkphim_links(episodes: List[Dict]) -> List[Dict[str, Any]]:
    """Legacy formatter for KKPhim links."""
    links = []
    for server in episodes:
        sname = server.get("server_name", "Server")
        for ep in server.get("server_data", []):
            links.append({
                "type": "streamable",
                "provider": "kkphim",
                "server": sname,
                "name": ep.get("name"),
                "m3u8": ep.get("link_m3u8"),
                "embed": ep.get("link_embed")
            })
    return links
