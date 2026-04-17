"""
FShare link discovery via timfshare.com API (no auth required).

Endpoints discovered from their Next.js frontend:
  POST https://timfshare.com/api/v1/string-query-search?query=<q>
    → {"data": [{id, name, url, size, file_type, created}], "code", "message"}
  GET  https://timfshare.com/api/v1/autocomplete?query=<q>
    → {"data": [{id, value}]}

Strategy:
  1. Call search API directly (primary)
  2. On transient failure (5xx / network error) → retry once
  3. On permanent failure (API gone / changed) → HTML scraping fallback

Results cached for 8 hours to avoid hammering their API.
"""

import re
import asyncio
from typing import List, Dict, Optional

import httpx

from app.services.cache_manager import get_from_cache, set_to_cache

_SEARCH_API    = "https://timfshare.com/api/v1/string-query-search"
_SEARCH_PAGE   = "https://timfshare.com/search"   # fallback: HTML page (CSR — limited)
_CACHE_FILE    = "data/timfshare_cache.json"
_CACHE_TTL     = 8 * 3600  # 8 hours

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://timfshare.com/",
}

_STOP_WORDS = {
    'the','a','an','of','in','on','at','to','and','or','for','with',
    'null','nulled','full','hd','vietsub','subs','dubbed',
    'phim','bộ','tập','season','series','collection',
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _parse_quality(text: str) -> str:
    t = text.upper()
    if '2160P' in t or '4K' in t or 'UHD' in t: return '4K'
    if 'REMUX' in t: return 'Remux'
    if '1080P' in t: return '1080p'
    if '720P' in t: return '720p'
    if 'MHD' in t: return 'mHD'
    if 'CAM' in t: return 'CAM'
    return 'HD'


def _format_size(size_bytes: int) -> str:
    if size_bytes >= 1024 ** 3:
        return f"{size_bytes / 1024**3:.2f} GB"
    if size_bytes >= 1024 ** 2:
        return f"{size_bytes / 1024**2:.0f} MB"
    return f"{size_bytes / 1024:.0f} KB"


def _keywords(text: str) -> set:
    words = re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split()
    return {w for w in words if len(w) > 2 and w not in _STOP_WORDS}


def _is_relevant(name: str, title: str) -> bool:
    title_kw = _keywords(title)
    if not title_kw:
        return True
    overlap = title_kw & _keywords(name)
    return len(overlap) >= max(1, len(title_kw) // 2)


def _make_result(item: dict, source: str) -> Optional[Dict]:
    name = item.get("name", "").strip()
    url  = item.get("url", "").split("?")[0]   # strip ?des=... tracking param
    if not name or not url:
        return None
    clean = re.sub(r'^\[(?:4K|Remux|1080p|720p|mHD|CAM|HD)\]\s*', '', name).strip()
    quality = _parse_quality(clean)
    return {
        "url": url,
        "name": f"[{quality}] {clean}",
        "source": source,
        "provider": "fshare",
        "type": "downloadable",
        "quality": quality,
        "size": _format_size(item.get("size", 0)),
    }


# ── API call with retry ───────────────────────────────────────────────────────

async def _call_api(client: httpx.AsyncClient, query: str) -> Optional[List[dict]]:
    """
    Call timfshare search API. Returns raw item list or None on failure.
    Retries once on 5xx / network errors.
    """
    for attempt in range(2):
        try:
            resp = await client.post(_SEARCH_API, params={"query": query})
            if resp.status_code == 200:
                return resp.json().get("data", [])
            if resp.status_code < 500:
                return None          # 4xx — not a transient error, don't retry
        except (httpx.TimeoutException, httpx.NetworkError):
            pass
        if attempt == 0:
            await asyncio.sleep(1)   # brief pause before retry
    return None


# ── HTML fallback (best-effort — page is CSR so results are limited) ──────────

_FSHARE_RE = re.compile(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+')

async def _html_fallback(client: httpx.AsyncClient, query: str) -> List[dict]:
    """
    Fallback: scrape timfshare search page HTML.
    The page is client-side rendered so this only catches URLs pre-embedded
    in the SSR payload (rare). Returns empty list in most cases.
    """
    try:
        resp = await client.get(_SEARCH_PAGE, params={"key": query},
                                headers={**_HEADERS, "Accept": "text/html"})
        if resp.status_code != 200:
            return []
        urls = list(dict.fromkeys(_FSHARE_RE.findall(resp.text)))
        return [{"id": u.split("/")[-1], "name": u.split("/")[-1],
                 "url": u, "size": 0, "file_type": 1, "created": 0}
                for u in urls]
    except Exception:
        return []


# ── Public entry point ────────────────────────────────────────────────────────

async def lookup_timfshare(
    title: str,
    year: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None,
) -> List[Dict]:
    cache_key = f"{title.strip().lower()}|{year or ''}|{season or ''}|{episode or ''}"
    cached = get_from_cache(_CACHE_FILE, cache_key, _CACHE_TTL)
    if cached is not None:
        return cached

    # Build query: title [year] [SxxExx / Season N]
    parts = [title]
    if year: parts.append(year)
    if season and episode: parts.append(f"S{season:02d}E{episode:02d}")
    elif season: parts.append(f"Season {season}")
    query = " ".join(parts)

    async with httpx.AsyncClient(headers=_HEADERS, timeout=15.0) as client:
        raw_items = await _call_api(client, query)
        source_tag = "timfshareapi"

        if raw_items is None:
            # API failed → try HTML fallback
            raw_items = await _html_fallback(client, query)
            source_tag = "timfsharehtml"

    results = []
    seen: set = set()
    for item in (raw_items or []):
        url = item.get("url", "").split("?")[0]
        if not url or url in seen:
            continue
        if not _is_relevant(item.get("name", ""), title):
            continue
        result = _make_result(item, source_tag)
        if result:
            results.append(result)
            seen.add(url)

    # Only cache non-empty results so a transient failure doesn't lock out 8h
    if results:
        set_to_cache(_CACHE_FILE, cache_key, results)
    return results


if __name__ == "__main__":
    res = asyncio.run(lookup_timfshare("One Piece Live Action", "2026"))
    for r in res:
        print(f"[{r['quality']}] {r['name'][:60]}  {r['size']}")
