from fastapi import APIRouter, Query, HTTPException, Depends, Body
from app.api.deps import get_device_id
from app.use_cases.stream import StreamUseCase
from typing import Dict, Any

router = APIRouter()
stream_use_case = StreamUseCase()

@router.get("/torrent")
async def stream_torrent(magnet: str = Query(...)):
    """Kích hoạt bộ stream torrent."""
    stream_url = stream_use_case.start_torrent_stream(magnet)
    if not stream_url:
        raise HTTPException(status_code=500, detail="Failed to start torrent stream engine")
    return {"data": {"stream_url": stream_url}, "error_code": 0, "error_msg": ""}

@router.post("/fshare/login")
async def fshare_login(data: Dict[str, str] = Body(...), device_id: str = Depends(get_device_id)):
    email, password = data.get("email"), data.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Missing credentials")
    
    success = await stream_use_case.fshare_login(device_id, email, password)
    if not success:
        raise HTTPException(status_code=401, detail="Fshare login failed")
    
    return {"data": {"email": email, "status": "logged_in"}, "error_code": 0, "error_msg": ""}

@router.get("/fshare/resolve")
async def fshare_resolve(url: str = Query(...), device_id: str = Depends(get_device_id)):
    direct_link = await stream_use_case.get_fshare_direct_link(device_id, url)
    if not direct_link:
        raise HTTPException(status_code=403, detail="Fshare login required or link invalid")
    return {"data": {"stream_url": direct_link}, "error_code": 0, "error_msg": ""}
