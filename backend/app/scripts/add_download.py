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

def add_download(url, target_path, package_name=None):
    email, password = load_creds()
    if not email:
        print(json.dumps({"error": "No MyJDownloader credentials found"}))
        return False

    jd = myjdapi.Myjdapi()
    jd.set_app_key("OpenClaw_OMV_Manager")
    
    try:
        jd.connect(email, password)
        jd.update_devices()
        
        # Get the first available device (usually just one on OMV)
        devices = jd.list_devices()
        if not devices:
            print(json.dumps({"error": "No JDownloader devices found online"}))
            return False
        
        # Use the first device name
        device_name = devices[0].get("name")
        device = jd.get_device(device_name)
        
        # Add links to LinkGrabber
        links_data = [{
            "links": url,
            "downloadFolder": target_path,
            "packageName": package_name if package_name else "OpenClaw_Download",
            "autostart": True,
            "forcedStart": True
        }]
        
        device.linkgrabber.add_links(links_data)
        
        print(json.dumps({
            "success": True, 
            "message": f"Added to {device_name}", 
            "url": url, 
            "path": target_path
        }))
        return True
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python add_download.py <url> <target_path> [package_name]"}))
        sys.exit(1)
    
    url = sys.argv[1]
    path = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else None
    
    add_download(url, path, name)
