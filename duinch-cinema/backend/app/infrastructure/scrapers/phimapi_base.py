import httpx
import json
import os
import re
import asyncio
from typing import List, Dict, Optional, Any
from app.core import config
from app.core.text_utils import normalize_text, check_identity_leakage
from app.domain.models.tmdb import TMDBInfo, TMDBSeason
from app.domain.models.media import ScraperEpisode

def is_supported_lang(text: str) -> bool:
    """Check if the text is primarily English or Vietnamese."""
    if not text: return False
    vi_pattern = r'^[a-zA-Z0-9\s.,!?:;\-\(\)àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+$'
    return bool(re.match(vi_pattern, text))

async def tmdb_get_info(client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> TMDBInfo:
    """Fetch metadata from TMDB with robust fallback and multi-language support."""
    token = config.TMDB_READ_ACCESS_TOKEN or os.getenv("TMDB_READ_ACCESS_TOKEN")
    if not token or not tmdb_id: return TMDBInfo()
    
    tmdb_type = "movie" if media_type == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}"
    headers = {"Authorization": f"Bearer {token}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, params={"language": "vi-VN"}, headers=headers)
        data = resp.json()
        if resp.status_code != 200 or not data.get("id"):
            resp = await client.get(url, params={"language": "en-US"}, headers=headers)
            data = resp.json()
            
        if resp.status_code != 200: return TMDBInfo()

        raw_date = data.get("release_date") or data.get("first_air_date") or ""
        series_year = int(raw_date[:4]) if raw_date[:4].isdigit() else 0
        
        seasons = []
        season_years = {}
        if tmdb_type == "tv":
            for s in (data.get("seasons") or []):
                s_num = s.get("season_number", 0)
                if s_num == 0: continue
                s_date = s.get("air_date") or ""
                s_year = int(s_date[:4]) if s_date[:4].isdigit() else 0
                seasons.append(TMDBSeason(
                    season_number=s_num, 
                    episode_count=s.get("episode_count", 0), 
                    year=s_year
                ))
                season_years[s_num] = s_year
        
        # Fetch Alternative Titles
        alt_titles = []
        try:
            alt_url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}/alternative_titles"
            alt_resp = await client.get(alt_url, headers=headers)
            if alt_resp.status_code == 200:
                alt_data = alt_resp.json()
                alt_list = alt_data.get("results" if tmdb_type == "tv" else "titles", [])
                alt_titles = [t.get("title") for t in alt_list if t.get("title")]
        except Exception: pass

        # Include original title and name in alternative titles for broader matching
        main_title = data.get("name") or data.get("title")
        orig_title = data.get("original_name") or data.get("original_title")
        if main_title: alt_titles.append(main_title)
        if orig_title: alt_titles.append(orig_title)
        alt_titles = list(dict.fromkeys(alt_titles)) # Deduplicate

        return TMDBInfo(
            series_year=series_year,
            season_years=season_years,
            tmdb_seasons=seasons,
            total_episodes=data.get("number_of_episodes", 0),
            total_seasons=data.get("number_of_seasons", 0),
            title=main_title,
            alternative_titles=alt_titles
        )
    except Exception: return TMDBInfo()

