import httpx
import json
import os
import re
import html
import unicodedata
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Any
from app.core import config
from app.services import cache_manager

TMDB_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

def title_to_slug(title: str) -> str:
    """Convert a movie title to a phimapi-style URL slug."""
    t = title.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_str.lower()).strip('-')
    return slug

async def tmdb_get_info(client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
    if not TMDB_TOKEN or not tmdb_id: return {}
    tmdb_type = "movie" if media_type == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}?language=vi-VN"
    headers = {"Authorization": f"Bearer {TMDB_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        poster_path = data.get("poster_path")
        seasons = []
        if tmdb_type == "tv":
            for s in data.get("seasons", []):
                if s.get("season_number", 0) == 0: continue
                seasons.append({"season_number": s.get("season_number"), "name": s.get("name"), "episode_count": s.get("episode_count", 0)})
        return {
            "poster": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
            "total_seasons": data.get("number_of_seasons"),
            "total_episodes": data.get("number_of_episodes"),
            "status": data.get("status"),
            "release_date": data.get("release_date") or data.get("first_air_date"), 
            "tmdb_seasons": seasons
        }
    except: return {}

class PhimAPIBase:
    def __init__(self, provider_name: str, base_url: str):
        self.provider_name = provider_name
        self.base_url = base_url

    async def api_call(self, client: httpx.AsyncClient, path: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        try:
            resp = await client.get(url, params=params, timeout=15)
            if resp.status_code != 200: return {"error": f"HTTP {resp.status_code}"}
            return resp.json()
        except Exception as e: return {"error": str(e)}

    async def search(self, client: httpx.AsyncClient, keyword: str) -> List[Dict[str, Any]]:
        path = "/v1/api/tim-kiem"
        params = {"keyword": keyword, "limit": 20}
        data = await self.api_call(client, path, params)
        return data.get("data", {}).get("items", []) if "error" not in data else []

    def _normalize(self, value: Optional[str]) -> str:
        if not value: return ""
        value = html.unescape(str(value))
        value = unicodedata.normalize("NFKD", value)
        value = "".join(ch for ch in value if not unicodedata.combining(ch))
        return re.sub(r"\s+", " ", value).strip().lower()

    def _score_search_item(self, item: Dict[str, Any], query: str, tmdb_id: Optional[Any] = None, year: Optional[int] = None, media_type: str = "movie", season: int = 1, tmdb_info: Dict[str, Any] = {}) -> int:
        score = 0
        name = item.get("name", ""); origin = item.get("origin_name", "")
        n_name = self._normalize(name); n_origin = self._normalize(origin)
        n_query = self._normalize(query)
        
        # 1. Source-provided TMDB Metadata
        src_tmdb = item.get("tmdb", {})
        item_tmdb_id = str(src_tmdb.get("id") or "")
        item_season = src_tmdb.get("season")
        
        # 2. TMDB ID MATCH (Strongest indicator)
        if tmdb_id and item_tmdb_id:
            if item_tmdb_id == str(tmdb_id):
                score += 500
                # CRITICAL: Check Season mismatch if site provides it
                if item_season and season and int(item_season) != int(season):
                    return -1000 # Absolute mismatch if ID matches but Season is wrong
            else:
                score -= 300 # ID Mismatch

        # 3. Name & Season Extraction from Text
        if n_query == n_name or n_query == n_origin: score += 200
        elif n_query in n_name or n_query in n_origin: score += 100

        # Heuristic: Find "Phần X" or "Season X" in name
        s_match = re.search(r'(phần|season|ss|p)\s*(\d+)', n_name + " " + n_origin, re.IGNORECASE)
        if s_match:
            found_s = int(s_match.group(2))
            if season and found_s != season:
                return -500 # Strong penalty for wrong season in name

        # 4. Year Match (Strict for TV shows when searching for specific seasons)
        item_year = int(item.get("year") or 0)
        if year and item_year > 0:
            if item_year == year: score += 100
            elif abs(item_year - year) <= 1: score += 40
            else:
                # If source year is in the future (e.g. 2026) but we want 2023, it's a mismatch
                if item_year > (year or 2023): score -= 400

        # 5. Episode Count Sanity Check (The "One Piece 230" problem)
        nums = [int(n) for n in re.findall(r'\d+', name + " " + origin)]
        potential_episodes = [n for n in nums if n > 30 and n < 1900]
        max_ep = tmdb_info.get("total_episodes", 0)
        if media_type == "tv" and max_ep > 0 and potential_episodes:
            if any(ep > max_ep * 1.5 + 5 for ep in potential_episodes):
                return -800 # High probability of Anime (1000+ eps) vs Live Action (8 eps)

        # 6. Media Type Match
        is_tv_item = item.get("type") in {"series", "tv", "tvshows"}
        if (media_type == "tv" and is_tv_item) or (media_type == "movie" and not is_tv_item): score += 50
        
        return score

    async def get_formatted_details(self, client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
        path = f"/phim/{slug}"
        data = await self.api_call(client, path)
        if "error" in data or not data.get("status", True): return {"error": "Not found"}
        movie = data.get("movie", {}); episodes = data.get("episodes", [])
        tmdb_data = movie.get("tmdb", {})
        output = {
            "title": movie.get("name"), "origin_name": movie.get("origin_name"), "year": movie.get("year"), "slug": movie.get("slug"),
            "tmdb_id": str(tmdb_data.get("id") or ""), "poster": movie.get("poster_url"), "status": movie.get("status"), "links": []
        }
        merged: Dict[str, Dict] = {}
        for ep_group in episodes:
            sname = ep_group.get("server_name") or "Server"
            if sname not in merged: merged[sname] = {"server_name": sname, "server_data": []}
            for ep in ep_group.get("server_data", []):
                merged[sname]["server_data"].append({"name": ep.get("name"), "m3u8": ep.get("link_m3u8"), "embed": ep.get("link_embed")})
        output["links"] = list(merged.values())
        return output

    async def lookup(self, client: httpx.AsyncClient, tmdb_id: Optional[Any] = None, title: str = None, localize_title: str = None, media_type: str = "movie", season: int = 1, episode: int = None, year: int = None, anchor_slug: str = None, force: bool = False) -> List[Dict[str, Any]]:
        tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else {}
        cache_dir = config.KKPHIM_CACHE if self.provider_name == "kkphim" else config.OPHIM_CACHE
        cache_key = f"macro_{tmdb_id or ''}|{title or ''}|{media_type}|{season or ''}"
        
        if not force:
            cached = cache_manager.get_from_cache(cache_dir, cache_key, 604800)
            if cached: return self._filter_results_for_episode(cached, media_type, episode)

        queries = list(dict.fromkeys([q for q in [title, localize_title] if q]))
        candidates = []
        for q in queries:
            items = await self.search(client, q)
            for item in items:
                score = self._score_search_item(item, q, tmdb_id=tmdb_id, year=year, media_type=media_type, season=season, tmdb_info=tmdb_info)
                if score > 0: candidates.append({"slug": item["slug"], "score": score})
        
        candidates.sort(key=lambda x: x["score"], reverse=True)
        macro_results = []
        seen_slugs = set()
        for c in candidates[:5]:
            if c["slug"] in seen_slugs: continue
            d = await self.get_formatted_details(client, c["slug"])
            if "error" not in d:
                # Re-verify TMDB ID at detail level if present
                if tmdb_id and d.get("tmdb_id") and str(d["tmdb_id"]) != str(tmdb_id): continue
                for server in d.get("links", []):
                    for ep in server.get("server_data", []):
                        macro_results.append({
                            "type": "streamable", "provider": self.provider_name, "server": server["server_name"],
                            "name": ep["name"], "m3u8": ep["m3u8"], "embed": ep["embed"], "episode": season
                        })
                seen_slugs.add(c["slug"])
        
        if macro_results:
            cache_manager.set_to_cache(cache_dir, cache_key, macro_results)
            return self._filter_results_for_episode(macro_results, media_type, episode)
        return []

    def _filter_results_for_episode(self, results: List[Dict], media_type: str, episode: int = None) -> List[Dict]:
        if media_type == "movie" or episode is None: return results
        filtered = []
        for r in results:
            nums = re.findall(r'\d+', r.get("name") or "")
            parsed = int(nums[0]) if nums else None
            if parsed == episode or str(episode) in str(r.get("name") or ""): filtered.append(r)
        return filtered
