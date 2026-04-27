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
    r"/adjump/",            # phim1280.tv / kkphim SSAI ad path
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
        return RedirectResponse(url)

def _proxy_m3u8_url(base: str, request: Request) -> str:
    return f"{request.url.scheme}://{request.url.netloc}/api/proxy/m3u8?url={base}"


def _rewrite_tag_uris(line: str, base_url: str, request: Request) -> str | None:
    """Rewrite URI="…" inside a tag. Returns None if the URI is blocked."""
    if 'URI="' not in line:
        return line
    before, rest = line.split('URI="', 1)
    uri, after = rest.split('"', 1)
    abs_uri = urljoin(base_url, uri)
    if is_blocked_url(abs_uri):
        return None
    if ".m3u8" in abs_uri.split("?")[0]:
        abs_uri = _proxy_m3u8_url(abs_uri, request)
    return f'{before}URI="{abs_uri}"{after}'


def _split_into_blocks(lines: list[str]) -> list[list[str]]:
    """Split a media playlist into blocks at every #EXT-X-DISCONTINUITY marker."""
    blocks: list[list[str]] = [[]]
    for line in lines:
        if line.strip() == "#EXT-X-DISCONTINUITY":
            blocks.append([])
        else:
            blocks[-1].append(line)
    return blocks


def _is_ad_block(block: list[str], base_url: str) -> bool:
    """Return True when EVERY segment URI in the block is an ad URL."""
    segs = [l.strip() for l in block if l.strip() and not l.strip().startswith("#")]
    if not segs:
        return False   # empty or header-only block → keep
    return all(is_blocked_url(urljoin(base_url, s)) for s in segs)


@router.get("/m3u8")
async def proxy_m3u8(request: Request, url: str = Query(...)):
    """
    Proxy M3U8 playlists with aggressive ad filtering:
    - Block-level: drops entire DISCONTINUITY blocks where all segments are ads
      (catches server-side ad insertion like /adjump/ on phim1280/kkphim)
    - Segment-level: drops individual ad segments by URL pattern
    - Tag-level: strips tracking tags (#EXT-X-DATERANGE, CUE-OUT/IN, SCTE35…)
    - Forwards realistic Referer/UA so CDNs don't 403
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

        base_url = str(resp.url)
        raw_lines = resp.text.splitlines()

        # ── Detect playlist type ──────────────────────────────────────────
        is_media_playlist = any(l.strip().startswith("#EXTINF") for l in raw_lines)

        if is_media_playlist:
            # ── BLOCK-LEVEL pass (SSAI ad removal) ───────────────────────
            # Split into blocks at every #EXT-X-DISCONTINUITY boundary,
            # drop blocks where all segments are ad paths (/adjump/ etc.),
            # re-join with a single DISCONTINUITY marker between surviving blocks.
            blocks = _split_into_blocks(raw_lines)
            clean_blocks = [b for b in blocks if not _is_ad_block(b, base_url)]

            # Flatten: insert DISCONTINUITY only between adjacent surviving blocks
            # (skip if a block was at position 0 / end — no leading/trailing marker)
            flat: list[str] = []
            for idx, block in enumerate(clean_blocks):
                if idx > 0:
                    flat.append("#EXT-X-DISCONTINUITY")
                flat.extend(block)
        else:
            flat = raw_lines   # master playlist — no block splitting needed

        # ── LINE-LEVEL pass (segment + tag filtering + URI rewriting) ────
        out: list[str] = []
        i = 0
        while i < len(flat):
            line = flat[i].strip()
            i += 1

            if not line:
                continue

            # Drop tracking tags
            if any(line.startswith(pfx) for pfx in STRIP_TAG_PREFIXES):
                continue

            # Drop tags containing blocked URLs
            if line.startswith("#") and is_blocked_url(line):
                continue

            # #EXTINF — peek ahead and validate the segment URI
            if line.startswith("#EXTINF:"):
                j = i
                while j < len(flat) and not flat[j].strip():
                    j += 1
                if j < len(flat):
                    seg = flat[j].strip()
                    if not seg.startswith("#"):
                        abs_seg = urljoin(base_url, seg)
                        if is_blocked_url(abs_seg):
                            i = j + 1   # drop both EXTINF + segment
                            continue
                        out.append(line)
                        out.append(abs_seg)
                        i = j + 1
                        continue
                out.append(line)
                continue

            # Other tags — rewrite URI="…" if present
            if line.startswith("#"):
                rewritten = _rewrite_tag_uris(line, base_url, request)
                if rewritten is not None:
                    out.append(rewritten)
                continue

            # Bare URL (sub-playlist or untagged segment)
            abs_uri = urljoin(base_url, line)
            if is_blocked_url(abs_uri):
                continue
            if ".m3u8" in abs_uri.split("?")[0]:
                abs_uri = _proxy_m3u8_url(abs_uri, request)
            out.append(abs_uri)

        # Remove duplicate / consecutive DISCONTINUITY markers left by block joins
        deduped: list[str] = []
        for line in out:
            if line == "#EXT-X-DISCONTINUITY" and deduped and deduped[-1] == "#EXT-X-DISCONTINUITY":
                continue
            deduped.append(line)
        # Also strip a leading DISCONTINUITY (can appear if first block was all ads)
        while deduped and deduped[0] == "#EXT-X-DISCONTINUITY":
            deduped.pop(0)

        filtered = len(raw_lines) - len(out)
        if filtered > 0:
            print(f"[M3U8 Proxy] Filtered {filtered} lines from {url}")

        return Response(
            content="\n".join(deduped) + "\n",
            media_type="application/vnd.apple.mpegurl",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"},
        )

    except Exception as e:
        print(f"[M3U8 Proxy] Error for {url}: {e}")
        return Response(content=f"Proxy error: {e}", status_code=502)
