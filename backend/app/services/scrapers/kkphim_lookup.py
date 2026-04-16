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
    ) -> List[Dict[str, Any]]:
        """KKPhim-specific lookup with TMDB ID endpoint support."""
        
        # 1. TMDB ID via phimapi TMDB endpoint
        if tmdb_id:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True and res.get("movie"):
                slug = res.get("movie", {}).get("slug")
                if slug:
                    details = await self.get_formatted_details(client, slug)
                    if details and not "error" in details:
                        return self.extract_streaming_links(details, media_type, season, episode)

        # 2-5. Fallback to base lookup (slug from titles, search)
        return await super().lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year)

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
) -> List[Dict[str, Any]]:
    return await _kkphim.lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year)

# For backward compatibility if needed in main or other scripts
def kkphim_get_details(slug: str):
    # This is now synchronous-ish or needs a client. 
    # Since it was used in __main__, we'll keep a legacy-ish wrapper if needed or just update main.
    pass

if __name__ == "__main__":
    import sys
    async def main():
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Usage: python kkphim_lookup.py <keyword_or_slug> [tmdb_id] [media_type]"}))
            sys.exit(1)
        
        input_str = sys.argv[1]
        tmdb_id = sys.argv[2] if len(sys.argv) > 2 else None
        media_type = sys.argv[3] if len(sys.argv) > 3 else "movie"

        async with httpx.AsyncClient() as client:
            provider = KKPhimProvider()
            
            # Simplified main for debugging
            if tmdb_id and tmdb_id.isdigit():
                results = await provider.lookup(client, tmdb_id=tmdb_id, media_type=media_type)
            elif "-" in input_str:
                details = await provider.get_formatted_details(client, input_str)
                results = provider.extract_streaming_links(details, media_type)
            else:
                results = await provider.lookup(client, title=input_str, media_type=media_type)
            
            print(json.dumps(results, ensure_ascii=False))

    asyncio.run(main())
