import subprocess
import time
import os
import signal
import socket
from typing import Dict, Optional
from app.core.config import TORRENT_CACHE

# Track active streams: {magnet_hash: {port, process}}
_active_streams: Dict[str, dict] = {}

def get_free_port():
    """Find a random free port on the system."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def start_torrent_stream(magnet: str) -> Optional[str]:
    """
    Starts a WebTorrent process for a magnet link.
    Returns the HTTP stream URL.
    """
    # Use info hash as key
    import re
    match = re.search(r'btih:([a-zA-Z0-9]+)', magnet)
    info_hash = match.group(1) if match else magnet[:40]

    if info_hash in _active_streams:
        # Check if process still alive
        proc = _active_streams[info_hash]['process']
        if proc.poll() is None:
            return f"http://localhost:{_active_streams[info_hash]['port']}/0"
        else:
            del _active_streams[info_hash]

    port = get_free_port()
    
    # Run webtorrent: --out (download path), --port, --quiet
    # We use sequential download by default
    os.makedirs(TORRENT_CACHE, exist_ok=True)
    
    import shutil
    webtorrent_bin = shutil.which("webtorrent")
    if not webtorrent_bin:
        # Fallback for common MacOS paths
        for fallback in ["/opt/homebrew/bin/webtorrent", "/usr/local/bin/webtorrent"]:
            if os.path.exists(fallback):
                webtorrent_bin = fallback
                break
    
    if not webtorrent_bin:
        print("[Torrent] Error: 'webtorrent' command not found in PATH or common locations.")
        return None

    cmd = [
        webtorrent_bin, magnet,
        "--port", str(port),
        "--out", TORRENT_CACHE,
        "--quiet"
    ]
    
    try:
        # Ensure log directory exists in the correct location
        # If running from backend/, logs is backend/logs
        # If running from root, logs is root/logs
        log_dir = "logs"
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "webtorrent_debug.log")
        
        log_file = open(log_path, "a")
        log_file.write(f"\n\n--- Starting Stream: {info_hash} | Port: {port} ---\n")
        log_file.write(f"Command: {' '.join(cmd)}\n")
        log_file.flush()

        # Start detached process with its own process group
        process = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=log_file,
            preexec_fn=os.setsid,
            bufsize=1,
            universal_newlines=True
        )
        
        # Give it significantly more time to:
        # 1. Start the HTTP server
        # 2. Find peers
        # 3. Download metadata and start downloading the first pieces
        time.sleep(10)
        
        # Check if process is still alive after 10s
        if process.poll() is not None:
            print(f"[Torrent] Error: webtorrent process died immediately. Check {log_path}")
            return None

        _active_streams[info_hash] = {
            "port": port,
            "process": process,
            "started_at": time.time()
        }
        
        print(f"[Torrent] Stream initialized at http://localhost:{port}/0")
        return f"http://localhost:{port}/0"
    except Exception as e:
        print(f"[Torrent] Failed to start stream: {e}")
        return None

def stop_all_streams():
    """Kill all active webtorrent processes."""
    for info in _active_streams.values():
        try:
            os.killpg(os.getpgid(info['process'].pid), signal.SIGTERM)
        except:
            pass
    _active_streams.clear()
