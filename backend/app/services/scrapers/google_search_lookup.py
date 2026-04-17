"""
FShare link discovery via free search engines — no API key required.

Engines (run in parallel):
  1. Brave Search — HTML scrape, returns clean results with title metadata
  2. DuckDuckGo   — via duckduckgo-search library (handles proxying/JS)
  3. SearXNG      — public metasearch instance (aggregates Google/Bing/DDG internally)
  4. Google       — HTML scrape with curl-cffi browser impersonation (fallback)
"""

import asyncio
import re
import urllib.parse
from typing import List, Dict, Optional

import httpx
from app.core import config
from app.services.cache_manager import get_from_cache, set_to_cache

_FSHARE_NAME_CACHE   = config.GOOGLE_SEARCH_NAME_CACHE
_FSHARE_NAME_TTL     = config.FSHARE_NAME_TTL
_FSHARE_SEARCH_CACHE = config.GOOGLE_SEARCH_CACHE
_FSHARE_SEARCH_TTL   = config.FSHARE_SEARCH_TTL

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
    # Strip bare URL-like titles (DDG sometimes sets title = the URL)
    clean = title.split(' - ')[0].split(' | ')[0].strip()
    if not clean or clean.startswith("fshare.vn") or clean.startswith("http"):
        clean = url.split("/")[-1]  # use the file/folder ID as fallback name
    return {
        "url": url,
        "name": f"[{quality}] {clean}",
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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── Engine 1: Brave Search HTML scrape ───────────────────────────────────────

async def _brave(query: str) -> List[Dict[str, str]]:
    """
    Brave Search serves full HTML without JS challenges.
    Result structure: div.snippet[data-type="web"] with:
      - a.l1[href]              → fshare URL
      - div.title               → page title
      - div.generic-snippet p   → description snippet
    """
    try:
        search_url = (
            "https://search.brave.com/search"
            f"?q=site%3Afshare.vn+{urllib.parse.quote(query)}&country=vn"
        )
        async with httpx.AsyncClient(
            timeout=15.0, headers=_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(search_url)
            if resp.status_code != 200:
                return []

            html = resp.text
            results = []
            seen: set = set()

            # Parse result blocks for title + URL pairs
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "html.parser")
                for snippet in soup.select('div.snippet[data-type="web"]'):
                    # Extract fshare URL from the result link
                    link = snippet.find("a", href=_FSHARE_RE)
                    if not link:
                        continue
                    url_match = _FSHARE_RE.match(link.get("href", ""))
                    if not url_match:
                        continue
                    u = url_match.group()

                    # Extract title (div.title inside snippet)
                    title_el = snippet.select_one("div.title")
                    title = title_el.get_text(strip=True) if title_el else "FShare"
                    # Clean up: Brave prepends "Fshare - " to most titles
                    title = re.sub(r'^Fshare\s*[-–]\s*', '', title).strip() or title

                    # Extract description snippet
                    desc_el = snippet.select_one("div.generic-snippet p, p.snippet-description")
                    desc = desc_el.get_text(strip=True) if desc_el else ""

                    if u not in seen:
                        results.append(_make_result(u, title, "brave", desc))
                        seen.add(u)
            except ImportError:
                # BeautifulSoup not available — fallback to regex
                for u in _extract(html):
                    if u not in seen:
                        results.append(_make_result(u, "FShare", "brave"))
                        seen.add(u)

            return results
    except Exception:
        return []


# ── Engine 2: DuckDuckGo ──────────────────────────────────────────────────────

async def _ddg(query: str) -> List[Dict[str, str]]:
    try:
        from ddgs import DDGS

        def _sync():
            with DDGS() as ddgs:
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


# ── Engine 3: SearXNG public instances ───────────────────────────────────────

_SEARXNG_INSTANCES = [
    "https://search.hbubli.cc",
    "https://searx.ox2.fr",
    "https://search.bus-hit.me",
    "https://searx.tiekoetter.com",
    "https://search.ononoki.org",
    "https://searxng.site",
    "https://searx.be",
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


# ── Engine 4: Google (curl-cffi browser impersonation) ───────────────────────

_GOOGLE_REDIRECT_RE = re.compile(
    r'/url\?q=(https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+)'
)

async def _google(query: str) -> List[Dict[str, str]]:
    """
    Use curl-cffi to impersonate Chrome's TLS fingerprint.
    Falls back to plain httpx if curl-cffi is unavailable.
    """
    search_url = (
        "https://www.google.com/search"
        f"?q=site%3Afshare.vn+{urllib.parse.quote(query)}&hl=vi&gl=vn&num=20"
    )
    headers = {
        **_HEADERS,
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "DNT": "1",
    }

    async def _fetch_with_cffi() -> str:
        from curl_cffi.requests import AsyncSession
        async with AsyncSession(impersonate="chrome124") as s:
            r = await s.get(search_url, headers=headers, timeout=15)
            if r.status_code != 200 or "enablejs" in r.text:
                return ""
            return r.text

    async def _fetch_with_httpx() -> str:
        async with httpx.AsyncClient(timeout=15.0, headers=headers, follow_redirects=True) as c:
            r = await c.get(search_url)
            if r.status_code != 200 or "enablejs" in r.text:
                return ""
            return r.text

    try:
        try:
            html = await _fetch_with_cffi()
        except ImportError:
            html = await _fetch_with_httpx()

        if not html:
            return []

        results = []
        seen: set = set()

        # Google wraps result links as /url?q=https://fshare.vn/...
        for match in _GOOGLE_REDIRECT_RE.finditer(html):
            u = urllib.parse.unquote(match.group(1))
            if u not in seen:
                results.append(_make_result(u, "FShare", "google"))
                seen.add(u)

        # Fallback: direct fshare URLs in page source
        for u in _extract(html):
            if u not in seen:
                results.append(_make_result(u, "FShare", "google"))
                seen.add(u)

        return results
    except Exception:
        return []


# ── FShare name enrichment & relevance check ─────────────────────────────────

# Names that give no information about the actual file content
_GENERIC_NAME_RE = re.compile(
    r'^(\[(?:4K|Remux|1080p|720p|mHD|CAM|HD)\]\s*)?'   # strip quality prefix
    r'(fshare|link to fshare\.vn|www\.fshare\.vn'
    r'|untitled.*fshare|không tìm thấy'
    r'|[A-Z0-9]{6,20}'                                    # bare file/folder ID
    r')$',
    re.IGNORECASE,
)

def _is_generic(name: str) -> bool:
    return bool(_GENERIC_NAME_RE.match(name.strip()))

_FSHARE_TITLE_RE = re.compile(r'<title>([^<]+)</title>', re.IGNORECASE)

_FSHARE_EXPIRED = object()  # sentinel: file deleted/private

async def _fshare_fetch_name(url: str):
    """
    Scrape the FShare page and return the clean name.
    Results are cached for 7 days to avoid hammering the FShare site.
    Returns:
      str             — real name (success)
      _FSHARE_EXPIRED — file is deleted / private / not found
      None            — network/timeout error (unknown state)
    """
    cached = get_from_cache(_FSHARE_NAME_CACHE, url, _FSHARE_NAME_TTL)
    if cached is not None:
        return _FSHARE_EXPIRED if cached == "__expired__" else cached

    try:
        async with httpx.AsyncClient(timeout=8.0, headers=_HEADERS, follow_redirects=True) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return None
            m = _FSHARE_TITLE_RE.search(r.text)
            if not m:
                return None
            raw = m.group(1).strip()
            if 'không tìm thấy' in raw.lower() or 'not found' in raw.lower():
                set_to_cache(_FSHARE_NAME_CACHE, url, "__expired__")
                return _FSHARE_EXPIRED
            name = re.sub(r'^Fshare\s*[-–]\s*', '', raw, flags=re.IGNORECASE)
            name = re.sub(r'\s*[-–]\s*Fshare$', '', name, flags=re.IGNORECASE).strip()
            if name:
                set_to_cache(_FSHARE_NAME_CACHE, url, name)
            return name or None
    except Exception:
        return None  # network error — not cached, will retry next time

_STOP_WORDS = {
    'the','a','an','of','in','on','at','to','and','or','for','with',
    'đảo','hải','tặc','phim','bộ','tập','full','hd','vietsub','thuyết',
    'minh','lồng','tiếng','việt','nam','season','series','collection',
}

def _is_relevant(name: str, title: str) -> bool:
    """
    Check if the FShare file/folder name is relevant to the search title.
    Uses keyword overlap: at least half the significant title words must appear in the name.
    """
    def keywords(text: str):
        words = re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split()
        return {w for w in words if len(w) > 2 and w not in _STOP_WORDS}

    title_kw = keywords(title)
    if not title_kw:
        return True   # nothing to filter against
    name_kw  = keywords(name)
    overlap  = title_kw & name_kw
    return len(overlap) >= max(1, len(title_kw) // 2)

async def _enrich(result: Dict, title: str) -> Optional[Dict]:
    """
    Enrich and filter a single search result against the search title.

    Non-generic name (e.g. proper filename from Brave/DDG):
      → check relevance directly, discard if irrelevant

    Generic name (bare ID / "Fshare" / "Link to fshare.vn"):
      → fetch real name from FShare page, then:
          expired/deleted → discard
          irrelevant name → discard
          relevant name   → update name/quality and keep
          fetch failed    → keep as-is (benefit of doubt)
    """
    name = result.get("name", "")

    if not _is_generic(name):
        # Strip quality prefix for relevance check
        clean = re.sub(r'^\[(?:4K|Remux|1080p|720p|mHD|CAM|HD)\]\s*', '', name).strip()
        return result if _is_relevant(clean, title) else None

    fetched = await _fshare_fetch_name(result["url"])

    if fetched is _FSHARE_EXPIRED:
        return None

    if fetched is None:
        return result  # network error → keep with generic name

    if not _is_relevant(fetched, title):
        return None

    quality = _parse_quality(fetched)
    return {
        **result,
        "name": f"[{quality}] {fetched}",
        "quality": quality,
    }


# ── Public entry point ────────────────────────────────────────────────────────

async def lookup_google_fshare(
    title: str,
    year: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None,
) -> List[Dict[str, str]]:
    # 1. Clean title
    clean_title = re.sub(r'[\(\)\[\]]', ' ', title).strip()

    # 2. Cache key — includes all search params
    cache_key = f"{clean_title}|{year or ''}|{season or ''}|{episode or ''}"
    cached = get_from_cache(_FSHARE_SEARCH_CACHE, cache_key, _FSHARE_SEARCH_TTL)
    if cached is not None:
        return cached

    # 3. Build queries
    q1_parts = [clean_title]
    if year: q1_parts.append(str(year))
    if season and episode: q1_parts.append(f"S{season:02d}E{episode:02d}")
    queries = [" ".join(q1_parts)]
    if len(clean_title.split()) > 1:
        queries.append(f'"{clean_title}"')

    results = []
    seen: set = set()

    for q in queries:
        batches = await asyncio.gather(
            _brave(q),
            _ddg(q),
            _searxng(q),
            _google(q),
            return_exceptions=True
        )

        for batch in batches:
            if not isinstance(batch, list):
                continue
            for item in batch:
                u = item.get("url", "")
                if u and u not in seen:
                    results.append(item)
                    seen.add(u)

        if len(results) >= 10:
            break

    # 4. Enrich generic names via FShare page + filter irrelevant results
    enriched = await asyncio.gather(
        *[_enrich(r, clean_title) for r in results],
        return_exceptions=True
    )
    results = [r for r in enriched if isinstance(r, dict)]

    # 5. Sort: 4K first, CAM last
    quality_map = {'4K': 0, 'Remux': 1, '1080p': 2, '720p': 3, 'HD': 4, 'mHD': 5, 'CAM': 6}
    results.sort(key=lambda x: quality_map.get(x.get('quality', 'HD'), 10))

    set_to_cache(_FSHARE_SEARCH_CACHE, cache_key, results)
    return results
