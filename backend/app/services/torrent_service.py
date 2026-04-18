import subprocess
import time
import os
import signal
import socket
from typing import Dict, Optional

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
        "--quiet"
    ]
    
    try:
        # Ensure log directory exists
        os.makedirs("logs", exist_ok=True)
        log_file = open("logs/webtorrent.log", "a")
        log_file.write(f"\n\n--- Starting Stream: {info_hash} ---\n")
        log_file.flush()

        # Start detached process
        process = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=log_file,
            preexec_fn=os.setsid
        )
        
        # Give it more time to bind the port and discover peers
        time.sleep(5)
        
        _active_streams[info_hash] = {
            "port": port,
            "process": process,
            "started_at": time.time()
        }
        
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
