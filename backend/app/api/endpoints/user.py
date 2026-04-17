from fastapi import APIRouter, Depends, Body
from app.api.deps import get_device_id
from app.services import user_service
from typing import Dict, Any

router = APIRouter()

@router.get("/progress")
async def get_all_progress(device_id: str = Depends(get_device_id)):
    return {"data": user_service.get_user_data(device_id, "progress"), "error_code": 0, "error_msg": ""}

@router.post("/progress/{item_id}")
async def save_progress(item_id: str, data: Dict[str, Any] = Body(...), device_id: str = Depends(get_device_id)):
    user_service.save_user_item(device_id, "progress", item_id, data)
    return {"data": True, "error_code": 0, "error_msg": ""}

@router.get("/history")
async def get_history(device_id: str = Depends(get_device_id)):
    return {"data": user_service.get_user_data(device_id, "history"), "error_code": 0, "error_msg": ""}

@router.post("/history/{item_id}")
async def add_history(item_id: str, data: Dict[str, Any] = Body(...), device_id: str = Depends(get_device_id)):
    user_service.save_user_item(device_id, "history", item_id, data)
    return {"data": True, "error_code": 0, "error_msg": ""}

@router.get("/settings")
async def get_settings(device_id: str = Depends(get_device_id)):
    settings = user_service.get_user_data(device_id, "settings").get("global", {})
    # Default settings
    if not settings:
        settings = {
            "preferred_source": "auto",
            "auto_play": True,
            "theme": "dark"
        }
    return {"data": settings, "error_code": 0, "error_msg": ""}

@router.post("/settings")
async def update_settings(data: Dict[str, Any] = Body(...), device_id: str = Depends(get_device_id)):
    # Settings is usually one big object per user
    user_service.save_user_item(device_id, "settings", "global", data)
    return {"data": True, "error_code": 0, "error_msg": ""}

@router.post("/sync")
async def sync_all(data: Dict[str, Any] = Body(...), device_id: str = Depends(get_device_id)):
    results = {}
    for cat in ["progress", "history", "settings"]:
        if cat in data:
            results[cat] = user_service.sync_user_data(device_id, cat, data[cat])
    return {"data": results, "error_code": 0, "error_msg": ""}
