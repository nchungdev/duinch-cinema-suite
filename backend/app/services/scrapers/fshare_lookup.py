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
    """Ultra-high recall FShare discovery using TimFShare API v1."""
    api_url = "https://timfshare.com/api/v1/string-query-search"
    
    # [STRATEGY] Build specific search terms to bypass noise
    # We search for: "Original Title", "Localized Title", and "Title + Year"
    search_queries = []
    if filter_title:
        search_queries.append(filter_title)
        if year: search_queries.append(f"{filter_title} {year}")
    if localize_title:
        search_queries.append(localize_title)
    
    all_links = []
    seen_urls = set()
    
    # Metadata for strict validation
    series_start = int(tmdb_info.get("series_year") or year or 0)
    actual_season_years = [y for y in tmdb_info.get("season_years", {}).values() if y > 0]
    valid_years = [series_start] + actual_season_years

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://timfshare.com/",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        for q_term in list(dict.fromkeys(search_queries)):
            try:
                resp = await client.post(api_url, json={"query": q_term}, headers=headers)
                if resp.status_code != 200: continue
                data = resp.json()
                
                for item in data.get("data", []):
                    name = item.get("name", "")
                    link = item.get("url", "")
                    if not name or not link or link in seen_urls: continue
                    
                    # 1. QUALITY FILTER: Skip very small files unless it's a folder
                    size_bytes = item.get("size", 0)
                    is_folder = item.get("file_type") == 2 or "/folder/" in link
                    if not is_folder and size_bytes < 100 * 1024 * 1024: continue # Skip < 100MB
                    
                    # 2. STRICT TITLE MATCH
                    norm_name = normalize_for_match(name)
                    is_match = False
                    for t in [filter_title, localize_title]:
                        if t and normalize_for_match(t) in norm_name:
                            is_match = True; break
                    if not is_match: continue
                    
                    # 3. STRICT YEAR MATCH
                    if series_start > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', name)
                        if found_years:
                            match_y = any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0)
                            if not match_y: continue
                    
                    all_links.append({
                        "name": name,
                        "url": link,
                        "size": size_bytes,
                        "source": "timfshare",
                        "type": "downloadable",
                        "is_folder": is_folder
                    })
                    seen_urls.add(link)
            except Exception as e:
                print(f"[TimFShare] Error for '{q_term}': {e}")
                continue
                
    return all_links

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict[Any]]:
    """Logic to expand FShare folders will go here."""
    return []
