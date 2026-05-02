from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from typing import List, Optional
import httpx
import asyncio
from app.use_cases.downloader import DownloaderUseCase
from app.infrastructure.clients.jd_client import jd_direct_client
from app.core import config

router = APIRouter()
downloader_use_case = DownloaderUseCase()

@router.get("/health")
async def jd_health(device: Optional[str] = Query(None)):
    """Check if JDownloader service is online."""
    try:
        cfg = jd_direct_client.config
        local_online = await jd_direct_client.local.is_alive()

        if not cfg.get("email"):
            return {
                "status": "healthy" if local_online else "no_credentials",
                "local_online": local_online,
                "devices": [],
                "email": None,
            }

        # Use asyncio.to_thread for blocking SDK calls
        current_device = await asyncio.to_thread(jd_direct_client.get_device, device)
        devices = await asyncio.to_thread(jd_direct_client.list_devices)
        
        return {
            "status": "healthy" if (current_device or local_online) else "no_devices",
            "local_online": local_online,
            "current_device": current_device.name if current_device else None,
            "devices": devices,
            "email": cfg.get("email")
        }
    except Exception as e:
        return {"status": "disconnected", "detail": str(e)}

@router.post("/config")
async def jd_config(email: str = Body(...), password: str = Body(...)):
    """Update MyJDownloader credentials directly."""
    try:
        success = await asyncio.to_thread(jd_direct_client.update_credentials, email, password)
        if not success:
            raise HTTPException(status_code=401, detail="Invalid MyJDownloader credentials")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.post("/logout")
async def jd_logout():
    try:
        await asyncio.to_thread(jd_direct_client.logout)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
async def jd_list(device: Optional[str] = Query(None)):
    """List current download packages."""
    try:
        data = await downloader_use_case.list_packages(device)
        return {"data": data, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": [], "error_code": 500, "error_msg": str(e)}

@router.post("/control")
async def jd_control(
    action: str,
    device: Optional[str] = Query(None),
    ids: List[str] = Body(default=[]),
    kind: str = Body(default="package"),
):
    """Control download process."""
    try:
        await downloader_use_case.control_downloads(action, ids, kind, device)
        return {"data": {"success": True}, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": {"success": False}, "error_code": 500, "error_msg": str(e)}

@router.post("/add")
async def jd_download(
    url: str = Body(...), 
    name: str = Body(...),
    folder: Optional[str] = Body(None),
    package_name: Optional[str] = Body(None),
    title: Optional[str] = Body(None), 
    media_type: str = Body("movie"),
    year: Optional[str] = Body(None),
    season: Optional[int] = Body(None)
):
    """Add a new download task directly to JDownloader."""
    try:
        result = await downloader_use_case.add_download(
            url=url, name=name, title=title or name, 
            year=year, media_type=media_type, season=season
        )
        if folder: result['path'] = folder
        return {"data": result, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": None, "error_code": 500, "error_msg": str(e)}

@router.get("/proxy-download")
async def proxy_download(url: str):
    try:
        filename = url.split("/")[-1].split("?")[0] or "download"
        if "." not in filename: filename += ".bin"
        async def stream_content():
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", url, follow_redirects=True) as resp:
                    async for chunk in resp.aiter_bytes(): yield chunk
        return StreamingResponse(stream_content(), headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import subprocess
import urllib.parse

@router.get("/proxy-download-hls")
async def proxy_download_hls(url: str, name: str):
    """Download M3U8 stream, mux to MP4 on the fly using FFmpeg, and stream directly to client."""
    try:
        # Sanitize filename
        safe_name = "".join(c for c in name if c.isalnum() or c in " ._-").strip()
        filename = f"{safe_name}.mp4"
        encoded_filename = urllib.parse.quote(filename)

        async def stream_ffmpeg():
            process = subprocess.Popen(
                ["ffmpeg", "-i", url, "-c", "copy", "-bsf:a", "aac_adtstoasc", "-f", "mp4", "pipe:1"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL
            )
            while True:
                chunk = process.stdout.read(8192)
                if not chunk:
                    break
                yield chunk
            process.stdout.close()
            process.wait()

        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Content-Type": "video/mp4"
        }
        return StreamingResponse(stream_ffmpeg(), headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
