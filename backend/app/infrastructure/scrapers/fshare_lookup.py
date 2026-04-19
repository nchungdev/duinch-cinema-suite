import httpx
import re
import asyncio
import unicodedata
from typing import List, Dict, Any, Optional
from app.core import config
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

def normalize_for_match(text: str) -> str:
    """Normalize text for robust file name matching."""
    if not text: return ""
    t = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    t = t.replace('đ', 'd').replace('Đ', 'D')
    t = re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()
    return t

async def lookup_timfshare(query: str, year: int = None, filter_title: str = None, localize_title: str = None, media_type: str = "movie", tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
    """Discovery via timfshare.com API v1 with POST method and strict filtering."""
    url = "https://timfshare.com/api/v1/string-query-search"
    
    search_terms = list(dict.fromkeys([q for q in [filter_title, localize_title] if q]))
    all_links = []
    seen_urls = set()
    
    if not tmdb_info:
        tmdb_info = TMDBInfo(series_year=int(year) if year else 0)
        
    series_start = tmdb_info.series_year
    actual_season_years = [y for y in tmdb_info.season_years.values() if y > 0]
    valid_years = [series_start] + actual_season_years

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://timfshare.com/",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        for t in search_terms:
            try:
                resp = await client.post(url, json={"query": t}, headers=headers)
                if resp.status_code != 200: continue
                data = resp.json()
                
                items = data.get("data", [])
                if not isinstance(items, list): continue
                
                for item in items:
                    name = item.get("name", "")
                    link = item.get("url", "")
                    if not name or not link or link in seen_urls: continue
                    
                    # 1. SMART TITLE MATCH
                    normalized_name = normalize_for_match(name)
                    match_title = False
                    for st in search_terms:
                        if normalize_for_match(st) in normalized_name:
                            match_title = True; break
                    if not match_title: continue
                    
                    # 2. YEAR MATCH
                    found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                    if found_years and series_start > 0:
                        match_year = False
                        for fy in found_years:
                            if any(abs(int(fy) - vy) <= 1 for vy in valid_years if vy > 0):
                                match_year = True; break
                        if not match_year: continue
                    
                    all_links.append(DownloadableLink(
                        name=name,
                        url=link,
                        size=item.get("size", 0),
                        source="timfshare",
                        is_folder="/folder/" in link or item.get("file_type") == 2
                    ))
                    seen_urls.add(link)
            except Exception as e:
                print(f"[TimFShare] API Error: {e}")
                continue
            
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any, Any]]:
    """Resolve FShare folder/file for JDownloader dash."""
    return []
