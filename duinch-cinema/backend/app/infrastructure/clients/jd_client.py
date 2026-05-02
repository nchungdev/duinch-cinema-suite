import os
import json
import re
import httpx
import hashlib
import base64
from typing import List, Optional, Dict, Any
from cryptography.fernet import Fernet
from myjdapi import Myjdapi
from app.core import config

def get_encryption_key():
    key = os.getenv("JD_ENCRYPTION_KEY")
    if key:
        try:
            base64.urlsafe_b64decode(key)
            return key.encode()
        except: pass
    seed = os.getenv("HOSTNAME", "duinch-omv-node") + "cinema-v4-secret"
    return base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest())

cipher_suite = Fernet(get_encryption_key())

def _encrypt(text: str) -> Optional[str]:
    if not text: return None
    return cipher_suite.encrypt(text.encode()).decode()

def _decrypt(text: str) -> Optional[str]:
    if not text: return None
    try:
        return cipher_suite.decrypt(text.encode()).decode()
    except Exception as e:
        print(f"[JD] Decryption failed: {e}")
        return None

def load_jd_config():
    # Priority: Env vars -> Saved config file
    jd_cfg = {
        "email": config.MYJD_EMAIL,
        "password": config.MYJD_PASSWORD,
        "device_name": os.getenv("JD_DEVICE_NAME")
    }
    if os.path.exists(config.USER_SETTINGS):
        try:
            with open(config.USER_SETTINGS, "r") as f:
                saved = json.load(f)
                jd_saved = saved.get("jdownloader", {})
                if jd_saved.get("email"): jd_cfg["email"] = jd_saved["email"]
                decrypted_pass = _decrypt(jd_saved.get("password"))
                if decrypted_pass: jd_cfg["password"] = decrypted_pass
                if jd_saved.get("device_name"): jd_cfg["device_name"] = jd_saved["device_name"]
        except Exception as e:
            print(f"[JD] Error loading config: {e}")
    return jd_cfg

def save_jd_config(jd_cfg: Dict[str, Any]):
    try:
        saved = {}
        if os.path.exists(config.USER_SETTINGS):
            with open(config.USER_SETTINGS, "r") as f:
                saved = json.load(f)
        
        saved["jdownloader"] = {
            "email": jd_cfg.get("email"),
            "password": _encrypt(jd_cfg.get("password")),
            "device_name": jd_cfg.get("device_name")
        }
        
        with open(config.USER_SETTINGS, "w") as f:
            json.dump(saved, f, indent=2)
    except Exception as e:
        print(f"[JD] Error saving config: {e}")

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
                resp = await client.post(f"{self.url}/flashgot/add", data=data)
                return resp.status_code == 200
        except Exception as e:
            print(f"[JD Local] Error adding links: {str(e)}")
            return False

class JDDirectClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(JDDirectClient, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized: return
        self.jd = Myjdapi()
        self.jd.set_app_key("Duinch_Cinema_Direct")
        self.config = load_jd_config()
        self.local = JDLocalClient()
        self.initialized = True

    def connect(self, force: bool = False) -> bool:
        email = self.config.get("email")
        password = self.config.get("password")
        if not email or not password: return False
        
        email = email.lower().strip()
        try:
            if not force and self.jd.is_connected():
                try:
                    self.jd.list_devices()
                    return True
                except: pass
            
            self.jd = Myjdapi()
            self.jd.set_app_key("Duinch_Cinema_Direct")
            self.jd.connect(email, password)
            return self.jd.is_connected()
        except Exception as e:
            print(f"[JD] Connection error: {e}")
            return False

    def get_device(self, name: Optional[str] = None):
        for attempt in range(2):
            if not self.connect(force=(attempt > 0)): return None
            target = name or self.config.get("device_name")
            try:
                self.jd.update_devices()
                if target:
                    try: return self.jd.get_device(target)
                    except: pass
                devices = self.jd.list_devices()
                online = [d for d in devices if d.get('status') == 'ONLINE']
                if online: return self.jd.get_device(online[0]['name'])
                return None
            except Exception as e:
                if "TOKEN_INVALID" in str(e): continue
                break
        return None

    def list_devices(self) -> List[Dict[str, Any]]:
        for attempt in range(2):
            if not self.connect(force=(attempt > 0)): return []
            try:
                self.jd.update_devices()
                return self.jd.list_devices()
            except Exception as e:
                if "TOKEN_INVALID" in str(e) and attempt == 0: continue
                return []
        return []

    def update_credentials(self, email, password) -> bool:
        self.config["email"] = email
        self.config["password"] = password
        save_jd_config(self.config)
        return self.connect(force=True)

    def logout(self):
        self.config = {"email": None, "password": None, "device_name": None}
        save_jd_config(self.config)
        self.jd = Myjdapi()

jd_direct_client = JDDirectClient()
