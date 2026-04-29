import os
import re
import httpx
from typing import List, Optional, Dict, Any
from app.core import config

def sanitize_filename(name: str):
    return re.sub(r'[\\/*?:"<>|]', "", name).replace(":", " -").strip()

def extract_season(text: str):
    patterns = [r'[Pp]hần\s*(\d+)', r'[Ss]eason\s*(\d+)', r'[Ss](\d+)']
    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match: return int(match.group(1))
    return 1

class DownloaderUseCase:
    async def list_packages(self, device: Optional[str] = None) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{config.DOWNLOADER_URL}/list",
                params={"device": device} if device else None,
            )
            if resp.status_code == 200:
                return resp.json()
            return []

    async def control_downloads(self, action: str, ids: List[str] = [], kind: str = "package", device: Optional[str] = None):
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{config.DOWNLOADER_URL}/control",
                params={"action": action, **({"device": device} if device else {})},
                json={"ids": ids, "kind": kind},
            )

    async def add_download(self, url: str, name: str, title: str, origin_name: Optional[str] = None, year: Optional[str] = None, media_type: str = "movie", season: Optional[int] = None) -> Dict[str, str]:
        # Path calculation logic stays in Cinema (Business Logic)
        jd_base = config.JD_INTERNAL_PATH
        
        if media_type == "tv" and season is None:
            season = extract_season(title)
            if season == 1 and origin_name:
                s_origin = extract_season(origin_name)
                if s_origin > 1: season = s_origin
        
        clean_title_only = re.sub(r'([Pp]hần|[Ss]eason|[Ss])\s*\d+', '', title, flags=re.IGNORECASE).strip()
        clean_title = sanitize_filename(clean_title_only)
        clean_segment = sanitize_filename(name)
        
        if media_type == "movie":
            display_title = f"{clean_title} ({year})" if year else clean_title
            package_name = display_title
            download_path = os.path.join(jd_base, "Movies", display_title)
        else:
            season_str = f"Season {season:02d}" if season else "Season 01"
            package_name = f"{clean_title} - {season_str} - {clean_segment}"
            download_path = os.path.join(jd_base, "TV Shows", clean_title, season_str)

        # Call Downloader Service
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "urls": [url],
                "package_name": package_name,
                "folder": download_path,
                "autostart": True
            }
            resp = await client.post(f"{config.DOWNLOADER_URL}/download", json=payload)
            if resp.status_code == 200:
                return {"path": download_path, "package": package_name, "status": "success"}
            else:
                raise Exception(f"Downloader Service Error: {resp.text}")
