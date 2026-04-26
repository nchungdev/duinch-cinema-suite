import hashlib
import os
import time
import re
from fastapi import APIRouter, Request, Response, Query
from fastapi.responses import FileResponse, RedirectResponse
import httpx
from urllib.parse import urljoin, urlparse

from app.core import config

router = APIRouter()
CACHE_DIR = config.IMAGE_CACHE_DIR
os.makedirs(CACHE_DIR, exist_ok=True)

# ── Tracker / ad domains – any URL containing these is dropped ─────────────
BLOCKED_DOMAINS = {
    "dtscout.com", "doubleclick.net", "googletagmanager.com",
    "google-analytics.com", "googlesyndication.com", "adnxs.com",
    "adsrvr.org", "rubiconproject.com", "openx.net", "pubmatic.com",
    "moatads.com", "scorecardresearch.com", "quantserve.com",
    "2mdn.net", "adform.net", "criteo.com", "taboola.com", "outbrain.com",
    "phimapi.com/ads", "vidoomy.com",
}

# ── Segment-URL heuristics (path / query keywords) ────────────────────────
AD_SEGMENT_PATTERNS = [
    r"[/=]ads?[/=_]", r"pre[-_]roll", r"mid[-_]roll", r"post[-_]roll",
    r"ad[-_]delivery", r"ad[-_]stream", r"adv_", r"_ad_",
    r"vast", r"vpaid", r"banner", r"popunder", r"pop-under",
    r"market[-_]streaming", r"clon[-_]edge",
    r"1080p_00\d\.ts",     # fake timing segments
    r"doubleclick", r"dtscout",
]

# ── HLS manifest tags to strip entirely ───────────────────────────────────
STRIP_TAG_PREFIXES = (
    "#EXT-X-DATERANGE",     # SCTE-35 / beacon tracking ranges
    "#EXT-X-CUE-OUT",       # ad-break start
    "#EXT-X-CUE-IN",        # ad-break end
    "#EXT-X-SCTE35",        # SCTE-35 binary
    "#EXT-OATCLS-SCTE35",
    "#EXT-X-OATCLS-SCTE35",
    "#EXT-X-ASSET",         # some providers put tracker URLs here
)


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def is_blocked_url(url: str) -> bool:
    """Return True if the URL points to an ad/tracker resource."""
    dom = _domain(url)
    for blocked in BLOCKED_DOMAINS:
        if dom == blocked or dom.endswith("." + blocked) or blocked in url:
            return True
    for pattern in AD_SEGMENT_PATTERNS:
        if re.search(pattern, url, re.IGNORECASE):
            return True
    return False

@router.get("/image")
async def proxy_image(request: Request, url: str = Query(...)):
    """Proxy and cache images locally to speed up frontend loading."""
    if not url:
        return Response(status_code=400)
    
    # Handle TMDB relative paths
    if url.startswith('/'):
        url = f"https://image.tmdb.org/t/p/w500{url}"
        
    if not url.startswith('http'):
        return Response(status_code=400)
        
    # Generate a unique cache filename based on the URL
    url_hash = hashlib.md5(url.encode()).hexdigest()
    # Basic extension detection
    ext = ".jpg" 
    if ".png" in url.lower(): ext = ".png"
    elif ".webp" in url.lower(): ext = ".webp"
    
    cache_path = os.path.join(CACHE_DIR, f"{url_hash}{ext}")
    
    # Return from cache if exists and not older than TTL
    if os.path.exists(cache_path):
        mtime = os.path.getmtime(cache_path)
        if (time.time() - mtime) < config.IMAGE_CACHE_TTL:
            return FileResponse(
                cache_path, 
                headers={"Cache-Control": f"public, max-age={config.IMAGE_CACHE_TTL}"}
            )
    
    # Otherwise, download and cache
    client = request.app.state.http_client
    try:
        resp = await client.get(url, follow_redirects=True, timeout=10)
        if resp.status_code == 200:
            with open(cache_path, "wb") as f:
                f.write(resp.content)
            return Response(
                content=resp.content,
                media_type=resp.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": f"public, max-age={config.IMAGE_CACHE_TTL}"}
            )
        return RedirectResponse(url)
    except Exception as e:
        print(f"Proxy error for {url}: {e}")
        return RedirectResponse(url)

