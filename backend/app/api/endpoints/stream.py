from fastapi import APIRouter, Query, HTTPException, Depends, Body
from app.services import torrent_service, fshare_service, user_service
from app.api.deps import get_device_id
from typing import Dict, Any
import time

router = APIRouter()

@router.get("/torrent")
async def stream_torrent(magnet: str = Query(...)):
...
    return {
        "data": {
            "stream_url": stream_url,
            "info": "Connecting to peers... video will start shortly."
        },
        "error_code": 0,
        "error_msg": ""
    }

@router.post("/fshare/login")
async def fshare_login(data: Dict[str, str] = Body(...), device_id: str = Depends(get_device_id)):
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Missing credentials")
    
    token = await fshare_service.login(email, password)
    if not token:
        raise HTTPException(status_code=401, detail="Fshare login failed")
    
    # Save session to user settings (Persistent SQLite)
    settings = user_service.get_user_data(device_id, "settings").get("global", {})
    settings["fshare_session"] = {
        "email": email,
        "token": token,
        "updated_at": int(time.time())
    }
    user_service.save_user_item(device_id, "settings", "global", settings)
    
    return {"data": {"email": email, "status": "logged_in"}, "error_code": 0, "error_msg": ""}

@router.get("/fshare/resolve")
async def fshare_resolve(url: str = Query(...), device_id: str = Depends(get_device_id)):
    settings = user_service.get_user_data(device_id, "settings").get("global", {})
    session = settings.get("fshare_session")
    
    if not session or not session.get("token"):
        raise HTTPException(status_code=403, detail="Fshare login required")
    
    direct_link = await fshare_service.get_direct_link(url, session["token"])
    if not direct_link:
        # Token might be expired, try to re-login if we have password? 
        # For now, just ask to re-login.
        raise HTTPException(status_code=401, detail="Session expired or invalid link")
        
    return {"data": {"stream_url": direct_link}, "error_code": 0, "error_msg": ""}
