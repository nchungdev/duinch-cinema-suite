import os
import json
import time
from typing import Any, Optional

def get_from_cache(cache_dir: str, key: str, ttl: int) -> Optional[Any]:
    cache_path = os.path.join(cache_dir, f"{key}.json")
    if not os.path.exists(cache_path):
        return None
    
    try:
        mtime = os.path.getmtime(cache_path)
        if (time.time() - mtime) > ttl:
            return None
        
        with open(cache_path, "r") as f:
            return json.load(f)
    except:
        return None

def set_to_cache(cache_dir: str, key: str, data: Any):
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"{key}.json")
    try:
        with open(cache_path, "w") as f:
            json.dump(data, f)
    except:
        pass

def save_all_caches():
    # Placeholder for lifespan cleanup
    pass
