import httpx
from typing import List, Dict, Any, Optional
import urllib.parse

class TorrentClient:
    async def search_solid(self, q: str) -> List[Dict[str, Any]]:
        try:
            url = f"https://solidtorrents.net/api/v1/search?q={urllib.parse.quote(q)}&category=all&sort=seeders"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json().get("results", [])
        except Exception: pass
        return []

    async def search_apibay(self, q: str) -> List[Dict[str, Any]]:
        try:
            url = f"https://apibay.org/q.php?q={urllib.parse.quote(q)}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data and isinstance(data, list) and data[0].get("id") != "0":
                        return data[:15]
        except Exception: pass
        return []

# Singleton
torrent_client = TorrentClient()
