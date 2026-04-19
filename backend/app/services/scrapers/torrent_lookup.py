import asyncio
import re
import httpx
from typing import List, Dict, Any, Optional
import urllib.parse
from app.core import config

def is_english_like(text: str) -> bool:
    try:
        text.encode('ascii')
        return True
    except UnicodeEncodeError:
        return False

async def get_english_title(client: httpx.AsyncClient, tmdb_id: int, media_type: str) -> Optional[str]:
    if not config.TMDB_READ_ACCESS_TOKEN or not tmdb_id: return None
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        return data.get("name") if media_type == "tv" else data.get("title")
    except Exception: return None

def _strict_filter(items: List[Dict], year: Optional[str], media_type: str) -> List[Dict]:
    """Strictly filter results by year and simple media type heuristics."""
    filtered = []
    for item in items:
        name = item.get("name", "").lower()
        
        # 1. Year Check
        if year:
            year_match = re.search(r'(?:\D|^)(19\d{2}|20\d{2})(?:\D|$)', name)
            if year_match:
                # Only reject if year exists in name AND it's wrong
                if year_match.group(1) != str(year):
                    continue

        # 2. Media Type Heuristics
        is_tv_link = any(x in name for x in ["s0", "s1", "s2", "season", "complete", "ep0", "ep1"])
        if media_type == "tv" and not is_tv_link and "movie" in name: continue
        if media_type == "movie" and is_tv_link: continue
        
        filtered.append(item)
    return filtered

async def lookup_torrent(title: str, tmdb_id: Optional[int] = None, media_type: str = "movie", season: Optional[int] = None, episode: Optional[int] = None, year: Optional[str] = None, tmdb_info: Dict = {}) -> List[Dict[str, Any]]:
    results = []
    search_title = title
    
    if not is_english_like(title) and tmdb_id:
        async with httpx.AsyncClient(timeout=10.0) as client:
            eng_title = await get_english_title(client, tmdb_id, media_type)
            if eng_title: search_title = eng_title

    def _build_query(base: str) -> str:
        clean_base = re.sub(r'\(.*?\)', '', base).strip()
        parts = [clean_base]
        if year: parts.append(str(year))
        return " ".join(parts)

    final_query = _build_query(search_title)
    tasks = [lookup_solidtorrents_api(final_query), lookup_apibay_api(final_query), lookup_yts_api(final_query)]
    
    all_res = await asyncio.gather(*tasks, return_exceptions=True)
    for r in all_res:
        if isinstance(r, list): results.extend(r)
            
    # Apply Strict Filter
    results = _strict_filter(results, year, media_type)

    seen = set()
    final = []
    for r in results:
        if r["url"] not in seen:
            final.append(r)
            seen.add(r["url"])
    return final

async def lookup_solidtorrents_api(q: str) -> List[Dict[str, Any]]:
    try:
        url = f"https://solidtorrents.net/api/v1/search?q={urllib.parse.quote(q)}&category=all&sort=seeders"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return [{
                    "type": "downloadable", "provider": "torrent", "source": "solid",
                    "url": i.get("magnet"), "name": f"SOLID | {i.get('title')}", "size": int(i.get("size", 0))
                } for i in resp.json().get("results", []) if i.get("magnet")]
    except Exception: pass
    return []

async def lookup_apibay_api(q: str) -> List[Dict[str, Any]]:
    try:
        url = f"https://apibay.org/q.php?q={urllib.parse.quote(q)}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data and isinstance(data, list) and data[0].get("id") != "0":
                    return [{
                        "type": "downloadable", "provider": "torrent", "source": "apibay",
                        "url": f"magnet:?xt=urn:btih:{i.get('info_hash')}&dn={urllib.parse.quote(i.get('name'))}",
                        "name": f"TPB | {i.get('name')}", "size": int(i.get("size", 0))
                    } for i in data[:15]]
    except Exception: pass
    return []

async def lookup_yts_api(q: str) -> List[Dict[str, Any]]:
    try:
        url = f"https://yts.mx/api/v2/list_movies.json?query_term={urllib.parse.quote(q)}&sort_by=seeds"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                movies = resp.json().get("data", {}).get("movies", [])
                results = []
                for m in movies:
                    for tor in m.get("torrents", []):
                        if tor.get("hash"):
                            results.append({
                                "type": "downloadable", "provider": "torrent", "source": "yts",
                                "url": f"magnet:?xt=urn:btih:{tor['hash']}&dn={urllib.parse.quote(m['title'])}",
                                "name": f"YTS | {m['title']} [{tor.get('quality')}]", "size": int(tor.get("size_bytes", 0))
                            })
                return results
    except Exception: pass
    return []
