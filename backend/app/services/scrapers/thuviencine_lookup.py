import httpx
from bs4 import BeautifulSoup
import asyncio
import re
from typing import List, Dict, Optional
import urllib.parse

from app.core import config
from app.services.cache_manager import get_from_cache, set_to_cache

_CACHE_FILE = config.THUVIENCINE_CACHE
_CACHE_TTL = config.THUVIENCINE_CACHE_TTL


_STOP_WORDS = {
    'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'for', 'with',
    'null', 'full', 'hd', 'vietsub', 'subs', 'dubbed', 'link', 'download',
    'phim', 'bộ', 'tập', 'season', 'series', 'collection',
}


def _parse_quality(text: str) -> str:
    t = text.upper()
    if '2160P' in t or '4K' in t: return '4K'
    if 'REMUX' in t: return 'Remux'
    if '1080P' in t: return '1080p'
    if '720P' in t: return '720p'
    if 'MHD' in t: return 'mHD'
    if 'CAM' in t or 'TS' in t: return 'CAM'
    return 'HD'


def _keywords(text: str) -> set:
    words = re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split()
    return {w for w in words if len(w) >= 3 and w not in _STOP_WORDS}


_VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.webm', '.mov', '.ts', '.m4v'}

def _is_relevant(name: str, title: str, year: Optional[str] = None) -> bool:
    name_lower = name.lower()
    
    # 0. Video-only filter
    if any(name_lower.endswith(ext) for ext in {'.rar', '.zip', '.7z', '.iso'}):
        return False

    title_kw = _keywords(title)
    if not title_kw:
        return True
    
    name_kw = _keywords(name)
    overlap = title_kw & name_kw
    
    # 1. Keyword Overlap
    if len(overlap) < max(1, int(len(title_kw) * 0.7)):
        return False
        
    # 2. Year Filter: Strict
    if year:
        year_str = str(year)
        is_one_piece_la = "one piece" in title.lower() and year_str == "2023"
        found_years = re.findall(r'\b(19\d{2}|20\d{2})\b', name)
        
        if year_str in found_years:
            return True
        if is_one_piece_la and "live action" in name.lower():
            return True
            
        # If result has a DIFFERENT year, it's definitely wrong
        if found_years:
            return False
            
        # If it has NO year, we allow it (for TV series/Anime)
        return True
            
    return True


async def lookup_thuviencine(title: str, filter_title: Optional[str] = None, year: Optional[str] = None) -> List[Dict[str, str]]:
    """
    Searches ThuVienCine for Fshare links.
    Flow: Search → Detail Page → Download Page → Extract Fshare links.
    filter_title: if provided, each result name is checked for relevance against this title.
    Results cached for 8 hours.
    """
    cache_key = f"{title.strip().lower()}|{year or ''}"
    cached = get_from_cache(_CACHE_FILE, cache_key, _CACHE_TTL)
    if cached is not None:
        return cached

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
    }

    # Build search variants: full title → simplified → first word only
    search_queries = [title]
    simple = re.sub(r'Part\s+\d+|Season\s+\d+|Live\s+Action|\d{4}', '', title, flags=re.IGNORECASE).strip()
    if simple and simple != title:
        search_queries.append(simple)
    words = simple.split()
    if len(words) > 1:
        search_queries.append(words[0])

    links: List[Dict] = []
    seen_urls: set = set()

    async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
        for query in search_queries:
            try:
                resp = await client.get(f"https://thuviencine.com/?s={urllib.parse.quote(query)}")
                soup = BeautifulSoup(resp.text, 'html.parser')

                candidates = soup.select('.item a[href], article a[href], .post-title a, h2 a, h3 a')
                if not candidates:
                    continue

                for res in candidates[:5]:
                    detail_url = res.get('href', '')
                    if not detail_url or 'thuviencine.com' not in detail_url:
                        continue
                    if 'download?id=' in detail_url:
                        continue

                    resp_detail = await client.get(detail_url)
                    soup_detail = BeautifulSoup(resp_detail.text, 'html.parser')

                    dl_btn = soup_detail.select_one('a[href*="/download?id="], #download-button a, .download-link')
                    if not dl_btn:
                        continue

                    dl_url = dl_btn.get('href', '')
                    if dl_url.startswith('/'):
                        dl_url = "https://thuviencine.com" + dl_url

                    resp_dl = await client.get(dl_url)
                    soup_dl = BeautifulSoup(resp_dl.text, 'html.parser')

                    for el in soup_dl.select('a[href*="fshare.vn"]'):
                        url = el.get('href', '')
                        if not url or url in seen_urls:
                            continue

                        name = el.get_text(" ", strip=True) or "FShare Link"
                        name = re.sub(r'^Download\s*\|\s*', '', name)
                        name = re.sub(r'^(\d+\.?\d*\s*[GM]B)(.*)', r'\1 - \2', name)
                        name = re.sub(r'^\[(?:4K|Remux|1080p|720p|mHD|CAM|HD)\]\s*', '', name).strip()

                        # Relevance filter
                        if filter_title and not _is_relevant(name, filter_title, year):
                            continue

                        quality = _parse_quality(name)
                        links.append({
                            "url": url,
                            "name": f"[{quality}] {name}",
                            "source": "thuviencine",
                            "provider": "fshare",
                            "type": "downloadable",
                            "quality": quality,
                        })
                        seen_urls.add(url)

                if links:
                    break
            except Exception:
                continue

    set_to_cache(_CACHE_FILE, cache_key, links)
    return links


if __name__ == "__main__":
    res = asyncio.run(lookup_thuviencine("One Piece Live Action", filter_title="One Piece Live Action"))
    for r in res:
        print(r)
