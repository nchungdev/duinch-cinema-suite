import os

STORAGE_PATH = os.getenv("STORAGE_PATH", "/storage")
JD_INTERNAL_PATH = os.getenv("JD_INTERNAL_PATH", "/downloads")
MYJD_EMAIL = os.getenv("MYJD_EMAIL")
MYJD_PASSWORD = os.getenv("MYJD_PASSWORD")
TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")
FSHARE_APP_KEY = os.getenv("FSHARE_APP_KEY")
FSHARE_USER_AGENT = os.getenv("FSHARE_USER_AGENT")

METADATA_CACHE_EXPIRE = 24 * 3600  # 24 hours
DISCOVERY_CACHE_EXPIRE = 3600      # 1 hour

TMDB_CACHE = "tmdb_cache.json"
KKPHIM_CACHE = "kkphim_cache.json"
