import asyncio
import re
import httpx
from typing import List, Dict, Any
import urllib.parse

async def lookup_torrent(title_query: str) -> List[Dict[str, Any]]:
    """Search for Torrent links using multiple reliable Search APIs."""
    results = []
    
    # 1. Bóc tách title
    clean_title = re.sub(r'\(.*?\)', '', title_query).strip()
    
    # Chạy song song 3 API tốt nhất hiện nay
    tasks = [
        lookup_solidtorrents_api(clean_title),
        lookup_apibay_api(clean_title),
        lookup_yts_api(clean_title)
    ]
    
    all_res = await asyncio.gather(*tasks, return_exceptions=True)
    for r in all_res:
        if isinstance(r, list):
            results.extend(r)
            
    # Deduplicate bằng URL
    seen = set()
    final = []
    for r in results:
        if r["url"] not in seen:
            final.append(r)
            seen.add(r["url"])
            
    # Sắp xếp theo mức độ tin cậy (Source API > Scrape)
    return final

async def lookup_solidtorrents_api(q: str) -> List[Dict[str, Any]]:
    """SolidTorrents API - Very reliable general purpose API."""
    try:
        url = f"https://solidtorrents.net/api/v1/search?q={urllib.parse.quote(q)}&category=all&sort=seeders"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("results", [])
                return [{
                    "type": "download", "provider": "torrent",
                    "url": i.get("magnet"),
                    "name": f"SOLID | {i.get('title')}",
                    "size": int(i.get("size", 0)),
                    "source": "solid"
                } for i in items if i.get("magnet")]
    except Exception: pass
    return []

async def lookup_apibay_api(q: str) -> List[Dict[str, Any]]:
    """TPB (Pirate Bay) API via apibay.org."""
    try:
        url = f"https://apibay.org/q.php?q={urllib.parse.quote(q)}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data and isinstance(data, list) and data[0].get("id") != "0":
                    return [{
                        "type": "download", "provider": "torrent",
                        "url": f"magnet:?xt=urn:btih:{i.get('info_hash')}&dn={urllib.parse.quote(i.get('name'))}",
                        "name": f"TPB | {i.get('name')}",
                        "size": int(i.get("size", 0)),
                        "source": "apibay"
                    } for i in data[:15]]
    except Exception: pass
    return []

async def lookup_yts_api(q: str) -> List[Dict[str, Any]]:
    """YTS API - Best for high quality movies (YIFY)."""
    try:
        url = f"https://yts.mx/api/v2/list_movies.json?query_term={urllib.parse.quote(q)}&sort_by=seeds"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                movies = data.get("data", {}).get("movies", [])
                results = []
                for m in movies:
                    for tor in m.get("torrents", []):
                        quality = tor.get("quality")
                        info_hash = tor.get("hash")
                        if info_hash:
                            magnet = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote(m.get('title'))}"
                            results.append({
                                "type": "download", "provider": "torrent",
                                "url": magnet,
                                "name": f"YTS | {m.get('title')} [{quality}]",
                                "size": int(tor.get("size_bytes", 0)),
                                "source": "yts"
                            })
                return results
    except Exception: pass
    return []
