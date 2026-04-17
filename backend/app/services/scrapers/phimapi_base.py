import httpx
import json
import os
import re
import unicodedata
import asyncio
from typing import List, Dict, Optional, Any
from app.core import config
from app.services import cache_manager

TMDB_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

def title_to_slug(title: str) -> str:
    """Convert a movie title to a phimapi-style URL slug."""
    # Handle Vietnamese 'đ' → 'd' (NFKD decomposition won't do this)
    t = title.replace('đ', 'd').replace('Đ', 'D')
    # Decompose accented characters then drop combining marks
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    # lowercase, collapse non-alphanumeric runs to a single hyphen
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_str.lower()).strip('-')
    return slug

async def tmdb_search_by_title(client: httpx.AsyncClient, title: str, media_type: str = "tv", is_anime: bool = False) -> Optional[str]:
    """Fallback: search TMDB by title to find tmdb_id."""
    if not TMDB_TOKEN or not title:
        return None
    
    url = f"https://api.themoviedb.org/3/search/{media_type}"
    params = {
        "query": title,
        "language": "en-US",
        "page": 1
    }
    headers = {
        "Authorization": f"Bearer {TMDB_TOKEN}",
        "accept": "application/json"
    }
    
    try:
        resp = await client.get(url, params=params, headers=headers)
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return None
        
        # For anime, prefer results with animation genre (16)
        if is_anime:
            for r in results:
                if 16 in r.get("genre_ids", []):
                    return str(r.get("id"))
        
        # Default: return first result
        return str(results[0].get("id"))
    except Exception as e:
        print(f"TMDB search error: {e}")
    return None

async def tmdb_get_info(client: httpx.AsyncClient, media_type: str, tmdb_id: str) -> Dict[str, Any]:
    """Get detailed info from TMDB."""
    if not TMDB_TOKEN or not tmdb_id:
        return {}
    
    tmdb_type = "movie" if media_type == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}"
    params = {"language": "vi-VN"}
    headers = {
        "Authorization": f"Bearer {TMDB_TOKEN}",
        "accept": "application/json"
    }
    
    try:
        resp = await client.get(url, params=params, headers=headers)
        data = resp.json()
        poster_path = data.get("poster_path")
        
        # Extract seasons for TV shows
        seasons = []
        if tmdb_type == "tv":
            for s in data.get("seasons", []):
                if s.get("season_number", 0) == 0:
                    continue  # Skip "Specials"
                seasons.append({
                    "season_number": s.get("season_number"),
                    "name": s.get("name"),
                    "episode_count": s.get("episode_count", 0)
                })
        
        return {
            "poster": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
            "total_seasons": data.get("number_of_seasons"),
            "total_episodes": data.get("number_of_episodes"),
            "status": data.get("status"),
            "overview": data.get("overview"),
            "tmdb_seasons": seasons if seasons else None
        }
    except Exception as e:
        print(f"TMDB info error: {e}")
    return {}

