import httpx
import re
import asyncio
import unicodedata
import os
from typing import List, Dict, Any, Optional
from app.core import config
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.m4v', '.mov', '.ts', '.m2ts'}

def normalize_for_match(text: str) -> str:
    if not text: return ""
    t = ''.join(c for c in unicodedata.normalize('NFD', str(text)) if unicodedata.category(c) != 'Mn')
    t = t.replace('đ', 'd').replace('Đ', 'D')
    t = re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()
    return t

def is_episode_format(name: str) -> bool:
    base_name = os.path.splitext(name)[0]
    explicit_patterns = [
        r'[Ee]\d{1,4}', r'[Ee]p\s*\d{1,4}', r'[Ss]\d{1,2}[Ee]\d{1,4}', 
        r'[Tt]ập\s*\d{1,4}', r'[Tt]ap\s*\d{1,4}', r'[Pp]art\s*\d{1,2}', r'[Cc]ương\s*\d{1,4}'
    ]
    if any(re.search(p, base_name, re.IGNORECASE) for p in explicit_patterns): return True
    return bool(re.search(r'[\s\._-](?!19|20)(\d{1,3})$', base_name))

async def lookup_timfshare(query: str, year: int = None, filter_title: str = None, localize_title: str = None, media_type: str = "movie", tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
    """Discovery via timfshare.com API v1. ONLY supports 'movie' to prevent individual file spam for TV."""
    
    # [STRATEGY] Only allow movie discovery for this specific API source
    if media_type != "movie":
        print(f"[TimFShare] Skipping TV series request for '{query}' (API not suitable for series)")
        return []

    base_url = "https://timfshare.com/api/v1/string-query-search"
    search_terms = list(dict.fromkeys([str(q) for q in [filter_title, localize_title, query] if q and str(q).lower() != 'none']))
    
    all_links, seen_urls = [], set()
    series_start = tmdb_info.series_year if tmdb_info else (int(year) if year else 0)
    valid_years = [series_start]

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
                    
                    is_folder = "/folder/" in link or item.get("file_type") == 2
                    ext = os.path.splitext(name.lower())[1]
                    size_bytes = item.get("size", 0)
                    
                    if not is_folder:
                        if ext not in VIDEO_EXTENSIONS: continue
                        if size_bytes < 300 * 1024 * 1024: continue # Increase min size for movies
                        if is_episode_format(name): continue # Strict movie check

                    # Title Match
                    norm_name = normalize_for_match(name)
                    is_match = False
                    for st in search_terms:
                        norm_st = normalize_for_match(st)
                        if re.search(rf'\b{re.escape(norm_st)}\b', norm_name):
                            is_match = True; break
                    if not is_match: continue

                    # Year Match
                    if series_start > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                        if found_years:
                            if not any(abs(int(fy) - series_start) <= 1 for fy in found_years): continue

                    all_links.append(DownloadableLink(
                        name=name, url=link, size=size_bytes, source="timfshare",
                        is_folder=is_folder
                    ))
                    seen_urls.add(link)
            except Exception: continue
            
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any, Any]]:
    return []
