import os
import sys
import json
import re

def find_recursive(base_path, title, media_type):
    if not os.path.exists(base_path):
        return None
    
    # Walk through all subdirectories
    for root, dirs, files in os.walk(base_path):
        for d in dirs:
            if title.lower() in d.lower():
                path = os.path.join(root, d)
                if media_type == "tv":
                    seasons = []
                    for sub in os.listdir(path):
                        if os.path.isdir(os.path.join(path, sub)):
                            match = re.search(r"Season\s*(\d+)|S(\d+)", sub, re.I)
                            if match:
                                s_num = match.group(1) or match.group(2)
                                try:
                                    ep_count = len([f for f in os.listdir(os.path.join(path, sub)) if os.path.isfile(os.path.join(path, sub, f))])
                                except Exception:
                                    ep_count = 0
                                seasons.append({"season": int(s_num), "episodes": ep_count, "folder": sub})
                    return {"path": path, "seasons": seasons}
                return {"path": path}
    return None

def list_subdirs(base_path):
    if not os.path.exists(base_path):
        return []
    # Return only direct subdirectories to help user choose a category
    return [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python check_local.py <title> <movie|tv>"}))
        sys.exit(1)
    
    query_title = sys.argv[1]
    media_type = sys.argv[2]
    
    base = "/srv/mergerfs/MainPool/Phim/Movies" if media_type == "movie" else "/srv/mergerfs/MainPool/Phim/TVShows"
    
    res = find_recursive(base, query_title, media_type)
    subdirs = list_subdirs(base)
    
    if res:
        print(json.dumps({"exists": True, "path": res["path"], "seasons": res.get("seasons", []), "subdirs": subdirs}))
    else:
        print(json.dumps({"exists": False, "subdirs": subdirs}))
