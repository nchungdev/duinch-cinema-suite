import httpx
import json
import os
import re
import unicodedata
import asyncio
from typing import List, Dict, Optional, Any
from app.core import config

def title_to_slug(title: str) -> str:
    """Convert a movie title to a phimapi-style URL slug."""
    t = title.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_str.lower()).strip('-')
    return slug

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
        season_years = {}
        if tmdb_type == "tv":
            for s in data.get("seasons", []):
                s_num = s.get("season_number")
                s_date = s.get("air_date")
                if s_num is not None and s_date:
                    season_years[int(s_num)] = int(s_date[:4])
        return {
            "series_year": int(series_year) if series_year.isdigit() else 0,
            "season_years": season_years,
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
            if resp.status_code == 200: return resp.json()
        except Exception: pass
        return {}

    async def get_details(self, client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
        data = await self.api_call(client, f"/phim/{slug}")
        if not data or not data.get("status"): return None
        return data

    async def get_by_tmdb(self, client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
        api_type = "movie" if media_type == "movie" else "tv"
        return await self.api_call(client, f"/tmdb/{api_type}/{tmdb_id}")

    def _score_search_item(self, item: Dict, query: str, tmdb_id: Optional[str], year: Optional[int], media_type: str, requested_season: int, tmdb_info: Dict) -> int:
        score = 0
        n_name = item.get("name", "").lower().strip()
        n_origin = item.get("origin_name", "").lower().strip()
        
        # 1. TYPE MATCH
        s_type = item.get("type", "").lower()
        is_tv_req = media_type == "tv"
        s_is_tv = s_type in ["series", "tvshows", "hoathinh", "tv"]
        if is_tv_req != s_is_tv: return -2000

        # 2. TMDB ID MATCH
        src_tmdb = item.get("tmdb", {})
        item_tmdb_id = str(src_tmdb.get("id")) if src_tmdb.get("id") else None
        if tmdb_id and item_tmdb_id:
            if item_tmdb_id == str(tmdb_id): score += 1000
            else: return -2000

        # 3. SMART YEAR MATCH (Season-Aware)
        s_year = int(item.get("year") or 0)
        series_start = int(tmdb_info.get("series_year") or year or 0)
        # Bắt buộc lấy đúng năm của Season này từ TMDB
        target_season_year = tmdb_info.get("season_years", {}).get(requested_season, 0)
        
        if s_year > 0:
            if media_type == "movie":
                if series_start > 0 and abs(s_year - series_start) <= 1: score += 600
                else: return -1000
            else:
                # Ưu tiên 1: Khớp chính xác năm phát hành của Season này
                if target_season_year > 0 and abs(s_year - target_season_year) <= 1:
                    score += 700
                # Ưu tiên 2: Khớp năm bắt đầu series (nhiều nguồn dùng năm gốc cho mọi phần)
                elif series_start > 0 and abs(s_year - series_start) <= 1:
                    score += 400
                # Ưu tiên 3: Nếu là phim bộ và năm nằm trong khoảng từ start đến nay
                elif series_start > 0 and s_year >= series_start:
                    score += 200
                else:
                    score -= 500

        # 4. SEASON IN NAME MATCH
        s_match = re.search(r'(phần|season|ss|p)\s*(\d+)', n_name + " " + n_origin, re.IGNORECASE)
        if s_match:
            found_s = int(s_match.group(2))
            if found_s == requested_season: score += 500
            else: score -= 400

        # 5. TITLE MATCH
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
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {"series_year": int(year) if year else 0}
        all_results = []
        seen_urls = set()
        seen_slugs = set()

        async def _process_slug(slug: str, current_s: int):
            if not slug or slug in seen_slugs: return
            seen_slugs.add(slug)
            details = await self.get_details(client, slug)
            if not details: return
            
            movie = details.get("movie", {})
            # Validate using the specific season number for this slug
            if self._score_search_item(movie, title or "", tmdb_id, year, media_type, current_s, tmdb_info) > 0:
                for server in details.get("episodes", []):
                    sname = server.get("server_name", "Server")
                    for ep in server.get("server_data", []):
                        u = ep.get("link_m3u8") or ep.get("link_embed")
                        if u and u not in seen_urls:
                            all_results.append({
                                "type": "streamable", "provider": self.provider_name, "server": sname,
                                "name": ep.get("name"), "m3u8": ep.get("link_m3u8"), "embed": ep.get("link_embed"),
                                "season": current_s
                            })
                            seen_urls.add(u)

        # PHASE 1: TMDB ID Search
        if tmdb_id:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True and res.get("movie"):
                if self._score_search_item(res.get("movie"), title or "", str(tmdb_id), year, media_type, req_season, tmdb_info) > 0:
                    await _process_slug(res.get("movie", {}).get("slug"), req_season)
                    if all_results: return all_results

        # PHASE 2: Search & Rank Fallback
        search_keywords = list(dict.fromkeys([q for q in [title, localize_title] if q]))
        candidates = []
        for kw in search_keywords:
            search_data = await self.api_call(client, "/v1/api/tim-kiem", params={"keyword": kw, "limit": 10})
            items = search_data.get("data", {}).get("items", [])
            for item in items:
                # Score initial candidates against the requested season
                score = self._score_search_item(item, kw, str(tmdb_id) if tmdb_id else None, year, media_type, req_season, tmdb_info)
                if score > 50:
                    candidates.append({"slug": item["slug"], "score": score})
        
        candidates.sort(key=lambda x: x["score"], reverse=True)
        for cand in candidates[:3]:
            # Try the main slug
            await _process_slug(cand["slug"], req_season)
            if media_type == "tv":
                # Try parts - each part x is compared against Season x year
                for p in range(1, 11):
                    await _process_slug(f"{cand['slug']}-phan-{p}", p)

        return all_results
