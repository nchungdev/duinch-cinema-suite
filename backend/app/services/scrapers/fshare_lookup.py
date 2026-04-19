import httpx
import re
import asyncio
import unicodedata
from typing import List, Dict, Any, Optional
from app.core import config

def normalize_for_match(text: str) -> str:
    if not text: return ""
    t = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    t = t.replace('đ', 'd').replace('Đ', 'D')
    t = re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()
    return t

async def lookup_timfshare(query: str, year: int = None, filter_title: str = None, localize_title: str = None, media_type: str = "movie", tmdb_info: Dict[str, Any] = {}) -> List[Dict[str, Any]]:
    """Discovery via timfshare.com API v1 with relaxed year filtering."""
    url = "https://timfshare.com/api/v1/string-query-search"
    search_terms = list(dict.fromkeys([q for q in [filter_title, localize_title] if q]))
    all_links = []
    seen_urls = set()
    
    series_start = int(tmdb_info.get("series_year") or year or 0)
    actual_season_years = [y for y in tmdb_info.get("season_years", {}).values() if y > 0]
    valid_years = [series_start] + actual_season_years

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://timfshare.com/",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        for t in search_terms:
            try:
                resp = await client.post(url, json={"query": t}, headers=headers)
                if resp.status_code != 200: continue
                data = resp.json()
                for item in data.get("data", []):
                    name, link = item.get("name", ""), item.get("url", "")
                    if not name or not link or link in seen_urls: continue
                    
                    # 1. TITLE MATCH
                    normalized_name = normalize_for_match(name)
                    if not any(normalize_for_match(st) in normalized_name for st in search_terms): continue
                    
                    # 2. YEAR MATCH (Relaxed +/- 1 year)
                    is_folder = "/folder/" in link or item.get("file_type") == 2
                    if not is_folder and series_start > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                        if found_years:
                            if not any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0): continue
                    
                    all_links.append({
                        "name": name, "url": link, "size": item.get("size", 0),
                        "source": "timfshare", "type": "downloadable", "is_folder": is_folder
                    })
                    seen_urls.add(link)
            except Exception: continue
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any]]:
    return []
