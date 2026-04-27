import myjdapi
from fastapi import HTTPException
from app.core import config

class JDManager:
    def __init__(self):
        self.jd = myjdapi.Myjdapi()
        self.jd.set_app_key("OMV_JD_Dashboard_Ultra")
        self.device = None

    async def get_device(self):
        if not self.jd.is_connected():
            if not config.MYJD_EMAIL or not config.MYJD_PASSWORD:
                raise HTTPException(status_code=500, detail="MyJD credentials not set")
            self.jd.connect(config.MYJD_EMAIL, config.MYJD_PASSWORD)
        
        if not self.device:
            self.jd.update_devices()
            devices = self.jd.list_devices()
            if devices:
                # Prefer device named 'JDownloader' or take the first one
                target = next((d for d in devices if "JDownloader" in d["name"]), devices[0])
                self.device = self.jd.get_device(target["name"])
        return self.device

jd_manager = JDManager()