class PhimAPIBase:
    def __init__(self, provider_name: str, base_url: str):
        self.provider_name = provider_name
        self.base_url = base_url

    async def api_call(self, client: httpx.AsyncClient, path: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        try:
            resp = await client.get(url, params=params, timeout=10)
            return resp.json()
        except Exception as e:
            return {"error": f"API Error ({self.provider_name}): {str(e)}"}

    async def search(self, client: httpx.AsyncClient, keyword: str) -> List[Dict[str, Any]]:
        path = "/v1/api/tim-kiem"
        params = {"keyword": keyword, "limit": 10}
        data = await self.api_call(client, path, params)
        if "error" in data:
            return []
        return data.get("data", {}).get("items", [])

    async def get_details(self, client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
        path = f"/phim/{slug}"
        data = await self.api_call(client, path)
        if "error" in data:
            return data
        
        # OPhim sometimes returns success: False if not found
        if not data.get("status", True):
             return {"error": data.get("msg", "Movie not found")}
        
        return data

    async def get_formatted_details(self, client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
        """Fetch details and format it into a standard structure."""
        data = await self.get_details(client, slug)
        if "error" in data:
            return data
            
        movie = data.get("movie", {})
        if not isinstance(movie, dict):
            return {"error": "Invalid movie data"}
            
        episodes = data.get("episodes", [])
        
        tmdb_data = movie.get("tmdb", {})
        tmdb_id = None
        if isinstance(tmdb_data, dict):
            tmdb_id = str(tmdb_data.get("id")) if tmdb_data.get("id") else None
        
        tmdb_info = {}
        # Fallback: if provider doesn't have tmdb_id, search TMDB by title
        if not tmdb_id and movie.get("type") not in ["movie"]:
            origin_name = movie.get("origin_name") or movie.get("name")
            is_anime = movie.get("type") == "hoathinh"
            tmdb_id = await tmdb_search_by_title(client, origin_name, "tv", is_anime=is_anime)
        
        if tmdb_id:
            tmdb_info = await tmdb_get_info(client, movie.get("type", "movie"), tmdb_id)
        
        poster = tmdb_info.get("poster") or movie.get("poster_url")

        # Extract Season from name
        season = 1
        for text in [movie.get("name", ""), movie.get("origin_name", "")]:
            if text:
                s_match = re.search(r'([Pp]hần|[Ss]eason|[Ss])\s*(\d+)', text, re.IGNORECASE)
                if s_match:
                    season = int(s_match.group(2))
                    break

        output = {
            "title": movie.get("name"),
            "origin_name": movie.get("origin_name"),
            "year": movie.get("year"),
            "slug": movie.get("slug"),
            "tmdb_id": tmdb_id,
            "poster": poster,
            "thumb_url": movie.get("thumb_url") or poster,
            "poster_url": poster,
            "content": movie.get("content") or tmdb_info.get("overview"),
            "time": movie.get("time"),
            "quality": movie.get("quality"),
            "lang": movie.get("lang"),
            "category": movie.get("category", []),
            "actor": movie.get("actor", []),
            "type": movie.get("type"),
            "season": season,
            "total_seasons": tmdb_info.get("total_seasons"),
            "total_episodes": tmdb_info.get("total_episodes"),
            "tmdb_seasons": tmdb_info.get("tmdb_seasons"),
            "overview": movie.get("content") or tmdb_info.get("overview"),
            "links": []
        }
        
        # Merge server entries with the same name (KKPhim often returns the same
        # server twice — one with m3u8 links, one with embed links for identical episodes).
        merged: Dict[str, Dict] = {}   # server_name → {server_data: [...], _ep_index: {name: idx}}
        for ep_group in episodes:
            sname = ep_group.get("server_name") or "Server"
            if sname not in merged:
                merged[sname] = {"server_name": sname, "server_data": [], "_ep_index": {}}

            for ep in ep_group.get("server_data", []):
                name = ep.get("name") or ""
                m3u8  = ep.get("link_m3u8") or ""
                embed = ep.get("link_embed") or ""

                if name in merged[sname]["_ep_index"]:
                    # Episode already exists — fill in any missing link type
                    idx = merged[sname]["_ep_index"][name]
                    existing = merged[sname]["server_data"][idx]
                    if not existing.get("m3u8") and m3u8:
                        existing["m3u8"] = m3u8
                    if not existing.get("embed") and embed:
                        existing["embed"] = embed
                else:
                    idx = len(merged[sname]["server_data"])
                    merged[sname]["_ep_index"][name] = idx
                    merged[sname]["server_data"].append({"name": name, "m3u8": m3u8, "embed": embed})

        for sname, server in merged.items():
            del server["_ep_index"]   # remove internal bookkeeping
            output["links"].append(server)
            
        return output

    def extract_streaming_links(self, details: dict, media_type: str, season: int = None, episode: int = None) -> List[Dict[str, Any]]:
        results = []
        links = details.get("links", [])
        
        for server in links:
            server_name = server.get("server_name")
            server_data = server.get("server_data", [])
            
            for ep in server_data:
                ep_name = ep.get("name")
                m3u8 = ep.get("m3u8")
                embed = ep.get("embed")
                
                is_match = False
                if media_type == "movie":
                    is_match = True
                else:
                    try:
                        nums = re.findall(r'\d+', ep_name or "")
                        current_ep = int(nums[0]) if nums else None
                        
                        if episode is not None:
                            if current_ep == episode:
                                is_match = True
                        else:
                            is_match = True
                    except (ValueError, IndexError):
                        if episode is None:
                            is_match = True
                        elif str(episode) in ep_name:
                            is_match = True

                if is_match and m3u8:   # embed-only entries are not useful for download
                    nums = re.findall(r'\d+', ep_name or "")
                    parsed_ep = int(nums[0]) if nums else None
                    entry: dict = {
                        "type": "streamable",
                        "provider": self.provider_name,
                        "season": season or details.get("season", 1),
                        "episode": parsed_ep,
                        "name": ep_name,
                        "m3u8": m3u8,
                        "server": server_name,
                    }
                    if embed:
                        entry["embed"] = embed   # player can use iframe when available
                    results.append(entry)
        return results

    def _should_skip_item(self, item: Dict, clean_query: str) -> bool:
        """Generic logic to skip irrelevant results (e.g. Live Action when searching for Anime)."""
        name = item.get("name", "").lower()
        origin = item.get("origin_name", "").lower()
        
        # Rule 1: If search query doesn't mention "live action" but result does, skip it.
        if "live action" not in clean_query:
            if "live action" in name or "live action" in origin:
                return True
        return False

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
        
        # 0. Check Cache
        cache_dir = config.KKPHIM_CACHE if self.provider_name == "kkphim" else config.OPHIM_CACHE
        cache_key = f"{tmdb_id or ''}|{title or ''}|{localize_title or ''}|{media_type}|{season or ''}|{episode or ''}|{year or ''}"
        cached = cache_manager.get_from_cache(cache_dir, cache_key, config.DISCOVERY_CACHE_EXPIRE)
        if cached is not None:
            return cached

        async def _try_slug(slug: str, validate_tmdb: bool = False):
            res = await self.get_formatted_details(client, slug)
            if not res or "error" in res or not res.get("title"):
                return None
            # When a tmdb_id was requested, reject slugs that resolve to a different movie
            if validate_tmdb and tmdb_id and res.get("tmdb_id"):
                if str(res.get("tmdb_id")) != str(tmdb_id):
                    return None
            return res

        details = None

        # 2. Direct slug from title
        if not details and title:
            slug = title_to_slug(title)
            if slug:
                details = await _try_slug(slug, validate_tmdb=bool(tmdb_id))

        # 3. Direct slug from localized title
        if not details and localize_title:
            slug = title_to_slug(localize_title)
            if slug:
                details = await _try_slug(slug, validate_tmdb=bool(tmdb_id))

        # 4 & 5. Text search fallback
        if not details:
            search_queries = [q for q in [title, localize_title] if q]
            search_queries = list(dict.fromkeys(search_queries))

            for q in search_queries:
                items = await self.search(client, q)
                if not items:
                    continue
                clean_q = q.lower().strip()

                # a. Match by TMDB ID
                if tmdb_id:
                    for item in items:
                        item_tmdb = item.get("tmdb", {})
                        if item_tmdb and str(item_tmdb.get("id")) == str(tmdb_id):
                            details = await _try_slug(item.get("slug"))
                            if details: break
                    if details: break

                # b. Exact name + year
                for item in items:
                    if self._should_skip_item(item, clean_q):
                        continue
                        
                    name = item.get("name", "").lower().strip()
                    origin = item.get("origin_name", "").lower().strip()
                    item_year = str(item.get("year", ""))
                    if (clean_q == name or clean_q == origin) and year and str(year) == item_year:
                        details = await _try_slug(item.get("slug"))
                        if details: break
                if details: break

                # c. Exact name
                for item in items:
                    if self._should_skip_item(item, clean_q):
                        continue

                    name = item.get("name", "").lower().strip()
                    origin = item.get("origin_name", "").lower().strip()
                    if clean_q == name or clean_q == origin:
                        details = await _try_slug(item.get("slug"))
                        if details: break
                if details: break

                # d. Partial match fallback (Better heuristics)
                for item in items:
                    if self._should_skip_item(item, clean_q):
                        continue
                        
                    name = item.get("name", "").lower().strip()
                    origin = item.get("origin_name", "").lower().strip()
                    # If query is long enough and contained in result name/origin
                    if len(clean_q) > 4 and (clean_q in name or clean_q in origin):
                        details = await _try_slug(item.get("slug"))
                        if details: break
                if details: break

        if not details:
            return []

        results = self.extract_streaming_links(details, media_type, season, episode)
        if results:
            cache_manager.set_to_cache(cache_dir, cache_key, results)
        return results
