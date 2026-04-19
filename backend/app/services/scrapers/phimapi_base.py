import httpx
import json
import os
import re
import unicodedata
import asyncio
from typing import List, Dict, Optional, Any
from app.core import config
from app.services import cache_manager

def title_to_slug(title: str) -> str:
    """Convert a movie title to a phimapi-style URL slug."""
    t = title.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_str.lower()).strip('-')
    return slug

async def tmdb_get_info(client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
    """Get detailed info from TMDB."""
    if not config.TMDB_READ_ACCESS_TOKEN or not tmdb_id: return {}
    tmdb_type = "movie" if media_type == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}"
    params = {"language": "vi-VN"}
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, params=params)
        data = resp.json()
        seasons = []
        if tmdb_type == "tv":
            for s in data.get("seasons", []):
                if s.get("season_number", 0) == 0: continue
                seasons.append({"season_number": s["season_number"], "episode_count": s.get("episode_count", 0)})
        return {
            "year": int((data.get("release_date") or data.get("first_air_date") or "0")[:4]),
            "total_episodes": data.get("number_of_episodes", 0),
            "total_seasons": data.get("number_of_seasons", 0),
            "tmdb_seasons": seasons
        }
    except Exception: return {}

class PhimAPIBase:
    def __init__(self, provider_name: str, base_url: str):
        self.provider_name = provider_name
        self.base_url = base_url

    async def api_call(self, client: httpx.AsyncClient, path: str) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        try:
            resp = await client.get(url, timeout=10)
            if resp.status_code == 200: return resp.json()
        except Exception: pass
        return {}

    async def get_details(self, client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
        data = await self.api_call(client, f"/phim/{slug}")
        if not data or not data.get("status"): return None
        return data

    def _is_match(self, source_movie: Dict, tmdb_info: Dict, media_type: str) -> bool:
        """Strict validation of result against TMDB metadata."""
        if not source_movie or not tmdb_info: return False
        
        # 1. Year Check
        s_year = int(source_movie.get("year") or 0)
        t_year = tmdb_info.get("year")
        if t_year and s_year != t_year: return False
        
        # 2. Type Check
        s_type = source_movie.get("type", "")
        is_tv = media_type == "tv"
        s_is_tv = s_type in ["series", "tvshows", "hoathinh"]
        if is_tv != s_is_tv: return False

        return True

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

        # STEP 1: Direct Slug Lookup (No Year in Slug)
        slug_bases = []
        if title: slug_bases.append(title_to_slug(title))
        if localize_title: slug_bases.append(title_to_slug(localize_title))
        slug_bases = list(dict.fromkeys(slug_bases))

        for base in slug_bases:
            # Try root slug
            details = await self.get_details(client, base)
            if details and self._is_match(details.get("movie"), tmdb_info, media_type):
                _add_links(details)
                # If it's a movie or an all-in-one TV show, we might be done
                # But to be safe for TV show parts, we continue checking

            # STEP 2: Part-based Lookup (phan-x)
            # If it's a TV show, try appending -phan-2, -phan-3... if needed
            if media_type == "tv":
                # We try up to 10 parts to be safe
                for p in range(1, 11):
                    p_slug = f"{base}-phan-{p}"
                    p_details = await self.get_details(client, p_slug)
                    if p_details and self._is_match(p_details.get("movie"), tmdb_info, media_type):
                        _add_links(p_details)

        # Deduplicate and return
        return all_results
