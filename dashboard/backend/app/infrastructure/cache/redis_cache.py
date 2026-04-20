import json
import redis
import os
from typing import Optional, Any
from app.core import config

class CacheManager:
    def __init__(self):
        try:
            # Use environment variable for redis host to be flexible
            redis_host = os.getenv("REDIS_HOST", "localhost")
            self.redis = redis.Redis(host=redis_host, port=6379, db=0, decode_responses=True)
            self.redis.ping()
            print("[Cache] Redis connected.")
        except Exception:
            self.redis = None
            print("[Cache] Redis not available, using passthrough.")

    def get_discovery(self, provider: str, tmdb_id: Any, season: int = 1) -> Optional[list]:
        if not self.redis: return None
        key = f"discovery:{provider}:{tmdb_id}:{season}"
        data = self.redis.get(key)
        return json.loads(data) if data else None

    def set_discovery(self, provider: str, tmdb_id: Any, season: int, results: list, ttl: int = 3600 * 6):
        if not self.redis or not results: return
        key = f"discovery:{provider}:{tmdb_id}:{season}"
        self.redis.setex(key, ttl, json.dumps(results))

    def clear_discovery(self, tmdb_id: Any, season: int = None):
        if not self.redis: return
        pattern = f"discovery:*:{tmdb_id}:*"
        if season: pattern = f"discovery:*:{tmdb_id}:{season}"
        keys = self.redis.keys(pattern)
        if keys: self.redis.delete(*keys)

# Singleton instance
cache_manager = CacheManager()
