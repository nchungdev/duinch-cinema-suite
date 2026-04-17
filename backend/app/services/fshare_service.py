import httpx
import json
from typing import Optional, Dict
from app.core import config

FSHARE_BASE = "https://www.fshare.vn/api/v3"

class FshareService:
    def __init__(self):
        self.headers = {
            "User-Agent": config.FSHARE_USER_AGENT,
            "Accept": "application/json"
        }
        self.app_key = config.FSHARE_APP_KEY

    async def login(self, email: str, password: str) -> Optional[str]:
        """Login to Fshare and return session token."""
        url = f"{FSHARE_BASE}/user/login"
        payload = {
            "user_email": email,
            "password": password,
            "app_key": self.app_key
        }
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, json=payload, headers=self.headers)
                data = resp.json()
                return data.get("token")
            except Exception as e:
                print(f"[Fshare] Login error: {e}")
                return None

    async def get_direct_link(self, fshare_url: str, token: str) -> Optional[str]:
        """Generate a direct streamable link for a given Fshare URL."""
        url = f"{FSHARE_BASE}/session/download"
        payload = {
            "url": fshare_url,
            "token": token
        }
        async with httpx.AsyncClient() as client:
            try:
                # We must use the token in the header as well for some V3 endpoints
                headers = {**self.headers, "Authorization": f"Bearer {token}"}
                resp = await client.post(url, json=payload, headers=headers)
                data = resp.json()
                return data.get("location")
            except Exception as e:
                print(f"[Fshare] Resolve link error: {e}")
                return None

fshare_service = FshareService()
