import os
import json
from myjdapi import Myjdapi
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from fastapi import FastAPI, HTTPException, Body, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import asyncio
import base64
from cryptography.fernet import Fernet
import hashlib

app = FastAPI(title="Duinch Downloader API", version="1.2.0")

# --- Configuration Persistence ---
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jd_config.json")

# --- Encryption Setup ---
def get_encryption_key():
    # 1. Ưu tiên lấy key từ .env
    key = os.getenv("JD_ENCRYPTION_KEY")
    if key:
        try:
            # Kiểm tra xem key có đúng định dạng Fernet không
            base64.urlsafe_b64decode(key)
            return key.encode()
        except: pass
    
    # 2. Fallback: Tạo key cố định dựa trên tên máy để đảm bảo tính duy nhất
    # (Dù hacker lấy được file config nhưng sang máy khác cũng khó giải mã)
    seed = os.getenv("HOSTNAME", "duinch-omv-node") + "cinema-v4-secret"
    return base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest())

cipher_suite = Fernet(get_encryption_key())

def _encrypt(text: str) -> str:
    if not text: return None
    return cipher_suite.encrypt(text.encode()).decode()

def _decrypt(text: str) -> str:
    if not text: return None
    try:
        return cipher_suite.decrypt(text.encode()).decode()
    except Exception as e:
        # Hỗ trợ migrate từ bản cũ hoặc nếu decrypt lỗi thì trả về None để bắt login lại cho an toàn
        print(f"[JD] Decryption failed, might be old format or wrong key: {e}")
        return None