def safe_int(value: Any, default: int = 0) -> int:
    """Safely convert value to int, extracting numeric part if it's a string."""
    if value is None: return default
    if isinstance(value, int): return value
    try:
        if isinstance(value, str):
            match = re.search(r'\d+', value)
            if match: return int(match.group())
        return int(value)
    except (ValueError, TypeError):
        return default

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

    def _get_season_from_episode(self, ep_num: int, tmdb_seasons: List[TMDBSeason]) -> Optional[int]:
        if not tmdb_seasons: return None
        current_total = 0
        for s in tmdb_seasons:
            count = s.episode_count
            if current_total < ep_num <= (current_total + count): return s.season_number
            current_total += count
        return None

    def _detect_season(self, name: str, origin_name: str, year: int, tmdb_info: TMDBInfo, slug: str = "") -> Optional[int]:
        """Intelligently detect season from Title Regex, Slug, OR Year matching."""
        full_text = f"{name} {origin_name} {slug}".lower().replace("-", " ")
        
        s_match = re.search(r'(phần|season|ss|p)\s*(\d+)', full_text, re.IGNORECASE)
        if s_match: return int(s_match.group(2))
        
        trail_match = re.search(r'\s(\d+)$', name.strip())
        if trail_match:
            val = int(trail_match.group(1))
            if 1 <= val <= 30: return val

        if year > 0 and tmdb_info.season_years:
            for s_num, s_year in tmdb_info.season_years.items():
                if s_year > 0 and abs(year - s_year) == 0: return s_num
            for s_num, s_year in tmdb_info.season_years.items():
                if s_year > 0 and abs(year - s_year) <= 1: return s_num
            max_season = max(tmdb_info.season_years.keys()) if tmdb_info.season_years else 1
            if year >= (tmdb_info.series_year + max_season - 1):
                return max_season
        return None

    def _score_search_item(self, item: Dict, query: str, tmdb_id: Optional[str], year: Optional[int], media_type: str, requested_season: int, tmdb_info: TMDBInfo, is_search_phase: bool = False) -> int:
        score = 0
        if not item: return -1000
        n_name, n_origin = normalize_text(item.get("name")), normalize_text(item.get("origin_name"))
        s_type = str(item.get("type") or "").lower()
        s_year = safe_int(item.get("year"))

        # 1. TMDB ID MATCH & REALITY CHECK
        src_tmdb = item.get("tmdb") or {}
        item_tmdb_id = str(src_tmdb.get("id")) if src_tmdb.get("id") else None
        tmdb_matched = False
        if tmdb_id and item_tmdb_id and item_tmdb_id not in ["0", "null", "None"]:
            if item_tmdb_id == str(tmdb_id):
                series_start = tmdb_info.series_year or year or 0
                if series_start > 0 and s_year > 0:
                    all_y = [series_start] + list(tmdb_info.season_years.values())
                    # Allow 10 years gap for series start, OR if it matches any season year
                    year_ok = abs(s_year - series_start) <= 10 or any(abs(s_year - y) <= 1 for y in all_y if y > 0)
                    if not year_ok:
                        return -5000 
                score += 3000
                tmdb_matched = True
            else:
                return -5000 

        # 2. TYPE CHECK
        if not tmdb_matched:
            CLEAR_MOVIE_TYPES = {"single", "movie"}
            CLEAR_TV_TYPES    = {"series", "tvshows", "tv"}
            if media_type == "movie" and s_type in CLEAR_TV_TYPES:   return -3000
            if media_type == "tv"    and s_type in CLEAR_MOVIE_TYPES: return -3000
            if s_type not in CLEAR_MOVIE_TYPES | CLEAR_TV_TYPES:
                ep_current   = str(item.get("episode_current") or "").strip().lower()
                ep_total     = safe_int(item.get("episode_total"))
                is_movie_like = (ep_current in ("full", "1") or ep_total == 1)
                is_tv_like    = not is_movie_like and (ep_total > 1 or (ep_current and ep_current not in ("full", "1")))
                if media_type == "movie" and is_tv_like:   return -3000
                if media_type == "tv"    and is_movie_like: return -3000

        # 3. SMART YEAR MATCH
        series_start = tmdb_info.series_year or year or 0
        all_y = [series_start] + list(tmdb_info.season_years.values())
        if s_year > 0 and series_start > 0:
            if media_type == "movie":
                if abs(s_year - series_start) > 1: return -3000
                score += 600
            else:
                diff_to_start = abs(s_year - series_start)
                season_year_for_req = tmdb_info.season_years.get(requested_season, 0)
                if season_year_for_req > 0:
                    if abs(s_year - season_year_for_req) > 2: return -4000
                    score += 600
                else:
                    if requested_season == 1 and diff_to_start > 2:
                        matches_any_season = any(abs(s_year - y) <= 1 for y in all_y if y > 0)
                        if not matches_any_season: return -4000
                        else: score -= 1000
                    if any(abs(s_year - y) <= 1 for y in all_y if y > 0): score += 500
                    elif s_year >= series_start: score += 100
                    else: return -3000

        # 4. SANITY CHECKS (EPISODES & SEASONS)
        ep_total = safe_int(item.get("episode_total"))
        if tmdb_info and tmdb_info.total_episodes > 0 and ep_total > 0:
            if ep_total > (tmdb_info.total_episodes * 1.3):
                return -4500 

        found_s = self._detect_season(item.get("name", ""), item.get("origin_name", ""), s_year, tmdb_info)
        if found_s and tmdb_info and tmdb_info.total_seasons > 0:
            if found_s > tmdb_info.total_seasons:
                return -4600

        if found_s:
            if requested_season is None: score += 500
            elif found_s == requested_season: score += 500
            else: return -5000

        # 5. GENERAL IDENTITY MATCH (Token Difference Approach)
        if not tmdb_matched:
            # We pass year and season to ignore them in the difference check
            if check_identity_leakage(item.get("name", ""), query, ignore_year=s_year, ignore_season=found_s) and \
               check_identity_leakage(item.get("origin_name", ""), query, ignore_year=s_year, ignore_season=found_s):
                return -4800 # Identity mismatch (e.g. Sequel/Live Action found for Base series)

        # 6. TITLE SCORE
        n_query = normalize_text(query)
        if n_query == n_name or n_query == n_origin: score += 1000
        elif n_query in n_name or n_query in n_origin: score += 500
        else: 
            if not item_tmdb_id or item_tmdb_id == "0": return -2000

        return score

    async def lookup(self, client: httpx.AsyncClient, tmdb_id: Optional[Any] = None, title: str = None, localize_title: str = None, media_type: str = "movie", season: int = None, episode: int = None, year: int = None, force: bool = False, tmdb_info: Optional[TMDBInfo] = None) -> List[ScraperEpisode]:
        req_season = season
        if not tmdb_info:
            tmdb_info = await tmdb_get_info(client, media_type, str(tmdb_id)) if tmdb_id else TMDBInfo(series_year=int(year) if year else 0)
        all_results, seen_keys, seen_slugs = [], set(), set()

        async def _process_slug(slug: str, assigned_season: Optional[int] = None):
            if not slug or slug in seen_slugs: return
            seen_slugs.add(slug)
            details = await self.get_details(client, slug)
            if not details: return
            movie = details.get("movie") or {}
            movie_name = movie.get("name") or movie.get("origin_name") or "Unknown"
            s_year = safe_int(movie.get("year"))
            
            # Actual ep count check
            actual_ep_count = 0
            seen_u_in_slug = set()
            for srv in (details.get("episodes") or []):
                for ep_data in (srv.get("server_data") or []):
                    u = ep_data.get("link_m3u8") or ep_data.get("link_embed")
                    if u and u not in seen_u_in_slug:
                        actual_ep_count += 1
                        seen_u_in_slug.add(u)
            if tmdb_info and tmdb_info.total_episodes > 0 and actual_ep_count > (tmdb_info.total_episodes * 1.5):
                return

            current_s = self._detect_season(movie.get("name", ""), movie.get("origin_name", ""), s_year, tmdb_info, slug)
            if not current_s: current_s = assigned_season
            
            if self._score_search_item(movie, title or "", tmdb_id, year, media_type, req_season, tmdb_info) >= 1000:
                for server in (details.get("episodes") or []):
                    sname = server.get("server_name", "Server")
                    for ep in (server.get("server_data") or []):
                        u = ep.get("link_m3u8") or ep.get("link_embed")
                        if u:
                            rs = current_s or assigned_season
                            ename = str(ep.get("name") or "")
                            if not rs:
                                es_match = re.search(r'(phần|season|ss|p|s)\s*(\d+)', ename, re.IGNORECASE)
                                if es_match: rs = int(es_match.group(2))
                            
                            # SMART EPISODE EXTRACTOR (Weakness #3 Fix)
                            # 1. Clean ename from year and season numbers
                            clean_ename = normalize_text(ename)
                            if s_year > 0: clean_ename = clean_ename.replace(str(s_year), "")
                            if rs: clean_ename = clean_ename.replace(f"mua {rs}", "").replace(f"p{rs}", "").replace(f"s{rs}", "")
                            epm = re.search(r'(?:tap|episode|ep|e|t)\s*(\d+)', clean_ename, re.IGNORECASE)
                            num = int(epm.group(1)) if epm else int(re.search(r'(\d+)', clean_ename).group(1)) if re.search(r'(\d+)', clean_ename) else 1
                            
                            # FORCE TMDB SEASON MAPPING FOR TV SHOWS
                            # Use TMDB metadata as the single source of truth for season structure.
                            if media_type == 'tv' and tmdb_info.tmdb_seasons:
                                mapped_s = self._get_season_from_episode(num, tmdb_info.tmdb_seasons)
                                if mapped_s:
                                    # Case 1: No explicit season in title -> Use absolute mapping
                                    if current_s is None:
                                        rs = mapped_s
                                    else:
                                        # Case 2: Explicit season in title, but number is too large 
                                        # (e.g. "Mùa 1" but "Tập 100") -> It's an absolute number
                                        detected_s_info = next((s for s in tmdb_info.tmdb_seasons if s.season_number == current_s), None)
                                        if detected_s_info and num > detected_s_info.episode_count:
                                            rs = mapped_s

                            if media_type == 'tv' and req_season is not None and rs is not None and rs != req_season:
                                continue

                            key = (u, rs, ename)
                            if key not in seen_keys:
                                all_results.append(ScraperEpisode(
                                    provider=self.provider_name.upper(), server=sname, name=ename, 
                                    m3u8=ep.get("link_m3u8"), embed=ep.get("link_embed"), season=rs,
                                    movie_name=movie_name, slug=slug
                                ))
                                seen_keys.add(key)

        keywords = [q for q in [localize_title, title, tmdb_info.title if tmdb_info else None] if q and is_supported_lang(q)]
        keywords = list(dict.fromkeys(keywords))
        for kw in keywords:
            search_data = await self.api_call(client, "/v1/api/tim-kiem", params={"keyword": kw, "limit": 20})
            items = (search_data.get("data") or {}).get("items") or []
            for item in items:
                if self._score_search_item(item, kw, tmdb_id, year, media_type, req_season, tmdb_info, is_search_phase=True) >= 400:
                    s_year = safe_int(item.get("year"))
                    is_ = self._detect_season(item.get("name", ""), item.get("origin_name", ""), s_year, tmdb_info)
                    await _process_slug(item.get("slug"), is_)
                    await asyncio.sleep(0.05)

        if tmdb_id and (not all_results or media_type == 'tv'):
            res = await self.get_by_tmdb(client, media_type, str(tmdb_id))
            if res and res.get("status") is True: 
                slug = (res.get("movie") or {}).get("slug")
                if slug:
                    details = await self.get_details(client, slug)
                    if details:
                        movie = details.get("movie") or {}
                        s_year = safe_int(movie.get("year"))
                        detected_s = self._detect_season(movie.get("name", ""), movie.get("origin_name", ""), s_year, tmdb_info)
                        await _process_slug(slug, detected_s or req_season)
        return all_results
