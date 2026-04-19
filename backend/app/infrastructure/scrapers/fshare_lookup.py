import httpx
import re
import asyncio
import unicodedata
import os
from typing import List, Dict, Any, Optional
from app.core import config
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

# Chỉ chấp nhận các định dạng video thực thụ cho người dùng cuối
VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.m4v', '.mov', '.ts', '.m2ts'} 
# Loại bỏ .iso vì đa phần là game hoặc đĩa gốc quá nặng không cần thiết cho xem nhanh

def normalize_for_match(text: str) -> str:
    """Normalize text for robust file name matching."""
    if not text: return ""
    # Remove accents
    t = ''.join(c for c in unicodedata.normalize('NFD', str(text)) if unicodedata.category(c) != 'Mn')
    t = t.replace('đ', 'd').replace('Đ', 'D')
    # Lowercase and keep only alphanumeric
    t = re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()
    return t

def extract_season_from_name(name: str) -> int:
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
    """Discovery via timfshare.com with ultra-strict filtering to prevent 'None' leakage and Game ISOs."""
    base_url = "https://timfshare.com/api/v1/string-query-search"
    
    # CRITICAL FIX: Ensure no 'None' objects or empty strings enter search_terms
    search_terms = list(dict.fromkeys([str(q) for q in [filter_title, localize_title, query] if q and str(q).lower() != 'none']))
    
    all_links = []
    seen_urls = set()
    
    if not tmdb_info:
        tmdb_info = TMDBInfo(series_year=int(year) if year else 0)
    valid_years = [tmdb_info.series_year] + list(tmdb_info.season_years.values())

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
                    
                    # 1. STRICT VIDEO & FILE TYPE FILTER
                    is_folder = "/folder/" in link or item.get("file_type") == 2
                    ext = os.path.splitext(name.lower())[1]
                    size_bytes = item.get("size", 0)
                    
                    if not is_folder:
                        # Reject non-video (Game ISOs, Archives, etc)
                        if ext not in VIDEO_EXTENSIONS: continue
                        # Reject tiny files
                        if size_bytes < 50 * 1024 * 1024: continue

                    # 2. ULTRA-STRICT TITLE MATCH
                    # We check if the name contains the search term as a WHOLE WORD or clearly defined segment
                    norm_name = normalize_for_match(name)
                    is_match = False
                    for st in search_terms:
                        norm_st = normalize_for_match(st)
                        if not norm_st: continue
                        # Use word boundary check for short titles like "Naruto"
                        if re.search(rf'\b{re.escape(norm_st)}\b', norm_name):
                            is_match = True; break
                    if not is_match: continue
                    
                    # 3. EXCLUDE COMMON GAME KEYWORDS for Anime
                    if any(x in norm_name for x in ['storm', 'ninja storm', 'connections', 'striker']):
                        if media_type == 'tv': continue

                    # 4. YEAR MATCH
                    if tmdb_info.series_year > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                        if found_years:
                            match_y = any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0)
                            if not match_y: continue
                    
                    season_num = extract_season_from_name(name)
                    all_links.append(DownloadableLink(
                        name=name, url=link, size=size_bytes, source="timfshare",
                        is_folder=is_folder,
                        source_page=f"Season {season_num}" if media_type == "tv" else None
                    ))
                    seen_urls.add(link)
            except Exception: continue
            
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any, Any]]:
    return []
