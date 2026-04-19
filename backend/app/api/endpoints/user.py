from fastapi import APIRouter, Request
from app.infrastructure.persistence.sqlite_user_repo import user_repo
from typing import Dict, Any

router = APIRouter()

@router.get("/{device_id}/{category}")
async def get_user_data_endpoint(device_id: str, category: str):
    """Retrieve user data for a specific device and category."""
    data = user_repo.get_user_data(device_id, category)
    return {"data": data, "error_code": 0, "error_msg": ""}

@router.post("/{device_id}/{category}")
async def sync_user_data_endpoint(device_id: str, category: str, request: Request):
    """Sync/Merge user data from client."""
    client_data = await request.json()
    
    # Simple sync logic moved here from service
    server_data = user_repo.get_user_data(device_id, category)
    for item_id, c_val in client_data.items():
        s_val = server_data.get(item_id)
        if not s_val or (isinstance(c_val, dict) and c_val.get("updated_at", 0) > s_val.get("updated_at", 0)):
            user_repo.save_user_item(device_id, category, item_id, c_val)
            
    final_data = user_repo.get_user_data(device_id, category)
    return {"data": final_data, "error_code": 0, "error_msg": ""}

@router.put("/{device_id}/{category}/{item_id}")
async def save_user_item_endpoint(device_id: str, category: str, item_id: str, request: Request):
    """Save a specific item for a user."""
    data = await request.json()
    user_repo.save_user_item(device_id, category, item_id, data)
    return {"data": True, "error_code": 0, "error_msg": ""}
