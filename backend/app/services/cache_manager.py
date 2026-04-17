import json
import os
import time
import hashlib
import redis
from typing import Any, Optional

# --- Configuration ---
_redis_client = None
_redis_initialized = False

def _get_redis():
    global _redis_client, _redis_initialized
    if not _redis_initialized:
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                _redis_client = redis.from_url(redis_url, decode_responses=True)
                _redis_client.ping()
                print(f"[Cache] Connected to Redis at {redis_url}")
            except Exception as e:
                print(f"[Cache] Redis connection failed: {e}")
                _redis_client = None
        _redis_initialized = True
    return _redis_client

# --- Internal Helpers ---
def _get_path(cache_dir: str, key: str) -> str:
    hashed_key = hashlib.md5(key.encode('utf-8')).hexdigest()
    return os.path.join(cache_dir, f"{hashed_key}.json")

def _ensure_dir(path: str):
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)

# --- Core API ---

def get_from_cache(cache_name: str, key: str, expire_seconds: int) -> Optional[Any]:
    """Retrieve an item from Redis or File System."""
    try:
        r = _get_redis()
        
        # 1. Try Redis
        if r:
            try:
                val = r.get(f"{cache_name}:{key}")
                if val:
                    return json.loads(val)
            except Exception as e:
                print(f"[Cache] Redis get error: {e}")

        # 2. Fallback to File System
        file_path = _get_path(cache_name, key)
        if not os.path.exists(file_path):
            return None
            
        with open(file_path, "r", encoding="utf-8") as f:
            entry = json.load(f)
        if time.time() - entry.get("timestamp", 0) < expire_seconds:
            data = entry.get("data")
            if r:
                set_to_cache(cache_name, key, data, int(expire_seconds - (time.time() - entry.get("timestamp", 0))))
            return data
        os.remove(file_path)
    except Exception as e:
        print(f"[Cache] General get error: {e}")
    return None

def set_to_cache(cache_name: str, key: str, data: Any, expire_seconds: int = 3600):
    """Save an item into Redis (Primary) or File System (Fallback)."""
    r = _get_redis()
    
    # 1. Save to Redis
    if r:
        try:
            r.setex(
                f"{cache_name}:{key}",
                int(expire_seconds),
                json.dumps(data, ensure_ascii=False)
            )
            return # SUCCESS: Skip Disk write to save I/O
        except Exception as e:
            print(f"[Cache] Redis set error: {e}")

    # 2. Fallback to File System only if Redis is not available
    _ensure_dir(cache_name)
    file_path = _get_path(cache_name, key)
    try:
        entry = {"timestamp": time.time(), "data": data}
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False)
    except Exception:
        pass

def get_persistent(cache_name: str, key: str) -> Optional[Any]:
    """Get persistent data (always checks Redis first, then Disk)."""
    r = _get_redis()
    if r:
        try:
            val = r.get(f"persist:{cache_name}:{key}")
            if val: return json.loads(val)
        except Exception: pass
        
    file_path = _get_path(cache_name, key)
    if not os.path.exists(file_path): return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if r: set_persistent(cache_name, key, data)
            return data
    except Exception: return None

def set_persistent(cache_name: str, key: str, data: Any):
    """Set data that never expires."""
    r = _get_redis()
    if r:
        try: r.set(f"persist:{cache_name}:{key}", json.dumps(data, ensure_ascii=False))
        except Exception: pass
        
    _ensure_dir(cache_name)
    file_path = _get_path(cache_name, key)
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception: pass

# Legacy loader for single-file user data (e.g., settings.json)
def load_cache(filename: str) -> dict:
    if not os.path.exists(filename): return {}
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception: return {}

def save_cache(filename: str, data: dict):
    try:
        _ensure_dir(os.path.dirname(filename))
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception: pass
