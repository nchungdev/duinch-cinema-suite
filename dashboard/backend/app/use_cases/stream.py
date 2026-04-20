import time
import os
import subprocess
import shutil
import socket
import signal
from typing import Dict, Any, Optional
from app.infrastructure.clients.fshare_client import fshare_client
from app.infrastructure.persistence.sqlite_user_repo import user_repo
from app.core.config import TORRENT_CACHE

# Track active streams: {magnet_hash: {port, process}}
_active_streams: Dict[str, dict] = {}

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
        # Cleanup old streams if necessary
        # (Simple implementation: 1 stream at a time or by magnet hash)
        
        import hashlib
        m = hashlib.md5()
        m.update(magnet.encode('utf-8'))
        magnet_hash = m.hexdigest()

        if magnet_hash in _active_streams:
            return f"http://localhost:{_active_streams[magnet_hash]['port']}/0"

        # Find free port
        def get_free_port():
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(('', 0))
            port = s.getsockname()[1]
            s.close()
            return port

        port = get_free_port()
        os.makedirs(TORRENT_CACHE, exist_ok=True)
        
        webtorrent_bin = shutil.which("webtorrent")
        if not webtorrent_bin:
            for fallback in ["/opt/homebrew/bin/webtorrent", "/usr/local/bin/webtorrent"]:
                if os.path.exists(fallback):
                    webtorrent_bin = fallback
                    break
        
        if not webtorrent_bin:
            print("[Torrent] Error: 'webtorrent' not found")
            return None

        cmd = [
            webtorrent_bin, magnet,
            "--port", str(port),
            "--out", TORRENT_CACHE,
            "--quiet"
        ]
        
        log_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(TORRENT_CACHE))), "logs", "webtorrent.log")
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        
        with open(log_path, "a") as log_file:
            process = subprocess.Popen(
                cmd, 
                stdout=log_file, 
                stderr=log_file, 
                preexec_fn=os.setsid
            )
        
        _active_streams[magnet_hash] = {"port": port, "process": process}
        
        # Wait a bit for engine to start
        time.sleep(5)
        return f"http://localhost:{port}/0"
