import re
import asyncio
import json
from datetime import datetime
from typing import List, Dict, Optional, Any
import httpx
from app.core import config
from app.services.cache_manager import get_from_cache, set_to_cache

_SEARCH_API    = "https://timfshare.com/api/v1/string-query-search"
_CACHE_FILE    = config.TIMFSHARE_CACHE
_CACHE_TTL     = config.TIMFSHARE_CACHE_TTL

_HEADERS = {
    "User-Agent": config.FSHARE_USER_AGENT,
    "Accept": "application/json, text/plain, */*",
}

def _parse_quality(text: str) -> str:
    t = text.upper()
    if '2160P' in t or '4K' in t: return '4K'
    if 'REMUX' in t: return 'Remux'
    if '1080P' in t: return '1080p'
    if '720P' in t: return '720p'
    return 'HD'

def _format_size(size_bytes: int) -> str:
    if size_bytes >= 1024 ** 3: return f"{size_bytes / 1024**3:.2f} GB"
    if size_bytes >= 1024 ** 2: return f"{size_bytes / 1024**2:.0f} MB"
    return f"{size_bytes / 1024:.0f} KB"

def _keywords(text: str) -> set:
    words = re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split()
    return {w for w in words if len(w) >= 3}

def _is_relevant(name: str, title: str, year: Optional[str] = None, media_type: str = "movie", tmdb_info: Dict[str, Any] = {}, modified_date: Optional[str] = None) -> bool:
    name_lower = name.lower(); title_lower = title.lower()
    if any(name_lower.endswith(ext) for ext in {'.txt', '.pdf', '.exe', '.lnk', '.url'}): return False
    
    # 1. Temporal Alignment
    if modified_date and tmdb_info.get("release_date"):
        try:
            # FShare modified date is usually YYYY-MM-DD HH:MM:SS
            mod_year = int(modified_date.split('-')[0])
            rel_year = int(tmdb_info["release_date"].split('-')[0])
            if mod_year < rel_year: return False # Uploaded before release? Skip.
        except: pass

    # 2. Number Semantic Analysis
    nums = [int(n) for n in re.findall(r'\d+', name)]
    potential_years = [n for n in nums if 1900 <= n <= 2030]
    potential_episodes = [n for n in nums if n > 30 and n not in potential_years]
    
    # If TMDB says it's a Live Action with few episodes, but file has a large episode number (e.g. 230)
    if media_type == "tv" and tmdb_info.get("total_episodes"):
        max_ep = tmdb_info["total_episodes"]
        if potential_episodes and any(ep > max_ep * 1.5 + 5 for ep in potential_episodes):
            return False

    # 3. Year Filter
    if year:
        year_val = int(year)
        if potential_years:
            if media_type == "movie" and year_val not in potential_years: return False
            if media_type == "tv" and not any(abs(y - year_val) <= 1 for y in potential_years): return False

    # 4. Keyword Match
    title_kw = _keywords(title); name_kw = _keywords(name); overlap = title_kw & name_kw
    return (len(overlap) / len(title_kw)) >= 0.7 if title_kw else True

def _make_result(item: dict, source: str, media_type: str = "movie") -> Optional[Dict]:
    name = item.get("name", "").strip(); url = item.get("url", "").split("?")[0]
    if not name or not url: return None
    quality = _parse_quality(name); is_folder = "folder" in url.lower()
    return {
        "url": url, "name": name, "source": source, "provider": "fshare",
        "type": "downloadable", "media_type": "tv" if is_folder else media_type,
        "quality": quality, "size": _format_size(item.get("size", 0)), "is_folder": is_folder,
        "updated_at": item.get("modified")
    }

async def lookup_timfshare(query: str, year: Optional[str] = None, season: Optional[int] = None, episode: Optional[int] = None, filter_title: Optional[str] = None, media_type: str = "movie", tmdb_info: Dict[str, Any] = {}) -> List[Dict]:
    cache_key = f"timfshare_{query.strip().lower()}|{year or ''}|{media_type}"
    cached = get_from_cache(_CACHE_FILE, cache_key, _CACHE_TTL)
    if cached is not None: return cached
    
    async with httpx.AsyncClient(headers=_HEADERS, timeout=15.0) as client:
        try:
            resp = await client.post(_SEARCH_API, params={"query": query})
            raw_items = resp.json().get("data", []) if resp.status_code == 200 else []
        except: raw_items = []
        
    results = []; seen = set(); rel_title = filter_title or query
    for item in raw_items:
        url = item.get("url", "").split("?")[0]
        if not url or url in seen: continue
        if not _is_relevant(item.get("name", ""), rel_title, year, media_type, tmdb_info, item.get("modified")): continue
        res = _make_result(item, "timfshareapi", media_type)
        if res: results.append(res); seen.add(url)
        
    if results: set_to_cache(_CACHE_FILE, cache_key, results)
    return results

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict]:
    if "/folder/" not in url:
        return [{"name": url.split("/")[-1], "url": url, "is_folder": False}]
    try:
        linkcode = url.strip('/').split('/')[-1]
        api_url = "https://www.fshare.vn/api/v3/files/folder"
        resp = await client.get(api_url, params={"linkcode": linkcode, "sort": "name"}, headers=_HEADERS, timeout=15.0)
        if resp.status_code != 200: return []
        data = resp.json()
        results = []
        for item in data:
            is_f = item.get("type") == "folder"
            results.append({
                "name": item.get("name"), "url": f"https://www.fshare.vn/{'folder' if is_f else 'file'}/{item.get('linkcode')}",
                "is_folder": is_f, "size": int(item.get("size") or 0), "updated_at": item.get("modified")
            })
        return results
    except: return []
