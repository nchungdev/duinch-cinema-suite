import sys
import json
import os
import myjdapi

def load_creds():
    cred_path = "/home/chungnh/.openclaw/myjd_creds.json"
    if not os.path.exists(cred_path):
        return None, None
    with open(cred_path, "r") as f:
        data = json.load(f)
        return data.get("email"), data.get("password")

def get_device():
    email, password = load_creds()
    if not email:
        return None
    jd = myjdapi.Myjdapi()
    jd.set_app_key("OpenClaw_Manager")
    try:
        jd.connect(email, password)
        jd.update_devices()
        devices = jd.list_devices()
        if not devices:
            return None
        return jd.get_device(devices[0].get("name"))
    except Exception:
        return None

def format_size(size):
    if size <= 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024

def draw_table(rows, headers):
    # Simple ASCII Table
    col_widths = [max(len(str(row[i])) for row in rows + [headers]) for i in range(len(headers))]
    
    sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"
    header_row = "| " + " | ".join(str(headers[i]).ljust(col_widths[i]) for i in range(len(headers))) + " |"
    
    print(sep)
    print(header_row)
    print(sep)
    for row in rows:
        print("| " + " | ".join(str(row[i]).ljust(col_widths[i]) for i in range(len(row))) + " |")
    print(sep)

def list_downloads(device):
    packages = device.downloads.query_packages([{
        "bytesLoaded": True, "bytesTotal": True, "running": True, "status": True, "saveTo": True
    }])
    
    if not packages:
        print("\n📭 No active downloads found.\n")
        return

    rows = []
    for pkg in packages:
        total = pkg.get("bytesTotal", 0)
        loaded = pkg.get("bytesLoaded", 0)
        progress = f"{(loaded/total*100):.1f}%" if total > 0 else "0%"
        status = "📥 Downloading" if pkg.get("running") else "⏸️ Paused"
        if "finished" in (pkg.get("status") or "").lower():
            status = "✅ Finished"
        
        rows.append([
            pkg.get("name")[:30] + "..." if len(pkg.get("name", "")) > 30 else pkg.get("name"),
            format_size(total),
            progress,
            status,
            pkg.get("saveTo").split("/")[-1] # Show only last folder
        ])
    
    print("\n📦 JDownloader Active Tasks:")
    draw_table(rows, ["Name", "Size", "Done", "Status", "Folder"])

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    device = get_device()
    if not device:
        print("❌ Error: JDownloader offline.")
        sys.exit(1)

    if cmd == "list":
        list_downloads(device)
    elif cmd == "grabber":
        # Simplified for now
        print("🔍 Scanning LinkGrabber...")
        pkgs = device.linkgrabber.query_packages([{"bytesTotal": True}])
        for p in pkgs:
            print(f"🔗 {p.get('name')} ({format_size(p.get('bytesTotal', 0))})")
    elif cmd == "start":
        device.downloadcontroller.start_downloads()
        print("▶️ Downloads started!")
    elif cmd == "stop":
        device.downloadcontroller.stop_downloads()
        print("⏹️ Downloads stopped!")
