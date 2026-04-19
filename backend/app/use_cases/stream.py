import time
from typing import Dict, Any, Optional
from app.infrastructure.clients.fshare_client import fshare_client
from app.infrastructure.persistence.sqlite_user_repo import user_repo

class StreamUseCase:
    async def fshare_login(self, device_id: str, email: str, password: str) -> bool:
        token = await fshare_client.login(email, password)
        if not token: return False
        
        settings = user_repo.get_user_data(device_id, "settings").get("global", {})
        settings["fshare_session"] = {
            "email": email,
            "token": token,
            "updated_at": int(time.time())
        }
        user_repo.save_user_item(device_id, "settings", "global", settings)
        return True

    async def get_fshare_direct_link(self, device_id: str, url: str) -> Optional[str]:
        settings = user_repo.get_user_data(device_id, "settings").get("global", {})
        session = settings.get("fshare_session")
        if not session or not session.get("token"): return None
        
        return await fshare_client.get_direct_link(url, session["token"])
        
    def start_torrent_stream(self, magnet: str) -> Optional[str]:
        # Logic to call torrent-stream engine (if implemented)
        return f"http://localhost:8080/stream?magnet={magnet}"
