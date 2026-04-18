import httpx
import re
import asyncio
from typing import List, Dict, Optional, Any
from app.services import cache_manager
from app.core import config

def _is_relevant(name: str, title: str, year: Optional[str] = None, media_type: str = "movie", tmdb_info: Dict[str, Any] = {}) -> bool:
    name_lower = name.lower(); title_lower = title.lower()
    if any(x in name_lower for x in ['porn', 'xxx', 'hentai', 'sexy', 'cam']): return False
    
    # 1. Number Semantic Analysis
    nums = [int(n) for n in re.findall(r'\d+', name)]
    potential_years = [n for n in nums if 1900 <= n <= 2030]
    potential_episodes = [n for n in nums if n > 30 and n not in potential_years]
    
    # Episode count sanity check
    if media_type == "tv" and tmdb_info.get("total_episodes"):
        max_ep = tmdb_info["total_episodes"]
        if potential_episodes and any(ep > max_ep * 1.5 + 5 for ep in potential_episodes):
            return False

    # 2. Year Filter
    if year:
        year_val = int(year)
        if potential_years:
            if media_type == "movie" and year_val not in potential_years: return False
            if media_type == "tv" and not any(abs(y - year_val) <= 1 for y in potential_years): return False

    # 3. Simple Keyword Check
    title_words = [w for w in re.sub(r'[^a-z0-9]', ' ', title_lower).split() if len(w) > 3]
    match_count = sum(1 for w in title_words if w in name_lower)
    return match_count >= min(len(title_words), 2) if title_words else True

def _parse_quality(text: str) -> str:
    t = text.upper()
    if '2160P' in t or '4K' in t: return '4K'
    if 'REMUX' in t: return 'Remux'
    if '1080P' in t: return '1080p'
    if '720P' in t: return '720p'
    return 'HD'

async def lookup_torrent(title: str, tmdb_id: Optional[int] = None, media_type: str = "movie", season: Optional[int] = None, episode: Optional[int] = None, year: Optional[str] = None, tmdb_info: Dict[str, Any] = {}) -> List[Dict]:
    cache_key = f"torrent_{title}_{tmdb_id or ''}_{season or ''}_{episode or ''}_{year or ''}"
    cached = cache_manager.get_from_cache(config.TORRENT_CACHE, cache_key, 86400)
    if cached is not None: return cached

    results = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(f"https://apibay.org/q.php?q={title}")
            items = resp.json() if resp.status_code == 200 else []
        except: items = []

    for item in items:
        if item.get("id") == "0": continue
        name = item.get("name", "")
        if not _is_relevant(name, title, year, media_type, tmdb_info): continue
        
        quality = _parse_quality(name)
        results.append({
            "url": f"magnet:?xt=urn:btih:{item.get('info_hash')}&dn={name}",
            "name": name, "size": int(item.get("size", 0)), "seeders": int(item.get("seeders", 0)),
            "leechers": int(item.get("leechers", 0)), "quality": quality, "source": "apibay",
            "info_hash": item.get("info_hash"), "num_files": int(item.get("num_files", 1))
        })
    
    results.sort(key=lambda x: (x['seeders'], x['quality'] == '4K', x['quality'] == '1080p'), reverse=True)
    if results: cache_manager.set_to_cache(config.TORRENT_CACHE, cache_key, results)
    return results
