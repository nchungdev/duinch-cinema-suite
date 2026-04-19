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

def extract_season_from_name(name: str) -> Optional[int]:
    patterns = [r'[Ss]eason\s*(\d+)', r'[Ss](\d+)[\.E\s]', r'[Pp]hần\s*(\d+)', r'[Pp](\d+)[\.\s]']
    for p in patterns:
        match = re.search(p, name, re.IGNORECASE)
        if match: return int(match.group(1))
    return None

def is_episode_format(name: str) -> bool:
    base_name = os.path.splitext(name)[0]
    explicit_patterns = [
        r'[Ee]\d{1,4}', r'[Ee]p\s*\d{1,4}', r'[Ss]\d{1,2}[Ee]\d{1,4}', 
        r'[Tt]ập\s*\d{1,4}', r'[Tt]ap\s*\d{1,4}', r'[Pp]art\s*\d{1,2}', r'[Cc]ương\s*\d{1,4}'
    ]
    if any(re.search(p, base_name, re.IGNORECASE) for p in explicit_patterns): return True
    return bool(re.search(r'[\s\._-](?!19|20)(\d{1,3})$', base_name))

def is_movie_format(name: str) -> bool:
    """Detect if a filename explicitly marks itself as a Movie (common in Anime)."""
    patterns = [
        r'[Mm]ovie\s*\d{1,2}', 
        r'[\s\._-][Mm](\d{1,2})[\s\._-]', # M01, _M01_, .M01.
        r'[Tt]he\s*[Mm]ovie'
    ]
    return any(re.search(p, name, re.IGNORECASE) for p in patterns)

async def lookup_timfshare(query: str, year: int = None, filter_title: str = None, localize_title: str = None, media_type: str = "movie", tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
    """Discovery via timfshare.com with explicit Movie/Series separation for Anime."""
    base_url = "https://timfshare.com/api/v1/string-query-search"
    
    tmdb_title = tmdb_info.title if tmdb_info and tmdb_info.title else (filter_title or query)
    norm_tmdb_title = normalize_for_match(tmdb_title)
    search_terms = list(dict.fromkeys([str(q) for q in [filter_title, localize_title, query] if q and str(q).lower() != 'none']))
    
    all_links, seen_urls = [], set()
    series_start = tmdb_info.series_year if tmdb_info else (int(year) if year else 0)
    valid_years = [series_start] + list(tmdb_info.season_years.values()) if tmdb_info else [series_start]

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
                        if size_bytes < 50 * 1024 * 1024: continue

                    # --- CRITICAL: MEDIA TYPE SEPARATION ---
                    is_ep  = is_episode_format(name)
                    is_mov = is_movie_format(name)
                    
                    if media_type == "tv":
                        # If looking for TV, skip files that are explicitly Movies (M01, Movie 1)
                        if is_mov and not is_folder: continue
                    elif media_type == "movie":
                        # If looking for Movie, skip explicit episodes
                        if is_ep and not is_mov and not is_folder: continue

                    # --- IDENTITY GUARD ---
                    norm_name = normalize_for_match(name)
                    if re.search(r'shippu?den', norm_name) and "shippuden" not in norm_tmdb_title: continue
                    if "boruto" in norm_name and "boruto" not in norm_tmdb_title: continue
                    
                    is_match = False
                    for st in search_terms:
                        norm_st = normalize_for_match(st)
                        if re.search(rf'\b{re.escape(norm_st)}\b', norm_name):
                            is_match = True; break
                    if not is_match: continue

                    found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                    if found_years:
                        if not any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0):
                            continue
                    elif not is_folder and series_start > 0:
                        ep_match = re.search(r'(?:tập|ep|e)\s*(\d+)', norm_name, re.IGNORECASE)
                        if ep_match and series_start == 1999 and int(ep_match.group(1)) > 220: continue

                    if any(x in norm_name for x in ['storm', 'ninja storm', 'connections', 'striker', 'repack', 'crack']): continue

                    season_num = extract_season_from_name(name)
                    # For TV, default to Season 1 if no season found. For Movie, no label.
                    s_label = f"Season {season_num if season_num else 1}" if media_type == "tv" else None

                    all_links.append(DownloadableLink(
                        name=name, url=link, size=size_bytes, source="timfshare",
                        is_folder=is_folder,
                        source_page=s_label
                    ))
                    seen_urls.add(link)
            except Exception: continue
            
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any, Any]]:
    return []
