"""
FShare link discovery via free search engines — no API key required.

Engines (run in parallel):
  1. DuckDuckGo  — via duckduckgo-search library (handles proxying/JS)
  2. Bing        — HTML scrape with Vietnamese locale headers
  3. SearXNG     — public metasearch instance (aggregates Google/Bing/DDG internally)
"""

import asyncio
import re
import urllib.parse
from typing import List, Dict, Optional

import httpx

# ── helpers ───────────────────────────────────────────────────────────────────

_FSHARE_RE = re.compile(
    r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+'
)

def _extract(text: str) -> List[str]:
    return list(dict.fromkeys(_FSHARE_RE.findall(text)))

def _parse_quality(text: str) -> str:
    """Guess quality from text snippets."""
    text = text.upper()
    if '2160P' in text or '4K' in text: return '4K'
    if 'REMUX' in text: return 'Remux'
    if '1080P' in text: return '1080p'
    if '720P' in text: return '720p'
    if 'MHD' in text: return 'mHD'
    if 'CAM' in text or 'TS' in text: return 'CAM'
    return 'HD'

def _make_result(url: str, title: str, source: str, snippet: str = "") -> Dict[str, str]:
    quality = _parse_quality(f"{title} {snippet}")
    return {
        "url": url,
        "name": f"[{quality}] {title.split(' - ')[0].split(' | ')[0]}",
        "source": source,
        "provider": "fshare",
        "type": "downloadable",
        "quality": quality,
    }

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
}


# ── Engine 1: DuckDuckGo ──────────────────────────────────────────────────────

async def _ddg(query: str) -> List[Dict[str, str]]:
    try:
        from duckduckgo_search import DDGS

        def _sync():
            with DDGS() as ddgs:
                # Use strict dorking for DDG
                return list(ddgs.text(f"site:fshare.vn {query}", region="vn-vi", safesearch="off", max_results=20))

        items = await asyncio.to_thread(_sync)
    except Exception:
        return []

    results = []
    seen: set = set()
    for item in items:
        text = f"{item.get('body', '')} {item.get('href', '')}"
        for url in _extract(text):
            if url not in seen:
                results.append(_make_result(url, item.get("title", "FShare"), "duckduckgo", item.get("body", "")))
                seen.add(url)
    return results


# ── Engine 2: Bing HTML scrape ────────────────────────────────────────────────

async def _bing(query: str) -> List[Dict[str, str]]:
    try:
        # Use explicit file path search in Bing
        search_url = (
            f"https://www.bing.com/search"
            f"?q=site:fshare.vn/file/+{urllib.parse.quote(query)}&setlang=vi&cc=VN&count=15"
        )
        async with httpx.AsyncClient(
            timeout=15.0, headers=_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(search_url)
            if resp.status_code != 200:
                return []
            
            # Use regex to find result blocks for better metadata
            results = []
            seen = set()
            # Simple fallback extraction from whole page if block parsing fails
            urls = _extract(resp.text)
            for u in urls:
                if u not in seen:
                    results.append(_make_result(u, "FShare", "bing"))
                    seen.add(u)
            return results
    except Exception:
        return []


# ── Engine 3: SearXNG public instances ───────────────────────────────────────

_SEARXNG_INSTANCES = [
    "https://searx.be",
    "https://search.mdosch.de",
    "https://searxng.site",
    "https://paulgo.io",
    "https://priv.au",
]

async def _searxng(query: str) -> List[Dict[str, str]]:
    params = urllib.parse.urlencode({
        "q": f'site:fshare.vn "{query}"',
        "format": "json",
        "engines": "google,bing,duckduckgo",
        "language": "vi",
    })
    headers = {**_HEADERS, "Accept": "application/json"}

    for base in _SEARXNG_INSTANCES:
        try:
            async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
                resp = await client.get(f"{base}/search?{params}")
                if resp.status_code != 200:
                    continue
                data = resp.json()
                results = []
                seen: set = set()
                for item in data.get("results", []):
                    urls = _extract(item.get('url', '')) + _extract(item.get('content', ''))
                    for url in urls:
                        if url not in seen:
                            results.append(
                                _make_result(url, item.get("title", "FShare"), "searxng", item.get("content", ""))
                            )
                            seen.add(url)
                if results:
                    return results
        except Exception:
            continue
    return []


# ── Public entry point ────────────────────────────────────────────────────────

async def lookup_google_fshare(
    title: str,
    year: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None,
) -> List[Dict[str, str]]:
    # 1. Clean title for better search
    clean_title = re.sub(r'[\(\)\[\]]', ' ', title).strip()
    
    # 2. Build prioritized queries
    queries = []
    # Primary: title + year/season info
    q1_parts = [clean_title]
    if year: q1_parts.append(str(year))
    if season and episode: q1_parts.append(f"S{season:02d}E{episode:02d}")
    queries.append(" ".join(q1_parts))
    
    # Secondary: quoted title for strictness
    if len(clean_title.split()) > 1:
        queries.append(f'"{clean_title}"')

    results = []
    seen = set()

    # Try each query in parallel
    for q in queries:
        batches = await asyncio.gather(
            _ddg(q),
            _bing(q),
            _searxng(q),
            return_exceptions=True
        )
        
        found_in_query = False
        for batch in batches:
            if not isinstance(batch, list): continue
            for item in batch:
                u = item.get("url", "")
                if u and u not in seen:
                    results.append(item)
                    seen.add(u)
                    found_in_query = True
        
        # If we found enough results, don't bother with deeper queries
        if len(results) >= 10: break
        
    # Sort results so 4K/1080p comes first
    quality_map = {'4K': 0, 'Remux': 1, '1080p': 2, '720p': 3, 'HD': 4, 'mHD': 5, 'CAM': 6}
    results.sort(key=lambda x: quality_map.get(x.get('quality', 'HD'), 10))
    
    return results