def _proxy_m3u8_url(base: str, request: Request) -> str:
    """Wrap a sub-playlist URL so it also goes through this proxy."""
    return f"{request.url.scheme}://{request.url.netloc}/api/proxy/m3u8?url={base}"


@router.get("/m3u8")
async def proxy_m3u8(request: Request, url: str = Query(...)):
    """
    Proxy M3U8 playlists through the backend.
    - Strips ad/tracker segments (#EXTINF blocks whose URI matches blocklist)
    - Strips tracking HLS tags (#EXT-X-DATERANGE, #EXT-X-CUE-OUT/IN, …)
    - Rewrites sub-playlist URIs so nested playlists also pass through this proxy
    - Forwards a realistic Referer/User-Agent so CDNs don't 403
    """
    client: httpx.AsyncClient = request.app.state.http_client
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    fetch_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Referer": origin + "/",
        "Origin": origin,
    }

    try:
        resp = await client.get(url, headers=fetch_headers, follow_redirects=True, timeout=15)
        if resp.status_code != 200:
            return Response(content=resp.text, status_code=resp.status_code)

        base_url = str(resp.url)   # final URL after any redirects
        lines = resp.text.splitlines()
        out: list[str] = []
        skip_next_segment = False
        i = 0

        while i < len(lines):
            raw = lines[i]
            line = raw.strip()
            i += 1

            # ── Empty lines ──────────────────────────────────────────────
            if not line:
                continue

            # ── Tags to drop entirely (tracking / ad-break markers) ──────
            if any(line.startswith(pfx) for pfx in STRIP_TAG_PREFIXES):
                continue

            # ── Drop any tag whose value contains a blocked URL ──────────
            if line.startswith("#") and is_blocked_url(line):
                continue

            # ── #EXTINF — peek at next non-empty line for segment URI ────
            if line.startswith("#EXTINF:"):
                # look ahead for the segment URL
                j = i
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines):
                    seg = lines[j].strip()
                    if not seg.startswith("#"):
                        abs_seg = urljoin(base_url, seg)
                        if is_blocked_url(abs_seg):
                            # drop both #EXTINF and the segment line
                            i = j + 1
                            continue
                        # segment is clean — emit #EXTINF, then absolute URI
                        out.append(line)
                        out.append(abs_seg)
                        i = j + 1
                        continue
                # no segment line found — keep the #EXTINF as-is
                out.append(line)
                continue

            # ── Other tags: rewrite URI="…" attributes ───────────────────
            if line.startswith("#"):
                if 'URI="' in line:
                    before, rest = line.split('URI="', 1)
                    uri, after = rest.split('"', 1)
                    abs_uri = urljoin(base_url, uri)
                    if is_blocked_url(abs_uri):
                        continue   # drop the whole tag
                    # sub-playlists → also proxy them
                    if ".m3u8" in abs_uri.split("?")[0]:
                        abs_uri = _proxy_m3u8_url(abs_uri, request)
                    line = f'{before}URI="{abs_uri}"{after}'
                out.append(line)
                continue

            # ── Bare URL line (nested playlist or segment without #EXTINF) ─
            abs_uri = urljoin(base_url, line)
            if is_blocked_url(abs_uri):
                continue
            if ".m3u8" in abs_uri.split("?")[0]:
                abs_uri = _proxy_m3u8_url(abs_uri, request)
            out.append(abs_uri)

        return Response(
            content="\n".join(out) + "\n",
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
            },
        )

    except Exception as e:
        print(f"[M3U8 Proxy] Error for {url}: {e}")
        return Response(content=f"Proxy error: {e}", status_code=502)
