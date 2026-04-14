import sys
import os
import time

def create_crawljob(url, target_path, package_name=None):
    # JDownloader FolderWatch path (updated to your OMV host path)
    watch_folder = "/home/apps/jdownloader/config/folderwatch"
    
    if not os.path.exists(watch_folder):
        print(f"Error: FolderWatch directory {watch_folder} not found.")
        return False

    # Unique job name based on timestamp
    job_id = int(time.time())
    job_filename = f"download_{job_id}.crawljob"
    job_path = os.path.join(watch_folder, job_filename)

    # Job configuration
    job_data = {
        "text": url,
        "downloadFolder": target_path,
        "autoStart": "TRUE",
        "extractAfterDownload": "TRUE",
        "forcedStart": "TRUE"
    }
    
    if package_name:
        job_data["packageName"] = package_name

    try:
        # Write .crawljob file (standard text format with key=value)
        with open(job_path, "w") as f:
            for key, value in job_data.items():
                f.write(f"{key}={value}\n")
        
        # Ensure correct permissions for JDownloader to read/delete it
        os.chmod(job_path, 0o666)
        print(f"Success: Created JDownloader job for {url} -> {target_path}")
        return True
    except Exception as e:
        print(f"Error creating job: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python create_job.py <url> <target_path> [package_name]")
        sys.exit(1)
    
    url = sys.argv[1]
    path = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else None
    
    if create_crawljob(url, path, name):
        sys.exit(0)
    else:
        sys.exit(1)
