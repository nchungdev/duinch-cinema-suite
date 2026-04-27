import os
import myjdapi
from fastapi import FastAPI, HTTPException, Body, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

app = FastAPI(title="Duinch Downloader API", version="1.1.0")

# --- Configuration ---
MYJD_EMAIL = os.getenv("MYJD_EMAIL")
MYJD_PASSWORD = os.getenv("MYJD_PASSWORD")
JD_DEVICE_NAME = os.getenv("JD_DEVICE_NAME", "JDownloader")
DEFAULT_PATH = os.getenv("JD_DOWNLOAD_PATH", "/output/DuinchCinema")

class JDClient:
    def __init__(self):
        self.jd = myjdapi.Myjdapi()
        self.jd.set_app_key("Duinch_Downloader_Pro")
        self.device = None

    def connect(self):
        if not self.jd.is_connected():
            if not MYJD_EMAIL or not MYJD_PASSWORD: return False
            self.jd.connect(MYJD_EMAIL, MYJD_PASSWORD)
        return True

    def get_device(self):
        if not self.connect(): return None
        self.jd.update_devices()
        devices = self.jd.list_devices()
        if not devices: return None
        target = next((d for d in devices if JD_DEVICE_NAME in d["name"]), devices[0])
        return self.jd.get_device(device_name=target["name"])

jd_client = JDClient()

class DownloadRequest(BaseModel):
    urls: List[str]
    package_name: Optional[str] = "Duinch_Download"
    folder: Optional[str] = None
    autostart: Optional[bool] = True

@app.get("/health")
async def health():
    device = jd_client.get_device()
    return {"status": "healthy" if device else "disconnected", "device": device.name if device else None}

@app.get("/list")
async def list_downloads():
    device = jd_client.get_device()
    if not device: raise HTTPException(status_code=503, detail="JD Offline")
    
    pkgs = device.downloads.query_packages([{"bytesLoaded": True, "bytesTotal": True, "running": True, "status": True, "speed": True, "eta": True, "uuid": True, "enabled": True}])
    return [{
        "uuid": p.get("uuid"), "name": p.get("name"),
        "bytesLoaded": p.get("bytesLoaded", 0), "bytesTotal": p.get("bytesTotal", 0),
        "speed": p.get("speed", 0), "eta": p.get("eta", 0),
        "status": p.get("status", "Idle"), "running": p.get("running", False),
        "enabled": p.get("enabled", True)
    } for p in pkgs]

@app.post("/control")
async def control_downloads(action: str, uuids: List[str] = Body([])):
    device = jd_client.get_device()
    if not device: raise HTTPException(status_code=503, detail="JD Offline")
    
    if action == "START": device.downloads.start_downloads()
    elif action == "STOP": device.downloads.stop_downloads()
    elif action == "RESUME_JOB": device.downloads.id_enabled(True, uuids, [])
    elif action == "STOP_JOB": device.downloads.id_enabled(False, uuids, [])
    elif action == "REMOVE_JOB": device.downloads.remove_downloads(uuids, [])
    return {"status": "success", "action": action}

@app.post("/download")
async def add_download(req: DownloadRequest):
    device = jd_client.get_device()
    if not device: raise HTTPException(status_code=503, detail="JD Offline")

    target_folder = req.folder if req.folder else DEFAULT_PATH
    params = {
        "links": "\n".join(req.urls),
        "packageName": req.package_name,
        "destinationFolder": target_folder,
        "autostart": req.autostart,
        "autoExtract": True
    }

    try:
        device.linkgrabber.add_links([params])
        return {"status": "success", "package": req.package_name, "path": target_folder}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)
