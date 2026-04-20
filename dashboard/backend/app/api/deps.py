from fastapi import Header
from typing import Optional

async def get_device_id(x_device_id: Optional[str] = Header(None)) -> str:
    """Extract device ID from custom header. Fallback to 'anonymous' if missing."""
    return x_device_id or "anonymous"
