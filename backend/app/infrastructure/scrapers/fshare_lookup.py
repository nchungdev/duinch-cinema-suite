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

def extract_season_from_name(name: str) -> int:
    patterns = [r'[Ss]eason\s*(\d+)', r'[Ss](\d+)[\.E\s]', r'[Pp]hần\s*(\d+)', r'[Pp](\d+)[\.\s]']
    for p in patterns:
        match = re.search(p, name)
        if match: return int(match.group(1))
    return 1

def is_series_file(name: str) -> bool:
    """Check if filename looks like a TV series episode."""
    series_patterns = [r'[Ee]\d+', r'[Tt]ập\s*\d+', r'[Ee]p\s*\d+', r'S\d{2}E\d{2}']
    return any(re.search(p, name) for p in series_patterns)

async def lookup_timfshare(query: str, year: int = None, filter_title: str = None, localize_title: str = None, media_type: str = "movie", tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
    """Discovery via timfshare.com with explicit Media Type and Year filtering."""
    base_url = "https://timfshare.com/api/v1/string-query-search"
    
    # 1. Prepare clean search terms
    search_terms = list(dict.fromkeys([str(q) for q in [filter_title, localize_title, query] if q and str(q).lower() != 'none']))
    
    all_links = []
    seen_urls = set()
    
    # 2. Get Metadata for filtering
    if not tmdb_info:
        tmdb_info = TMDBInfo(series_year=int(year) if year else 0)
    
    series_start = tmdb_info.series_year or (int(year) if year else 0)
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
                    
                    # --- A. FILE TYPE & EXTENSION FILTER ---
                    is_folder = "/folder/" in link or item.get("file_type") == 2
                    ext = os.path.splitext(name.lower())[1]
                    size_bytes = item.get("size", 0)
                    
                    if not is_folder:
                        if ext not in VIDEO_EXTENSIONS: continue
                        if size_bytes < 50 * 1024 * 1024: continue

                    # --- B. TITLE MATCH (Strict Word Boundary) ---
                    norm_name = normalize_for_match(name)
                    is_match = False
                    for st in search_terms:
                        norm_st = normalize_for_match(st)
                        if re.search(rf'\b{re.escape(norm_st)}\b', norm_name):
                            is_match = True; break
                    if not is_match: continue

                    # --- C. YEAR FILTER (STRICT) ---
                    if series_start > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                        if found_years:
                            if not any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0):
                                continue
                        elif not is_folder:
                            # If file has NO year but we have a target year, be careful
                            # For movies, usually we want the year. For series, sometimes it's missing.
                            pass

                    # --- D. MEDIA TYPE FILTER (CRITICAL) ---
                    looks_like_series = is_series_file(name)
                    if media_type == "movie":
                        # If searching for Movie but file looks like TV Series (has EpXX), skip it
                        if looks_like_series and not is_folder: continue
                    elif media_type == "tv":
                        # If searching for TV but file looks like a single movie (no EpXX, no Season info)
                        # and it's not a folder, be skeptical. 
                        # However, some series files are just named "Naruto 001.mp4"
                        # We'll allow them if the title match is strong.
                        pass

                    # --- E. GAME/TRASH KEYWORD FILTER ---
                    if any(x in norm_name for x in ['storm', 'ninja storm', 'connections', 'striker', 'repack', 'crack']):
                        if media_type == 'tv' or media_type == 'movie': continue

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
