import json
import os
import time
from app.core import config

def load_cache(filename):
    if not os.path.exists(filename):
        return {}
    try:
        with open(filename, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_cache(filename, cache):
    try:
        with open(filename, "w") as f:
            json.dump(cache, f, ensure_ascii=False)
    except Exception:
        pass

def get_from_cache(cache_name, key, expire_seconds):
    cache = load_cache(cache_name)
    if key in cache:
        entry = cache[key]
        if time.time() - entry["timestamp"] < expire_seconds:
            return entry["data"]
    return None

def set_to_cache(cache_name, key, data):
    cache = load_cache(cache_name)
    cache[key] = {"timestamp": time.time(), "data": data}
    save_cache(cache_name, cache)
