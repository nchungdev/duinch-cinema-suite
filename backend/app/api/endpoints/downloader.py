from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import httpx
from app.use_cases.downloader import DownloaderUseCase

router = APIRouter()
downloader_use_case = DownloaderUseCase()

@router.get("/list")
async def jd_list():
    """List current download packages."""
    try:
        data = await downloader_use_case.list_packages()
        return {"data": data, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": [], "error_code": 500, "error_msg": str(e)}

@router.post("/control")
async def jd_control(action: str, uuids: List[str] = Query([])):
    """Control download process."""
    try:
        await downloader_use_case.control_downloads(action, uuids)
        return {"data": {"success": True}, "error_code": 0, "error_msg": ""}
    except Exception as e:
        return {"data": {"success": False}, "error_code": 500, "error_msg": str(e)}

@router.post("/add")
async def jd_download(
    url: str, name: str, title: str, 
    origin_name: Optional[str] = None, year: Optional[str] = None,
    media_type: str = "movie", collection: Optional[str] = None, season: Optional[int] = None
):
    """Add a new download task to JDownloader."""
    try:
        result = await downloader_use_case.add_download(url, name, title, origin_name, year, media_type, season)
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