def load_jd_config():
    config = {
        "email": os.getenv("MYJD_EMAIL"),
        "password": os.getenv("MYJD_PASSWORD"),
        "device_name": os.getenv("JD_DEVICE_NAME")
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                saved = json.load(f)
                if saved.get("email"): config["email"] = saved["email"]
                
                # Cố gắng decrypt password
                decrypted_pass = _decrypt(saved.get("password"))
                if decrypted_pass:
                    config["password"] = decrypted_pass
                
                if saved.get("device_name"): config["device_name"] = saved["device_name"]
        except Exception as e:
            print(f"[JD] Error loading config: {e}")
    return config

def save_jd_config(config):
    to_save = {
        "email": config.get("email"),
        "password": _encrypt(config.get("password")),
        "device_name": config.get("device_name")
    }
    with open(CONFIG_FILE, "w") as f:
        json.dump(to_save, f)
    # Bảo mật: Chỉ user hiện tại mới được đọc file này (600)
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except: pass

class JDLocalClient:
    def __init__(self, url=None):
        self.url = (url or os.getenv("JD_LOCAL_URL") or "http://localhost:9666").rstrip('/')

    async def is_alive(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                resp = await client.get(f"{self.url}/jdcheck.js")
                return resp.status_code == 200 and "jdownloader=true" in resp.text
        except:
            return False

    async def add_links(self, urls: List[str], package_name: str = None, folder: str = None, autostart: bool = True) -> bool:
        data = {
            "urls": "\n".join(urls),
            "package": package_name,
            "dir": folder,
            "autostart": 1 if autostart else 0
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Try FlashGot endpoint (standard for local API)
                resp = await client.post(f"{self.url}/flashgot/add", data=data)
                return resp.status_code == 200
        except Exception as e:
            print(f"[JD Local] Error adding links: {str(e)}")
            return False

class JDClient:
    def __init__(self):
        self.jd = Myjdapi()
        self.jd.set_app_key("Duinch_Cinema_V4")
        self.config = load_jd_config()
        self.local = JDLocalClient()

    def connect(self, force: bool = False) -> bool:
        """Kết nối đúng chuẩn MyJDownloader API (Theo dev docs)"""
        email = self.config.get("email")
        password = self.config.get("password")
        
        if not email or not password:
            return False
            
        email = email.lower().strip()
        
        try:
            # 1. Nếu không force, kiểm tra session hiện tại
            if not force and self.jd.is_connected():
                try:
                    # Probing nhẹ để verify session
                    self.jd.list_devices()
                    return True
                except Exception as e:
                    print(f"[JD] Session probe failed ({str(e)}), reconnecting...")
                    # Fall through to re-login
            
            # 2. Reset object để đảm bảo trạng thái sạch
            self.jd = Myjdapi()
            self.jd.set_app_key("Duinch_Cinema_V4")
            
            # 3. Login mới
            print(f"[JD] Attempting login for: {email}")
            self.jd.connect(email, password)
            
            return self.jd.is_connected()
            
        except Exception as e:
            err_msg = str(e)
            if "EMAIL_INVALID" in err_msg:
                print("[JD] Error: Email invalid (Check case/spaces)")
            elif "AUTH_FAILED" in err_msg:
                print("[JD] Error: Password incorrect")
            elif "TOO_MANY_REQUESTS" in err_msg:
                print("[JD] Error: Rate limited by MyJD server")
            else:
                print(f"[JD] Connection error: {err_msg}")
            return False

    def get_device(self, name: str = None):
        # Retry up to 2 times for transient session errors
        for attempt in range(2):
            if not self.connect(force=(attempt > 0)):
                return None
                
            target = name or self.config.get("device_name")
            try:
                self.jd.update_devices()
                if target:
                    try:
                        return self.jd.get_device(target)
                    except: pass
                
                # Fallback: lấy thiết bị online đầu tiên
                devices = self.jd.list_devices()
                online = [d for d in devices if d.get('status') == 'ONLINE']
                if online:
                    return self.jd.get_device(online[0]['name'])
                return None
            except Exception as e:
                err_str = str(e)
                print(f"[JD] Error getting device (attempt {attempt+1}): {err_str}")
                if "TOKEN_INVALID" in err_str:
                    # Token died unexpectedly, retry with fresh login
                    continue
                break
        return None

    def list_devices(self):
        # Retry logic for list_devices too
        for attempt in range(2):
            if not self.connect(force=(attempt > 0)):
                return []
            try:
                self.jd.update_devices()
                return self.jd.list_devices()
            except Exception as e:
                err_str = str(e)
                if "TOKEN_INVALID" in err_str and attempt == 0:
                    continue
                print(f"[JD] Error listing devices: {err_str}")
                return []
        return []

    def update_config(self, email, password):
        self.config["email"] = email
        self.config["password"] = password
        save_jd_config(self.config)
        return self.connect(force=True)

    def set_device_name(self, name: Optional[str]):
        self.config["device_name"] = name
        save_jd_config(self.config)

    def clear_config(self):
        self.config = {
            "email": None,
            "password": None,
            "device_name": None,
        }
        save_jd_config(self.config)
        self.jd = Myjdapi()
        self.jd.set_app_key("Duinch_Cinema_V4")

jd_client = JDClient()

class ConfigRequest(BaseModel):
    email: str
    password: str

class ControlRequest(BaseModel):
    ids: List[str] = []
    kind: Optional[str] = "package"

class DownloadRequest(BaseModel):
    urls: List[str]
    package_name: Optional[str] = "Duinch_Download"
    folder: Optional[str] = None
    autostart: Optional[bool] = True

@app.get("/health")
async def health(device: Optional[str] = Query(None)):
    config = jd_client.config
    local_online = await jd_client.local.is_alive()

    if not config.get("email"):
        return {
            "status": "healthy" if local_online else "no_credentials",
            "local_online": local_online,
            "current_device": None,
            "devices": [],
            "email": None,
        }

    try:
        current_device = jd_client.get_device(device)
        devices = jd_client.list_devices()
        return {
            "status": "healthy" if (current_device or local_online) else "no_devices",
            "local_online": local_online,
            "current_device": current_device.name if current_device else None,
            "devices": devices,
            "email": config.get("email")
        }
    except Exception as e:
        return {"status": "disconnected", "device": None, "detail": str(e)}

@app.post("/config")
async def update_config(req: ConfigRequest):
    success = jd_client.update_config(req.email, req.password)
    if not success:
        raise HTTPException(status_code=401, detail="Invalid MyJDownloader credentials")
    return {"status": "success"}

@app.post("/logout")
async def logout():
    jd_client.clear_config()
    return {"status": "success"}

@app.get("/devices")
async def get_devices():
    return jd_client.list_devices()

@app.get("/list")
async def list_downloads(device: Optional[str] = Query(None)):
    device_obj = jd_client.get_device(device)
    if not device_obj: raise HTTPException(status_code=503, detail="JD Offline")

    pkgs = device_obj.downloads.query_packages([{
        "bytesLoaded": True,
        "bytesTotal": True,
        "childCount": True,
        "enabled": True,
        "eta": True,
        "finished": True,
        "maxResults": -1,
        "packageUUIDs": [],
        "running": True,
        "saveTo": True,
        "speed": True,
        "startAt": 0,
        "status": True,
    }])
    links = device_obj.downloads.query_links([{
        "addedDate": True,
        "bytesLoaded": True,
        "bytesTotal": True,
        "enabled": True,
        "eta": True,
        "finished": True,
        "host": True,
        "jobUUIDs": [],
        "maxResults": -1,
        "packageUUIDs": [],
        "running": True,
        "speed": True,
        "startAt": 0,
        "status": True,
        "url": True,
    }])

    grouped_links: Dict[Any, List[Dict[str, Any]]] = {}
    for link in links:
        package_uuid = link.get("packageUUID")
        grouped_links.setdefault(package_uuid, []).append({
            "uuid": link.get("uuid"),
            "packageUUID": package_uuid,
            "name": link.get("name"),
            "host": link.get("host"),
            "status": link.get("status", "Idle"),
            "bytesLoaded": link.get("bytesLoaded", 0),
            "bytesTotal": link.get("bytesTotal", 0),
            "speed": link.get("speed", 0),
            "eta": link.get("eta", 0),
            "running": link.get("running", False),
            "enabled": link.get("enabled", True),
            "finished": link.get("finished", False),
            "url": link.get("url"),
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
        "enabled": p.get("enabled", True),
        "finished": p.get("finished", False),
        "saveTo": p.get("saveTo"),
        "childCount": p.get("childCount", 0),
        "links": grouped_links.get(p.get("uuid"), []),
    } for p in pkgs]

@app.post("/control")
async def control_downloads(action: str, device: Optional[str] = Query(None), payload: ControlRequest = Body(default=ControlRequest())):
    device_obj = jd_client.get_device(device)
    if not device_obj: raise HTTPException(status_code=503, detail="JD Offline")

    ids = payload.ids or []
    kind = payload.kind or "package"
    link_ids = ids if kind == "link" else []
    package_ids = ids if kind != "link" else []

    if action == "START":
        if ids:
            device_obj.downloads.force_download(link_ids, package_ids)
        else:
            device_obj.downloads.start_downloads()
    elif action == "STOP":
        if ids:
            device_obj.downloads.set_enabled(False, link_ids, package_ids)
        else:
            device_obj.downloads.stop_downloads()
    elif action == "RESUME_JOB":
        device_obj.downloads.set_enabled(True, link_ids, package_ids)
    elif action == "STOP_JOB":
        device_obj.downloads.set_enabled(False, link_ids, package_ids)
    elif action == "REMOVE_JOB":
        device_obj.downloads.remove_links(link_ids, package_ids)
    return {"status": "success", "action": action}

@app.post("/download")
async def add_download(req: DownloadRequest, device: Optional[str] = Query(None)):
    # --- Priority 1: Local API (Bypass Cloud) ---
    if await jd_client.local.is_alive():
        print(f"[JD] Using Local API for {req.package_name}")
        default_path = os.getenv("JD_DOWNLOAD_PATH", "/output/DuinchCinema")
        target_folder = req.folder if req.folder else default_path
        
        success = await jd_client.local.add_links(
            req.urls, 
            package_name=req.package_name, 
            folder=target_folder, 
            autostart=req.autostart
        )
        if success:
            return {"status": "success", "mode": "local", "package": req.package_name, "path": target_folder}
        print("[JD] Local API failed, falling back to Cloud API")

    # --- Priority 2: Cloud API ---
    device_obj = jd_client.get_device(device)
    if not device_obj: 
        raise HTTPException(status_code=503, detail="JDownloader is offline (both Local and Cloud)")

    default_path = os.getenv("JD_DOWNLOAD_PATH", "/output/DuinchCinema")
    target_folder = req.folder if req.folder else default_path
    params = {
        "links": "\n".join(req.urls),
        "packageName": req.package_name,
        "destinationFolder": target_folder,
        "autostart": req.autostart,
        "autoExtract": True
    }

    try:
        device_obj.linkgrabber.add_links([params])
        return {"status": "success", "mode": "cloud", "package": req.package_name, "path": target_folder}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)
