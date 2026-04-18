import asyncio
import re
import httpx
from typing import List, Dict, Any, Optional
import urllib.parse
from app.core import config
from app.services import cache_manager

def is_english_like(text: str) -> bool:
    """Check if the text consists mostly of ASCII characters (no accents)."""
    try:
        text.encode('ascii')
        return True
    except UnicodeEncodeError:
        return False

async def get_english_title(client: httpx.AsyncClient, tmdb_id: int, media_type: str) -> Optional[str]:
    """Fetch the English title from TMDB."""
    if not config.TMDB_READ_ACCESS_TOKEN or not tmdb_id:
        return None
        
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    
    try:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        # 'name' for TV, 'title' for Movie
        return data.get("name") if media_type == "tv" else data.get("title")
    except Exception:
        return None

def _is_relevant(name: str, title: str, media_type: str = "movie") -> bool:
    """
    Check if a torrent name is actually relevant to the search title.
    Focus on word-based exact matches for short titles (like 'The Boys').
    """
    def get_words(text: str) -> set:
        # Lowercase, keep letters/numbers, split by non-alphanumeric
        clean = re.sub(r'[^a-z0-9\s]', ' ', text.lower())
        # Filter out common video tech terms and short filler
        stops = {'1080p', '720p', '2160p', '4k', 'uhd', 'remux', 'web', 'dl', 'h264', 'x264', 'h265', 'x265', 'aac', 'ddp5', 'bluray', 'brrip', 'dvdrip'}
        return {w for w in clean.split() if w not in stops and len(w) > 1}

    title_words = get_words(title)
    name_words = get_words(name)
    
    if not title_words: return True
    
    # Check if ALL title words are present in the name
    if not title_words.issubset(name_words):
        return False
        
    return True

def _score_torrent(item: Dict[str, Any], title: str) -> float:
    """Calculate a relevance/quality score for sorting."""
    score = 0.0
    
    # 1. Title match boost
    name = item.get("name", "").lower()
    clean_title = title.lower()
    if clean_title in name:
        score += 100
        # Check if it starts with the title (better)
        if name.split("|")[-1].strip().startswith(clean_title):
            score += 50

    # 2. Quality boost
    quality_map = {'4K': 40, 'Remux': 35, '1080p': 30, '720p': 20, 'HD': 10, 'CAM': -50}
    score += quality_map.get(item.get("quality", "HD"), 0)
    
    # 3. Seeders boost (Logarithmic)
    import math
    seeds = item.get("seeders", 0)
    if seeds > 0:
        score += math.log2(seeds) * 5
        
    # 4. Penalty for fake files
    size_gb = item.get("size", 0) / (1024**3)
    if item.get("quality") in ["4K", "1080p"] and size_gb < 0.3:
        score -= 200

    return score

