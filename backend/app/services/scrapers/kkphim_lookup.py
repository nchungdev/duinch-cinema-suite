import httpx
import json
import os
import re
import asyncio
from typing import List, Dict, Optional, Any
from .phimapi_base import PhimAPIBase, title_to_slug, tmdb_get_info, is_supported_lang

class KKPhimProvider(PhimAPIBase):
    def __init__(self):
        super().__init__("kkphim", "https://phimapi.com")

    async def lookup(
        self,
        client: httpx.AsyncClient,
        tmdb_id: Optional[Any] = None,
        title: str = None,
        localize_title: str = None,
        media_type: str = "movie",
        season: int = 1,
        episode: int = None,
        year: int = None,
        force: bool = False
    ) -> List[Dict[str, Any]]:
        
        req_season = season if season is not None else 1
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {"series_year": int(year) if year else 0}
        tmdb_seasons = tmdb_info.get("tmdb_seasons") or []
        
        all_results = []
        seen_urls = set()
        seen_slugs = set()

        async def _process_slug(slug: str, assigned_season: Optional[int] = None):
            if not slug or slug in seen_slugs: return
            seen_slugs.add(slug)
            details = await self.get_details(client, slug)
            if not details: return
            
            movie = details.get("movie") or {}
            # Fallback season detection
            current_s = assigned_season
            if not current_s:
                m_name = (movie.get("name") or "") + " " + (movie.get("origin_name") or "")
                s_match = re.search(r'(phần|season|ss|p)\s*(\d+)', m_name, re.IGNORECASE)
                if s_match: current_s = int(s_match.group(2))
            
            if self._score_search_item(movie, title or "", tmdb_id, year, media_type, current_s or 1, tmdb_info) >= 0:
                for server in (details.get("episodes") or []):
                    sname = server.get("server_name", "Server")
                    for ep in (server.get("server_data") or []):
                        u = ep.get("link_m3u8") or ep.get("link_embed")
                        if u and u not in seen_urls:
                            res_season = current_s
                            ep_name = str(ep.get("name") or "")
                            ep_match = re.search(r'\d+', ep_name)
                            if ep_match:
                                mapped_s = self._get_season_from_episode(int(ep_match.group()), tmdb_seasons)
                                if mapped_s: res_season = mapped_s
                            
                            all_results.append({
                                "type": "streamable", "provider": "KKPHIM", "server": sname,
                                "name": ep_name, "m3u8": ep.get("link_m3u8"), "embed": ep.get("link_embed"),
                                "season": res_season or 1
                            })
                            seen_urls.add(u)

        # --- REFINED DISCOVERY STRATEGY ---
        search_keywords = list(dict.fromkeys([q for q in [localize_title, title] if q and is_supported_lang(q)]))
        base_candidates = []

        # 1. Collect Base Candidates from Titles
        def clean_for_slug(t: str) -> str:
            return re.sub(r'\s+\d{4}|\s+Season\s+\d+|\s+S\d+E\d+', '', t or '', flags=re.IGNORECASE).strip()
        for t in search_keywords:
            base_candidates.append(title_to_slug(clean_for_slug(t)))

        # 2. Collect Base Candidates from Search
        for kw in search_keywords:
            search_data = await self.api_call(client, "/v1/api/tim-kiem", params={"keyword": kw, "limit": 20})
            items = (search_data.get("data") or {}).get("items") or []
            for item in items:
                item_tmdb = item.get("tmdb") or {}
                item_tmdb_id = str(item_tmdb.get("id")) if item_tmdb.get("id") else None
                
                is_match = False
                if tmdb_id and item_tmdb_id == str(tmdb_id):
                    is_match = True
                elif self._score_search_item(item, kw, tmdb_id, year, media_type, req_season, tmdb_info, is_search_phase=True) > 500:
                    is_match = True
                
                if is_match:
                    raw_slug = item.get("slug", "")
                    await _process_slug(raw_slug, item_tmdb.get("season"))
                    # Extract base (e.g. sieu-anh-hung-pha-hoai-phan-5 -> sieu-anh-hung-pha-hoai)
                    clean_slug = re.sub(r'-(phan|season|ss|p|mùa)-\d+$', '', raw_slug, flags=re.IGNORECASE)
                    base_candidates.append(clean_slug)

        # 3. Execution: Progressive Scan on all bases
        final_bases = list(dict.fromkeys([s for s in base_candidates if s]))
        # Use total_seasons from TMDB, or fallback to 8 as a safety margin for discovery
        total_s = tmdb_info.get("total_seasons") or 8

        for base in final_bases:
            await _process_slug(base, req_season) # Check root
            if media_type == "tv":
                for p in range(1, total_s + 1):
                    await _process_slug(f"{base}-phan-{p}", p)

        # 4. Final Backup
        if tmdb_id and not all_results:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True:
                await _process_slug((res.get("movie") or {}).get("slug"), req_season)

        return all_results

_kkphim = KKPhimProvider()

async def lookup_kkphim(client: httpx.AsyncClient, tmdb_id: Optional[Any] = None, title: str = None, localize_title: str = None, media_type: str = "movie", season: int = None, episode: int = None, year: int = None, force: bool = False) -> List[Dict[str, Any]]:
    return await _kkphim.lookup(client, tmdb_id, title, localize_title, media_type, season, episode, year, force=force)

async def kkphim_get_details(slug: str):
    async with httpx.AsyncClient() as client: return await _kkphim.get_details(client, slug)

async def kkphim_get_by_tmdb(media_type: str, tmdb_id: Any):
    async with httpx.AsyncClient() as client: return await _kkphim.get_by_tmdb(client, media_type, str(tmdb_id))
