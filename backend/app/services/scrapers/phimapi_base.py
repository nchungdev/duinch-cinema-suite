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

def is_supported_lang(text: str) -> bool:
    """Check if the text is primarily English or Vietnamese."""
    if not text: return False
    vi_pattern = r'^[a-zA-Z0-9\s.,!?:;\-\(\)àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+$'
    return bool(re.match(vi_pattern, text))

async def tmdb_get_info(client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
    """Fetch metadata from TMDB with robust fallback and multi-language support."""
    token = config.TMDB_READ_ACCESS_TOKEN or os.getenv("TMDB_READ_ACCESS_TOKEN")
    if not token or not tmdb_id: return {}
    tmdb_type = "movie" if media_type == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}"
    headers = {"Authorization": f"Bearer {token}", "accept": "application/json"}
    try:
        resp = await client.get(url, params={"language": "vi-VN"}, headers=headers)
        data = resp.json()
        if resp.status_code != 200 or not data.get("id"):
            resp = await client.get(url, params={"language": "en-US"}, headers=headers)
            data = resp.json()
        if resp.status_code != 200: return {}
        raw_date = data.get("release_date") or data.get("first_air_date") or ""
        series_year = raw_date[:4]
        seasons = []
        if tmdb_type == "tv":
            for s in (data.get("seasons") or []):
                s_num = s.get("season_number", 0)
                if s_num == 0: continue
                s_date = s.get("air_date") or ""
                seasons.append({"season_number": s_num, "episode_count": s.get("episode_count", 0), "year": int(s_date[:4]) if s_date[:4].isdigit() else 0})
        return {
            "series_year": int(series_year) if series_year.isdigit() else 0,
            "season_years": {s["season_number"]: s["year"] for s in seasons},
            "tmdb_seasons": seasons,
            "total_episodes": data.get("number_of_episodes", 0),
            "total_seasons": data.get("number_of_seasons", 0),
            "title": data.get("name") or data.get("title")
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
            if current_total < ep_num <= (current_total + count): return s["season_number"]
            current_total += count
        return None

    def _detect_season(self, name: str, origin_name: str, year: int, tmdb_info: Dict) -> Optional[int]:
        """Intelligently detect season from Title Regex OR Year matching."""
        full_name = f"{name} {origin_name}".lower()
        s_match = re.search(r'(phần|season|ss|p)\s*(\d+)', full_name, re.IGNORECASE)
        if s_match: return int(s_match.group(2))
        if year > 0:
            season_years = tmdb_info.get("season_years", {})
            for s_num, s_year in season_years.items():
                if s_year > 0 and abs(year - s_year) <= 0: return s_num
        return None

    def _score_search_item(self, item: Dict, query: str, tmdb_id: Optional[str], year: Optional[int], media_type: str, requested_season: int, tmdb_info: Dict, is_search_phase: bool = False) -> int:
        score = 0
        if not item: return -1000
        n_name, n_origin = str(item.get("name") or "").lower().strip(), str(item.get("origin_name") or "").lower().strip()
        s_type = str(item.get("type") or "").lower()
        
        # 1. TYPE MATCH
        if (media_type == "tv") != (s_type in ["series", "tvshows", "hoathinh", "tv"]): return -3000

        # 2. TMDB ID MATCH (Strict Hard-Skip)
        src_tmdb = item.get("tmdb") or {}
        item_tmdb_id = str(src_tmdb.get("id")) if src_tmdb.get("id") else None
        if tmdb_id and item_tmdb_id and item_tmdb_id not in ["0", "null", "None"]:
            if item_tmdb_id == str(tmdb_id): score += 3000
            else: return -5000 # DIFFERENT ID = REJECT IMMEDIATELY

        # 3. SMART YEAR MATCH
        s_year = int(item.get("year") or 0)
        series_start = int(tmdb_info.get("series_year") or year or 0)
        all_y = [series_start] + list(tmdb_info.get("season_years", {}).values())
        if s_year > 0 and series_start > 0:
            if media_type == "movie":
                if abs(s_year - series_start) > 1: return -3000
                score += 600
            else:
                if any(abs(s_year - y) <= 1 for y in all_y if y > 0): score += 500
                elif s_year >= series_start: score += 200
                else: return -3000

        # 4. SEASON NUMBER
        found_s = self._detect_season(item.get("name", ""), item.get("origin_name", ""), s_year, tmdb_info)
        if found_s:
            if found_s == requested_season: score += 500
            else: score += 100

        # 5. TITLE MATCH
        n_query = query.lower().strip()
        if n_query:
            if n_query == n_name or n_query == n_origin: score += 800
            elif n_query in n_name or n_query in n_origin: score += 500
            else: 
                # If no ID was present to confirm, and title is totally different, reject
                if not item_tmdb_id or item_tmdb_id == "0": return -2000

        return score

    async def lookup(self, client: httpx.AsyncClient, tmdb_id: Optional[Any] = None, title: str = None, localize_title: str = None, media_type: str = "movie", season: int = 1, episode: int = None, year: int = None, force: bool = False) -> List[Dict[str, Any]]:
        req_season = season if season is not None else 1
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {"series_year": int(year) if year else 0}
        tmdb_seasons = tmdb_info.get("tmdb_seasons") or []
        all_results, seen_keys, seen_slugs = [], set(), set()

        async def _process_slug(slug: str, assigned_season: Optional[int] = None):
            if not slug or slug in seen_slugs: return
            seen_slugs.add(slug)
            details = await self.get_details(client, slug)
            if not details: return
            movie = details.get("movie") or {}
            movie_name = movie.get("name") or movie.get("origin_name") or "Unknown"
            
            s_year = int(movie.get("year") or 0)
            current_s = self._detect_season(movie.get("name", ""), movie.get("origin_name", ""), s_year, tmdb_info)
            if not current_s: current_s = assigned_season
            
            if self._score_search_item(movie, title or "", tmdb_id, year, media_type, current_s or 1, tmdb_info) >= 1000:
                for server in (details.get("episodes") or []):
                    sname = server.get("server_name", "Server")
                    for ep in (server.get("server_data") or []):
                        u = ep.get("link_m3u8") or ep.get("link_embed")
                        if u:
                            rs = current_s or 1
                            ename = str(ep.get("name") or "")
                            epm = re.search(r'\d+', ename)
                            if epm:
                                ep_num = int(epm.group())
                                if ep_num > 50 or not current_s:
                                    ms = self._get_season_from_episode(ep_num, tmdb_seasons)
                                    if ms: rs = ms
                            
                            debug_ename = f"{ename} ({movie_name})"
                            key = (u, rs, ename)
                            if key not in seen_keys:
                                all_results.append({
                                    "type": "streamable", "provider": self.provider_name.upper(), "server": sname, 
                                    "name": debug_ename, "m3u8": ep.get("link_m3u8"), "embed": ep.get("link_embed"), "season": rs,
                                    "movie_name": movie_name, "slug": slug
                                })
                                seen_keys.add(key)

        keywords = list(dict.fromkeys([q for q in [localize_title, title] if q and is_supported_lang(q)]))
        for kw in keywords:
            search_data = await self.api_call(client, "/v1/api/tim-kiem", params={"keyword": kw, "limit": 20})
            items = (search_data.get("data") or {}).get("items") or []
            for item in items:
                # SEARCH PHASE: Strict ID/Title/Year check
                if self._score_search_item(item, kw, tmdb_id, year, media_type, req_season, tmdb_info, is_search_phase=True) >= 500:
                    itmdb = item.get("tmdb") or {}
                    s_year = int(item.get("year") or 0)
                    is_ = self._detect_season(item.get("name", ""), item.get("origin_name", ""), s_year, tmdb_info)
                    await _process_slug(item.get("slug"), is_)
                    await asyncio.sleep(0.1)

        if tmdb_id and not all_results:
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True: await _process_slug((res.get("movie") or {}).get("slug"), req_season)
        return all_results
