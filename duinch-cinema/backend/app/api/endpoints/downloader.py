from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import httpx
from app.use_cases.downloader import DownloaderUseCase

router = APIRouter()
downloader_use_case = DownloaderUseCase()

@router.get("/health")
async def jd_health():
    """Check if JDownloader service is online."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{config.DOWNLOADER_URL}/health")
            if resp.status_code == 200:
                return resp.json()
            return {"status": "disconnected"}
    except Exception:
        return {"status": "offline"}

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
    url: str = Body(...), 
    name: str = Body(...),
    folder: Optional[str] = Body(None),
    package_name: Optional[str] = Body(None),
    title: Optional[str] = Body(None), 
    media_type: str = Body("movie"),
    year: Optional[str] = Body(None),
    season: Optional[int] = Body(None)
):
    """Add a new download task to JDownloader via microservice."""
    try:
        # If package_name is not provided, use title or name
        final_package = package_name or title or name
        result = await downloader_use_case.add_download(
            url=url, name=name, title=title or name, 
            year=year, media_type=media_type, season=season
        )
        # We might need to override the calculated folder if provided
        if folder:
            result['path'] = folder
            
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
