from fastapi import APIRouter, Request, Depends
from app.infrastructure.persistence.sqlite_user_repo import user_repo
from app.api.deps import get_device_id
from typing import Dict, Any

router = APIRouter()

@router.get("/{category}")
async def get_user_data_endpoint(category: str, device_id: str = Depends(get_device_id)):
    """Retrieve user data for current device and category."""
    data = user_repo.get_user_data(device_id, category)
    return {"data": data, "error_code": 0, "error_msg": ""}

@router.post("/sync")
async def sync_user_data_legacy(request: Request, device_id: str = Depends(get_device_id)):
    """Legacy sync endpoint used by Frontend: POST /api/user/sync?category=..."""
    category = request.query_params.get("category", "watchlist")
    client_data = await request.json()
    
    server_data = user_repo.get_user_data(device_id, category)
    for item_id, c_val in client_data.items():
        s_val = server_data.get(item_id)
        if not s_val or (isinstance(c_val, dict) and c_val.get("updated_at", 0) > s_val.get("updated_at", 0)):
            user_repo.save_user_item(device_id, category, item_id, c_val)
            
    final_data = user_repo.get_user_data(device_id, category)
    return {"data": final_data, "error_code": 0, "error_msg": ""}

@router.post("/{category}")
async def sync_user_data_endpoint(category: str, request: Request, device_id: str = Depends(get_device_id)):
    """New sync endpoint: POST /api/user/{category}"""
    client_data = await request.json()
    server_data = user_repo.get_user_data(device_id, category)
    for item_id, c_val in client_data.items():
        s_val = server_data.get(item_id)
        if not s_val or (isinstance(c_val, dict) and c_val.get("updated_at", 0) > s_val.get("updated_at", 0)):
            user_repo.save_user_item(device_id, category, item_id, c_val)
    return {"data": user_repo.get_user_data(device_id, category), "error_code": 0, "error_msg": ""}

@router.put("/{category}/{item_id}")
async def save_user_item_endpoint(category: str, item_id: str, request: Request, device_id: str = Depends(get_device_id)):
    data = await request.json()
    user_repo.save_user_item(device_id, category, item_id, data)
    return {"data": True, "error_code": 0, "error_msg": ""}
