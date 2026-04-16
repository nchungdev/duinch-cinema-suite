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

def _make_result(url: str, title: str, source: str) -> Dict[str, str]:
    return {
        "url": url,
        "name": f"{source.upper()} | {title}",
        "source": source,
        "provider": "fshare",
        "type": "downloadable",
    }

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── Engine 1: DuckDuckGo ──────────────────────────────────────────────────────

async def _ddg(query: str) -> List[Dict[str, str]]:
    try:
        from duckduckgo_search import DDGS

        def _sync():
            # vn-vi region surfaces Vietnamese forum results
            with DDGS() as ddgs:
                return list(ddgs.text(query, region="vn-vi", safesearch="off", max_results=20))

        items = await asyncio.to_thread(_sync)
    except Exception:
        return []

    results = []
    seen: set = set()
    for item in items:
        text = f"{item.get('body', '')} {item.get('href', '')}"
        for url in _extract(text):
            if url not in seen:
                results.append(_make_result(url, item.get("title", "FShare"), "ddg"))
                seen.add(url)
    return results


# ── Engine 2: Bing HTML scrape ────────────────────────────────────────────────

async def _bing(query: str) -> List[Dict[str, str]]:
    try:
        search_url = (
            f"https://www.bing.com/search"
            f"?q={urllib.parse.quote(query)}&setlang=vi&cc=VN&count=20"
        )
        async with httpx.AsyncClient(
            timeout=12.0, headers=_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(search_url)
            if resp.status_code != 200:
                return []
            urls = _extract(resp.text)
            return [_make_result(u, "FShare Link", "bing") for u in urls]
    except Exception:
        return []


# ── Engine 3: SearXNG public instances ───────────────────────────────────────

# Public SearXNG instances that support JSON API and have good uptime
_SEARXNG_INSTANCES = [
    "https://searx.be",
    "https://search.mdosch.de",
    "https://searxng.site",
    "https://paulgo.io",
]

async def _searxng(query: str) -> List[Dict[str, str]]:
    """Try SearXNG public instances until one responds.
    SearXNG is a metasearch engine — it queries Google/Bing/DDG itself.
    """
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "engines": "google,bing,duckduckgo",
        "language": "vi",
        "safesearch": "0",
    })
    headers = {**_HEADERS, "Accept": "application/json"}

    for base in _SEARXNG_INSTANCES:
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
                resp = await client.get(f"{base}/search?{params}")
                if resp.status_code != 200:
                    continue
                data = resp.json()
                results = []
                seen: set = set()
                for item in data.get("results", []):
                    text = f"{item.get('content', '')} {item.get('url', '')}"
                    for url in _extract(text):
                        if url not in seen:
                            results.append(
                                _make_result(url, item.get("title", "FShare"), "searxng")
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
    """Search for FShare links using DDG + Bing + SearXNG in parallel.
    No API key required.
    """
    # Build query (handle pre-built queries passed by deep-discovery endpoint)
    parts = [title]
    if year and str(year) not in title:
        parts.append(str(year))
    if season and episode and f"S{season:02d}" not in title:
        parts.append(f"S{season:02d}E{episode:02d}")
    elif season and "Season" not in title and f"S{season:02d}" not in title:
        parts.append(f"Season {season}")
    if "fshare" not in title.lower():
        parts.append("fshare.vn")
    query = " ".join(parts)

    # All engines run in parallel
    batches = await asyncio.gather(
        _ddg(query),
        _bing(query),
        _searxng(query),
        return_exceptions=True,
    )

    seen: set = set()
    results: List[Dict[str, str]] = []
    for batch in batches:
        if not isinstance(batch, list):
            continue
        for item in batch:
            u = item.get("url", "")
            if u and u not in seen:
                results.append(item)
                seen.add(u)

    return results
