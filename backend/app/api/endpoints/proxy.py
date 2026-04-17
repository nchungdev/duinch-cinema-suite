import hashlib
import os
import time
from fastapi import APIRouter, Request, Response, Query
from fastapi.responses import FileResponse, RedirectResponse
import httpx
from urllib.parse import urljoin

from app.core import config

router = APIRouter()
CACHE_DIR = config.IMAGE_CACHE_DIR
os.makedirs(CACHE_DIR, exist_ok=True)

@router.get("/image")
async def proxy_image(request: Request, url: str = Query(...)):
    """Proxy and cache images locally to speed up frontend loading."""
    if not url or not url.startswith('http'):
        return Response(status_code=400)
        
    # Generate a unique cache filename based on the URL
    url_hash = hashlib.md5(url.encode()).hexdigest()
    # Basic extension detection
    ext = ".jpg" 
    if ".png" in url.lower(): ext = ".png"
    elif ".webp" in url.lower(): ext = ".webp"
    
    cache_path = os.path.join(CACHE_DIR, f"{url_hash}{ext}")
    
    # Return from cache if exists and not older than 1 hour
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
        # Fallback if status not 200
        return RedirectResponse(url)
    except Exception as e:
        print(f"Proxy error for {url}: {e}")
        return RedirectResponse(url)

@router.get("/m3u8")
async def proxy_m3u8(request: Request, url: str = Query(...)):
    """Proxy and rewrite M3U8 playlists."""
    client = request.app.state.http_client
    
    try:
        resp = await client.get(url, follow_redirects=True)
        content = resp.text
        base_url = str(resp.url)
        
        lines = content.splitlines()
        new_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if line.startswith("#"):
                # Rewrite URI="..." bên trong các tags như #EXT-X-KEY, #EXT-X-MEDIA, v.v.
                if 'URI="' in line:
                    start = line.find('URI="') + 5
                    end = line.find('"', start)
                    uri = line[start:end]
                    absolute_uri = urljoin(base_url, uri)
                    # Nested playlist → proxy lại để tiếp tục rewrite
                    proxy_uri = f"{request.url.scheme}://{request.url.netloc}/api/proxy/m3u8?url={absolute_uri}"
                    line = line[:start] + proxy_uri + line[end:]
                new_lines.append(line)
            else:
                # Segment hoặc media playlist URI (non-comment line)
                absolute_uri = urljoin(base_url, line)
                # Nếu là media playlist (.m3u8) → proxy để rewrite tiếp segment bên trong
                # Nếu là segment (.ts, .aac, .mp4, ...) → return absolute URL trực tiếp
                if ".m3u8" in absolute_uri.split("?")[0]:
                    proxy_uri = f"{request.url.scheme}://{request.url.netloc}/api/proxy/m3u8?url={absolute_uri}"
                    new_lines.append(proxy_uri)
                else:
                    new_lines.append(absolute_uri)
                
        return Response(
            content="\n".join(new_lines),
            media_type="application/vnd.apple.mpegurl"
        )
    except Exception as e:
        return Response(content=f"Proxy error: {str(e)}", status_code=500)