async def lookup_torrent(
    title: str, 
    tmdb_id: Optional[int] = None, 
    media_type: str = "movie",
    season: Optional[int] = None,
    episode: Optional[int] = None,
    year: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Search for Torrent links using multiple reliable Search APIs.
    Ensures that for torrents, we search using an English-friendly query.
    """
    cache_key = f"{title.strip().lower()}|{tmdb_id or ''}|{media_type}|{season or ''}|{episode or ''}|{year or ''}"
    cached = cache_manager.get_from_cache(config.TORRENT_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached is not None:
        return cached

    results = []
    
    # 1. Decide which title to use
    search_title = title
    
    # If title is not English-like and we have a tmdb_id, try to get English title
    if not is_english_like(title) and tmdb_id:
        async with httpx.AsyncClient(timeout=10.0) as client:
            eng_title = await get_english_title(client, tmdb_id, media_type)
            if eng_title:
                search_title = eng_title

    # 2. Build the final query string
    def _build_query(base: str) -> str:
        clean_base = re.sub(r'\(.*?\)', '', base).strip()
        parts = [clean_base]
        
        # Logic: 
        # - For movies: Always include year.
        # - For TV shows: 
        #   - If looking for a specific episode/season: Skip year (better for long-running shows like One Piece).
        #   - If looking for the whole series (no season/episode): Include year to disambiguate.
        
        if media_type == "movie" and year:
            parts.append(str(year))
            
        if season and episode:
            parts.append(f"S{season:02d}E{episode:02d}")
        elif season:
            parts.append(f"Season {season}")
        elif media_type == "tv" and year:
            parts.append(str(year))
            
        return " ".join(parts)

    final_query = _build_query(search_title)
    
    # 3. Parallel Search
    tasks = [
        lookup_solidtorrents_api(final_query),
        lookup_apibay_api(final_query),
        lookup_yts_api(final_query)
    ]
    
    all_res = await asyncio.gather(*tasks, return_exceptions=True)
    for r in all_res:
        if isinstance(r, list):
            results.extend(r)
            
    # Deduplicate and Filter
    seen = set()
    scored_results = []
    for r in results:
        if r["url"] in seen:
            continue
        
        name = r.get("name", "")
        # Apply strict relevance filter
        if not _is_relevant(name, search_title, media_type):
            continue

        # Infer actual media type
        name_low = name.lower()
        actual_type = media_type
        if re.search(r's\d{1,2}e\d{1,3}|tập\s*\d+|ep\s*\d+', name_low):
            actual_type = "tv"
        elif "[pack]" in name_low or "season" in name_low:
            actual_type = "tv"
        
        r["media_type"] = actual_type
        
        # Calculate score for sorting
        r["_score"] = _score_torrent(r, search_title)
        scored_results.append(r)
        seen.add(r["url"])
            
    # Sort by score descending
    scored_results.sort(key=lambda x: x["_score"], reverse=True)
    
    # Remove temporary score key
    for r in scored_results:
        r.pop("_score", None)

    if scored_results:
        cache_manager.set_to_cache(config.TORRENT_CACHE, cache_key, scored_results)
    return scored_results

def _parse_quality(name: str) -> str:
    n = name.upper()
    if '2160P' in n or '4K' in n or 'UHD' in n: return '4K'
    if 'REMUX' in n: return 'Remux'
    if '1080P' in n: return '1080p'
    if '720P' in n: return '720p'
    if '480P' in n: return '480p'
    if 'HDCAM' in n or 'TELESYNC' in n or '.TS.' in n or 'HDTS' in n: return 'CAM'
    return 'HD'


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
                    "type": "downloadable", "provider": "torrent",
                    "url": i.get("magnet"),
                    "name": f"SOLID | {i.get('title')}",
                    "size": int(i.get("size", 0)),
                    "seeders": int(i.get("swarm", {}).get("seeders", 0)),
                    "leechers": int(i.get("swarm", {}).get("leechers", 0)),
                    "quality": _parse_quality(i.get("title", "")),
                    "num_files": len(i.get("files", [])) or None,
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
                        "type": "downloadable", "provider": "torrent",
                        "url": f"magnet:?xt=urn:btih:{i.get('info_hash')}&dn={urllib.parse.quote(i.get('name', ''))}",
                        "name": f"TPB | {i.get('name')}",
                        "size": int(i.get("size", 0)),
                        "seeders": int(i.get("seeders", 0)),
                        "leechers": int(i.get("leechers", 0)),
                        "quality": _parse_quality(i.get("name", "")),
                        "num_files": int(i.get("num_files", 0)) or None,
                        "info_hash": i.get("info_hash"),
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
                        info_hash = tor.get("hash")
                        if info_hash:
                            quality = tor.get("quality", "HD")
                            magnet = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote(m.get('title', ''))}"
                            results.append({
                                "type": "downloadable", "provider": "torrent",
                                "url": magnet,
                                "name": f"YTS | {m.get('title')} [{quality}]",
                                "size": int(tor.get("size_bytes", 0)),
                                "seeders": int(tor.get("seeds", 0)),
                                "leechers": int(tor.get("peers", 0)),
                                "quality": quality,
                                "num_files": 1,
                                "source": "yts"
                            })
                return results
    except Exception: pass
    return []
