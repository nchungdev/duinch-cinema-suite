import os
import re
import asyncio
from typing import List, Optional, Dict, Any
from app.core import config
from app.infrastructure.clients.jd_client import jd_direct_client

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
        device_obj = jd_direct_client.get_device(device)
        if not device_obj: return []

        try:
            pkgs = await asyncio.to_thread(device_obj.downloads.query_packages, [{
                "bytesLoaded": True, "bytesTotal": True, "childCount": True,
                "enabled": True, "eta": True, "finished": True, "running": True,
                "saveTo": True, "speed": True, "status": True,
            }])
            links = await asyncio.to_thread(device_obj.downloads.query_links, [{
                "bytesLoaded": True, "bytesTotal": True, "enabled": True,
                "eta": True, "finished": True, "host": True, "running": True,
                "speed": True, "status": True,
            }])

            grouped_links = {}
            for link in links:
                p_uuid = link.get("packageUUID")
                grouped_links.setdefault(p_uuid, []).append({
                    "uuid": link.get("uuid"),
                    "name": link.get("name"),
                    "host": link.get("host"),
                    "status": link.get("status", "Idle"),
                    "bytesLoaded": link.get("bytesLoaded", 0),
                    "bytesTotal": link.get("bytesTotal", 0),
                    "speed": link.get("speed", 0),
                    "eta": link.get("eta", 0),
                    "running": link.get("running", False),
                    "finished": link.get("finished", False),
                })

            return [{
                "uuid": p.get("uuid"),
                "name": p.get("name"),
                "bytesLoaded": p.get("bytesLoaded", 0),
                "bytesTotal": p.get("bytesTotal", 0),
                "speed": p.get("speed", 0),
                "eta": p.get("eta", 0),
                "status": p.get("status", "Idle"),
                "running": p.get("running", False),
                "finished": p.get("finished", False),
                "saveTo": p.get("saveTo"),
                "childCount": p.get("childCount", 0),
                "links": grouped_links.get(p.get("uuid"), []),
            } for p in pkgs]
        except Exception as e:
            print(f"[JD] Error listing: {e}")
            return []

    async def control_downloads(self, action: str, ids: List[str] = [], kind: str = "package", device: Optional[str] = None):
        device_obj = jd_direct_client.get_device(device)
        if not device_obj: return

        link_ids = ids if kind == "link" else []
        package_ids = ids if kind != "link" else []

        try:
            if action == "START":
                if ids: await asyncio.to_thread(device_obj.downloads.force_download, link_ids, package_ids)
                else: await asyncio.to_thread(device_obj.downloads.start_downloads)
            elif action == "STOP_JOB":
                await asyncio.to_thread(device_obj.downloads.set_enabled, False, link_ids, package_ids)
            elif action == "REMOVE_JOB":
                await asyncio.to_thread(device_obj.downloads.remove_links, link_ids, package_ids)
        except Exception as e:
            print(f"[JD] Control error: {e}")

    async def add_download(self, url: str, name: str, title: str, origin_name: Optional[str] = None, year: Optional[str] = None, media_type: str = "movie", season: Optional[int] = None) -> Dict[str, str]:
        jd_base = config.JD_INTERNAL_PATH
        if media_type == "tv" and season is None:
            season = extract_season(title)
        
        clean_title = sanitize_filename(re.sub(r'([Pp]hần|[Ss]eason|[Ss])\s*\d+', '', title, flags=re.IGNORECASE).strip())
        
        if media_type == "movie":
            display_title = f"{clean_title} ({year})" if year else clean_title
            package_name = display_title
            download_path = os.path.join(jd_base, "Movies", display_title)
        else:
            season_str = f"Season {season:02d}" if season else "Season 01"
            package_name = f"{clean_title} - {season_str} - {sanitize_filename(name)}"
            download_path = os.path.join(jd_base, "TV Shows", clean_title, season_str)

        # 1. Try Local API
        if await jd_direct_client.local.is_alive():
            if await jd_direct_client.local.add_links([url], package_name, download_path):
                return {"path": download_path, "package": package_name, "status": "success", "mode": "local"}

        # 2. Try Cloud API
        device_obj = jd_direct_client.get_device()
        if device_obj:
            params = {"links": url, "packageName": package_name, "destinationFolder": download_path, "autostart": True}
            await asyncio.to_thread(device_obj.linkgrabber.add_links, [params])
            return {"path": download_path, "package": package_name, "status": "success", "mode": "cloud"}
            
        raise Exception("JDownloader is offline")
