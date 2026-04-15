import json
import os
import time
import threading

_cache = {}
_cache_loaded = set()
_dirty_caches = set()
_last_save_time = {}
_CACHE_SAVE_INTERVAL = 5  # seconds
_cache_lock = threading.Lock()

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

def _ensure_cache_loaded(cache_name):
    if cache_name not in _cache_loaded:
        _cache[cache_name] = load_cache(cache_name)
        _cache_loaded.add(cache_name)

def _save_cache_if_due(cache_name, force=False):
    if cache_name not in _cache_loaded:
        return
    now = time.time()
    last_save = _last_save_time.get(cache_name, 0)
    if force or (now - last_save >= _CACHE_SAVE_INTERVAL):
        save_cache(cache_name, _cache.get(cache_name, {}))
        _last_save_time[cache_name] = now
        _dirty_caches.discard(cache_name)

def get_from_cache(cache_name, key, expire_seconds):
    with _cache_lock:
        _ensure_cache_loaded(cache_name)
        entry = _cache.get(cache_name, {}).get(key)
        if not entry:
            return None
        if time.time() - entry.get("timestamp", 0) < expire_seconds:
            return entry.get("data")
        _cache[cache_name].pop(key, None)
        _dirty_caches.add(cache_name)
        return None

def set_to_cache(cache_name, key, data):
    with _cache_lock:
        _ensure_cache_loaded(cache_name)
        _cache.setdefault(cache_name, {})[key] = {"timestamp": time.time(), "data": data}
        _dirty_caches.add(cache_name)
        _save_cache_if_due(cache_name)

def save_all_caches():
    with _cache_lock:
        for cache_name in list(_cache_loaded):
            _save_cache_if_due(cache_name, force=True)
