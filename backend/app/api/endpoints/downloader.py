from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import httpx
import re
import os
from app.core import config
from app.core.jd import jd_manager

router = APIRouter()

def sanitize_filename(name: str):
    return re.sub(r'[\\/*?:"<>|]', "", name).replace(":", " -").strip()

def extract_season(text: str):
    patterns = [r'[Pp]hần\s*(\d+)', r'[Ss]eason\s*(\d+)', r'[Ss](\d+)']
    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return 1

@router.get("/list")
async def jd_list():
    """List current download packages."""
    try:
        device = await jd_manager.get_device()
        pkgs = device.downloads.query_packages([{"bytesLoaded": True, "bytesTotal": True, "running": True, "status": True, "speed": True, "eta": True, "uuid": True, "enabled": True}])
        return [{
            "uuid": p.get("uuid"),
            "name": p.get("name"),
            "bytesLoaded": p.get("bytesLoaded", 0),
            "bytesTotal": p.get("bytesTotal", 0),
            "speed": p.get("speed", 0),
            "eta": p.get("eta", 0),
            "status": p.get("status", "Idle"),
            "running": p.get("running", False),
            "enabled": p.get("enabled", True)
        } for p in pkgs]
    except Exception:
        return []

@router.post("/control")
async def jd_control(action: str, uuids: List[str] = Query([])):
    """Control download process (START, STOP, REMOVE, etc.)."""
    try:
        device = await jd_manager.get_device()
        if action == "START":
            device.downloads.start_downloads()
        elif action == "STOP":
            device.downloads.stop_downloads()
        elif action == "RESUME_JOB":
            device.downloads.id_enabled(True, uuids, [])
        elif action == "STOP_JOB":
            device.downloads.id_enabled(False, uuids, [])
        elif action == "REMOVE_JOB":
            device.downloads.remove_downloads(uuids, [])
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@router.post("/add")
async def jd_download(
    url: str, name: str, title: str, 
    origin_name: Optional[str] = None, year: Optional[str] = None,
    media_type: str = "movie", collection: Optional[str] = None, season: Optional[int] = None
):
    """Add a new download task to JDownloader."""
    try:
        device = await jd_manager.get_device()
        jd_base = config.JD_INTERNAL_PATH
        
        if media_type == "tv" and season is None:
            season = extract_season(title)
            if season == 1 and origin_name:
                s_origin = extract_season(origin_name)
                if s_origin > 1:
                    season = s_origin
        
        clean_title_only = re.sub(r'([Pp]hần|[Ss]eason|[Ss])\s*\d+', '', title, flags=re.IGNORECASE).strip()
        clean_title = sanitize_filename(clean_title_only)
        clean_segment = sanitize_filename(name)
        
        if media_type == "movie":
            display_title = f"{clean_title} ({year})" if year else clean_title
            package_name = display_title
            filename = f"{display_title}.mp4" if "m3u8" in url.lower() or "index" in url.lower() else ""
            download_path = os.path.join(jd_base, "Movies", display_title)
        else:
            season_str = f"Season {season:02d}" if season else "Season 01"
            package_name = f"{clean_title} - {season_str} - {clean_segment}"
            filename = f"{package_name}.mp4" if "m3u8" in url.lower() or "index" in url.lower() else ""
            download_path = os.path.join(jd_base, "TV Shows", clean_title, season_str)

        device.linkgrabber.add_links([{
            "links": url, "downloadFolder": download_path, "packageName": package_name,
            "destinationFilename": filename, "autostart": True, "autoConfirm": True
        }])
        return {"success": True, "path": download_path, "package": package_name}
    except Exception as e:
        return {"error": str(e)}

@router.get("/proxy-download")
async def proxy_download(url: str):
    try:
        filename = url.split("/")[-1].split("?")[0] or "download"
        if "." not in filename:
            filename += ".bin"
        async def stream_content():
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", url, follow_redirects=True) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        return StreamingResponse(stream_content(), headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
