import httpx
import re
import asyncio
from typing import List, Dict, Any

async def lookup_thuviencine(query: str, year: int = None, filter_title: str = None, localize_title: str = None, tmdb_info: Dict[str, Any] = {}) -> List[Dict[str, Any]]:
    """Discovery via thuviencine.com with ultra-broad searching and smart filtering."""
    titles = list(dict.fromkeys([q for q in [localize_title, filter_title] if q]))
    all_links = []
    seen_urls = set()

    series_start = int(tmdb_info.get("series_year") or year or 0)
    actual_season_years = [y for y in tmdb_info.get("season_years", {}).values() if y > 0]
    valid_years = [series_start] + actual_season_years

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for t in titles:
            try:
                search_url = f"https://thuviencine.com/search-result?q={t}"
                resp = await client.get(search_url)
                if resp.status_code != 200: continue
                
                matches = re.findall(r'href="(https://www\.fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+)"[^>]*>(.*?)</a>', resp.text)
                for url, label in matches:
                    if url in seen_urls: continue
                    label_clean = label.lower()
                    
                    # 1. SMART MATCH
                    is_match = False
                    for qt in titles:
                        if qt.lower() in label_clean:
                            is_match = True; break
                    if not is_match: continue
                    
                    # 2. YEAR MATCH (Relaxed +/- 1 year)
                    is_folder = "/folder/" in url
                    if not is_folder and series_start > 0:
                        found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', label)
                        if found_years:
                            match_y = any(abs(int(fy) - vy) <= 1 for fy in found_years for vy in valid_years if vy > 0)
                            if not match_y: continue
                    
                    all_links.append({
                        "name": label.strip() or "FShare Link",
                        "url": url, "source": "thuviencine",
                        "type": "downloadable", "is_folder": is_folder, "source_page": search_url
                    })
                    seen_urls.add(url)
            except Exception: continue
            
    return all_links
