import httpx
import re
import asyncio
import unicodedata
import os
from typing import List, Dict, Any, Optional
from app.core import config
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.iso', '.m4v', '.mov', '.wmv', '.ts'}

def normalize_for_match(text: str) -> str:
    """Normalize text for robust file name matching."""
    if not text: return ""
    t = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    t = t.replace('đ', 'd').replace('Đ', 'D')
    t = re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()
    return t

def extract_season_from_name(name: str) -> int:
    """Try to extract season number from various naming patterns."""
    patterns = [
        r'[Ss]eason\s*(\d+)',
        r'[Ss](\d+)[\.E\s]',
        r'[Pp]hần\s*(\d+)',
        r'[Pp](\d+)[\.\s]'
    ]
    for p in patterns:
        match = re.search(p, name)
        if match: return int(match.group(1))
    return 1

async def lookup_timfshare(query: str, year: int = None, filter_title: str = None, localize_title: str = None, media_type: str = "movie", tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
    """Discovery via timfshare.com with smart video filtering and season grouping."""
    base_url = "https://timfshare.com/api/v1/string-query-search"
    search_terms = list(dict.fromkeys([q for q in [filter_title, localize_title] if q]))
    if not search_terms: search_terms = [query]
    
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
        "Accept": "application/json"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        for t in search_terms:
            try:
                resp = await client.post(f"{base_url}?query={t}", headers=headers)
                if resp.status_code != 200: continue
                data = resp.json()
                items = data.get("data", [])
                
                for item in items:
                    name = item.get("name", "")
                    link = item.get("url", "")
                    if not name or not link or link in seen_urls: continue
                    
                    # 1. VIDEO & QUALITY FILTER
                    is_folder = "/folder/" in link or item.get("file_type") == 2
                    ext = os.path.splitext(name.lower())[1]
                    size_bytes = item.get("size", 0)
                    
                    if not is_folder:
                        # Skip small non-video files
                        if ext not in VIDEO_EXTENSIONS and size_bytes < 300 * 1024 * 1024:
                            continue
                        if size_bytes < 50 * 1024 * 1024:
                            continue

                    # 2. TITLE MATCH
                    norm_name = normalize_for_match(name)
                    match_t = False
                    for st in search_terms:
                        if normalize_for_match(st) in norm_name:
                            match_t = True; break
                    if not match_t: continue
                    
                    # 3. YEAR MATCH
                    if series_start > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                        if found_years:
                            if not any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0):
                                continue
                    
                    # 4. SEASON DETECTION
                    season_num = extract_season_from_name(name)
                    
                    all_links.append(DownloadableLink(
                        name=name,
                        url=link,
                        size=size_bytes,
                        source="timfshare",
                        is_folder=is_folder,
                        source_page=f"Season {season_num}" if media_type == "tv" else None
                    ))
                    seen_urls.add(link)
            except Exception as e:
                print(f"[TimFShare] Error: {e}")
                continue
            
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any, Any]]:
    return []
