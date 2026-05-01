import httpx
import json
from typing import Optional, Dict, List
from app.core import config

FSHARE_BASE = "https://www.fshare.vn/api/v3"

class FshareClient:
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
                headers = {**self.headers, "Authorization": f"Bearer {token}"}
                resp = await client.post(url, json=payload, headers=headers)
                data = resp.json()
                return data.get("location")
            except Exception as e:
                print(f"[Fshare] Resolve link error: {e}")
                return None

    async def get_folder_list(self, folder_url: str, token: Optional[str] = None) -> List[Dict]:
        """List files in an Fshare folder using official API."""
        folder_id = folder_url.strip('/').split('/')[-1]
        url = f"{FSHARE_BASE}/files/folder"
        params = {"linkcode": folder_id, "sort": "name"}
        if self.app_key:
            params["app_key"] = self.app_key

        headers = {
            "User-Agent": self.headers.get("User-Agent") or "Mozilla/5.0",
            "Accept": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, params=params, headers=headers, timeout=15.0)
                if resp.status_code != 200:
                    print(f" ERROR [Fshare] API Folder Error {resp.status_code}: {resp.text}")
                    return []
                
                data = resp.json()
                # API trả về { "items": [...] } hoặc array trực tiếp
                items = data.get("items", data) if isinstance(data, dict) else data
                results = []
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    # type: 0=folder, 1=file (số nguyên) hoặc string "folder"/"file"
                    raw_type = item.get("type")
                    is_folder = (raw_type == 0) or (raw_type == "folder")
                    linkcode = item.get("linkcode")
                    if not linkcode:
                        continue
                    results.append({
                        "name": item.get("name"),
                        "url": f"https://www.fshare.vn/{'folder' if is_folder else 'file'}/{linkcode}",
                        "is_folder": is_folder,
                        "size": int(item.get("size") or 0),
                        "updated_at": item.get("modified")
                    })
                return results
            except Exception as e:
                print(f"[Fshare] API Folder Error: {e}")
                return []

# Singleton instance
fshare_client = FshareClient()
