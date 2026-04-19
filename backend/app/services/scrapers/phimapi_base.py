import httpx
import json
import os
import re
import unicodedata
import asyncio
from typing import List, Dict, Optional, Any
from app.core import config

def title_to_slug(title: str) -> str:
    t = title.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_str.lower()).strip('-')
    return slug

def is_supported_lang(text: str) -> bool:
    if not text: return False
    vi_pattern = r'^[a-zA-Z0-9\s.,!?:;\-\(\)àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+$'
    return bool(re.match(vi_pattern, text))

async def tmdb_get_info(client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
    if not config.TMDB_READ_ACCESS_TOKEN or not tmdb_id: return {}
    tmdb_type = "movie" if media_type == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}"
    params = {"language": "vi-VN"}
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, params=params)
        data = resp.json()
        series_year = (data.get("release_date") or data.get("first_air_date") or "0")[:4]
        seasons = []
        if tmdb_type == "tv":
            for s in (data.get("seasons") or []):
                if s.get("season_number", 0) == 0: continue
                seasons.append({"season_number": s["season_number"], "episode_count": s.get("episode_count", 0), "year": int(s.get("air_date", "0")[:4] or 0)})
        return {
            "series_year": int(series_year) if series_year.isdigit() else 0,
            "season_years": {s["season_number"]: s["year"] for s in seasons},
            "tmdb_seasons": seasons,
            "total_episodes": data.get("number_of_episodes", 0),
            "total_seasons": data.get("number_of_seasons", 0)
        }
    except Exception: return {}

class PhimAPIBase:
    def __init__(self, provider_name: str, base_url: str):
        self.provider_name = provider_name
        self.base_url = base_url

    async def api_call(self, client: httpx.AsyncClient, path: str, params: Dict = None) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        try:
            resp = await client.get(url, params=params, timeout=10)
            if resp.status_code == 200: return resp.json() or {}
        except Exception: pass
        return {}

    async def get_details(self, client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
        data = await self.api_call(client, f"/phim/{slug}")
        if not data or not data.get("status"): return None
        return data

    async def get_by_tmdb(self, client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
        api_type = "movie" if media_type == "movie" else "tv"
        return await self.api_call(client, f"/tmdb/{api_type}/{tmdb_id}")

    def _get_season_from_episode(self, ep_num: int, tmdb_seasons: List[Dict]) -> Optional[int]:
        if not tmdb_seasons: return None
        current_total = 0
        for s in tmdb_seasons:
            count = s.get("episode_count", 0)
            if current_total < ep_num <= (current_total + count):
                return s["season_number"]
            current_total += count
        return None

    def _score_search_item(self, item: Dict, query: str, tmdb_id: Optional[str], year: Optional[int], media_type: str, requested_season: int, tmdb_info: Dict, is_search_phase: bool = False) -> int:
        score = 0
        if not item: return -1000
        n_name = str(item.get("name") or "").lower().strip()
        n_origin = str(item.get("origin_name") or "").lower().strip()
        
        s_type = str(item.get("type") or "").lower()
        is_tv_req = media_type == "tv"
        s_is_tv = s_type in ["series", "tvshows", "hoathinh", "tv"]
        if is_tv_req != s_is_tv: return -3000

        src_tmdb = item.get("tmdb") or {}
        item_tmdb_id = str(src_tmdb.get("id")) if src_tmdb.get("id") else None
        if tmdb_id and item_tmdb_id:
            if item_tmdb_id == str(tmdb_id): score += 2000
            else: return -5000

        s_year = int(item.get("year") or 0)
        series_start = int(tmdb_info.get("series_year") or year or 0)
        all_series_years = [series_start] + list(tmdb_info.get("season_years", {}).values())
        
        if s_year > 0 and series_start > 0:
            if media_type == "movie":
                if abs(s_year - series_start) > 1: return -3000
                score += 600
            else:
                # TV Rule: Accept if s_year matches ANY season year in the series
                if any(abs(s_year - y) <= 1 for y in all_series_years if y > 0):
                    score += 500
                elif s_year >= series_start:
                    score += 200
                else:
                    return -3000

        # Season in title check
        s_match = re.search(r'(phần|season|ss|p)\s*(\d+)', n_name + " " + n_origin, re.IGNORECASE)
        if s_match:
            found_s = int(s_match.group(2))
            if found_s == requested_season: score += 500
            else: score += 100 # Don't reject, just lower priority for OTHER seasons

        n_query = query.lower().strip()
        if n_query and (n_query == n_name or n_query == n_origin): score += 300
        elif n_query and (n_query in n_name or n_query in n_origin): score += 100

        return score

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
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {"series_year": int(year) if year else 0, "season_years": {}}
        tmdb_seasons = tmdb_info.get("tmdb_seasons") or []
        
        all_results = []
        seen_urls = set()
        seen_slugs = set()

        async def _process_slug(slug: str, assigned_season: int):
            if not slug or slug in seen_slugs: return
            seen_slugs.add(slug)
            details = await self.get_details(client, slug)
            if not details: return
            
            movie = details.get("movie") or {}
            # Allow all valid seasons to pass here
            if self._score_search_item(movie, title or "", tmdb_id, year, media_type, assigned_season, tmdb_info, is_search_phase=False) >= 0:
                for server in (details.get("episodes") or []):
                    sname = server.get("server_name", "Server")
                    for ep in (server.get("server_data") or []):
                        u = ep.get("link_m3u8") or ep.get("link_embed")
                        if u and u not in seen_urls:
                            res_season = assigned_season
                            ep_name = str(ep.get("name") or "")
                            ep_match = re.search(r'\d+', ep_name)
                            if ep_match:
                                mapped_s = self._get_season_from_episode(int(ep_match.group()), tmdb_seasons)
                                if mapped_s: res_season = mapped_s
                            
                            all_results.append({
                                "type": "streamable", "provider": self.provider_name, "server": sname,
                                "name": ep_name, "m3u8": ep.get("link_m3u8"), "embed": ep.get("link_embed"),
                                "season": res_season
                            })
                            seen_urls.add(u)

        # 1. TMDB ID Search
        if tmdb_id:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True:
                await _process_slug((res.get("movie") or {}).get("slug"), req_season)

        # 2. Slug & Search Discovery
        def clean_for_slug(t: str) -> str:
            if not t: return ""
            return re.sub(r'\s+\d{4}|\s+Season\s+\d+|\s+S\d+E\d+', '', t, flags=re.IGNORECASE).strip()

        raw_titles = list(dict.fromkeys([q for q in [localize_title, title] if q]))
        supported_titles = [t for t in raw_titles if is_supported_lang(t)]

        for t in supported_titles:
            # Try Direct Slugs
            clean_t = clean_for_slug(t)
            await _process_slug(title_to_slug(clean_t), req_season)
            
            # Try Search API
            search_data = await self.api_call(client, "/v1/api/tim-kiem", params={"keyword": t, "limit": 20})
            items = (search_data.get("data") or {}).get("items") or []
            for item in items:
                # IMPORTANT: We pass 'req_season' for scoring, but don't reject if mismatched!
                if self._score_search_item(item, t, str(tmdb_id) if tmdb_id else None, year, media_type, req_season, tmdb_info, is_search_phase=True) > 0:
                    # Identify season from search result if available
                    item_s = (item.get("tmdb") or {}).get("season") or req_season
                    await _process_slug(item.get("slug"), item_s)

        return all_results
