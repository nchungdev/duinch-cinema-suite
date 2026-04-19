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

    async def get_by_tmdb(self, client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
        """Specific KKPhim endpoint for TMDB ID."""
        api_type = "movie" if media_type == "movie" else "tv"
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
        force: bool = False
    ) -> List[Dict[str, Any]]:
        
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {"year": int(year) if year else None}
        all_results = []
        seen_urls = set()

        def _add_links(details: Dict):
            if not details: return
            for server in details.get("episodes", []):
                sname = server.get("server_name", "Server")
                for ep in server.get("server_data", []):
                    u = ep.get("link_m3u8") or ep.get("link_embed")
                    if u and u not in seen_urls:
                        all_results.append({
                            "type": "streamable", "provider": self.provider_name, "server": sname,
                            "name": ep.get("name"), "m3u8": ep.get("link_m3u8"), "embed": ep.get("link_embed")
                        })
                        seen_urls.add(u)

        # PHASE 1: TMDB ID Search (KKPhim only)
        if tmdb_id:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True and res.get("movie"):
                # Check match even with ID search to be extra safe
                if self._is_match(res.get("movie"), tmdb_info, media_type):
                    _add_links(res)
                    # If this is a movie or an all-in-one series, we stop here as requested
                    # But we'll still allow fallback to slug if no links found
                    if all_results: return all_results

        # PHASE 2: Slug-based lookup (Fallback)
        return await super().lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year, force=force)

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
