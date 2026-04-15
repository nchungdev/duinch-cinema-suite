from fastapi import APIRouter, Request, Response, Query
import httpx
from urllib.parse import urljoin

router = APIRouter()

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
