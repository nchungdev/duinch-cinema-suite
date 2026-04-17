import os

# --- Load Variables ---
STORAGE_PATH = os.getenv("STORAGE_PATH", "/storage")
JD_INTERNAL_PATH = os.getenv("JD_INTERNAL_PATH", "/downloads")
MYJD_EMAIL = os.getenv("MYJD_EMAIL")
MYJD_PASSWORD = os.getenv("MYJD_PASSWORD")
TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")
FSHARE_APP_KEY = os.getenv("FSHARE_APP_KEY")
FSHARE_USER_AGENT = os.getenv("FSHARE_USER_AGENT")

METADATA_CACHE_EXPIRE = int(os.getenv("TMDB_CACHE_TTL", 24 * 3600))
DISCOVERY_CACHE_EXPIRE = int(os.getenv("DISCOVERY_CACHE_TTL", 3600))
THUVIENCINE_CACHE_TTL = int(os.getenv("THUVIENCINE_CACHE_TTL", 24 * 3600))
TIMFSHARE_CACHE_TTL = int(os.getenv("TIMFSHARE_CACHE_TTL", 8 * 3600))
FSHARE_SEARCH_TTL = int(os.getenv("FSHARE_SEARCH_TTL", 8 * 3600))
FSHARE_NAME_TTL = int(os.getenv("FSHARE_NAME_TTL", 7 * 24 * 3600))
FSHARE_FOLDER_TTL = int(os.getenv("FSHARE_FOLDER_TTL", 24 * 3600))
IMAGE_CACHE_TTL = int(os.getenv("IMAGE_CACHE_TTL", 3600))

# Data Root Structure
# Default to the project root (parent of backend/app/core) / data
_current_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(_current_dir)))
DATA_ROOT = os.getenv("DATA_ROOT", os.path.join(_project_root, "data"))

# 1. Cache (Transient - can be deleted)
CACHE_DIR = os.path.join(DATA_ROOT, "cache")
TMDB_CACHE = os.path.join(CACHE_DIR, "tmdb_cache.json")
KKPHIM_CACHE = os.path.join(CACHE_DIR, "kkphim_cache.json")
IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "image_cache")
THUVIENCINE_CACHE = os.path.join(CACHE_DIR, "thuviencine_cache.json")
TIMFSHARE_CACHE = os.path.join(CACHE_DIR, "timfshare_cache.json")
GOOGLE_SEARCH_CACHE = os.path.join(CACHE_DIR, "google_search_cache.json")
GOOGLE_SEARCH_NAME_CACHE = os.path.join(CACHE_DIR, "fshare_name_cache.json")
FSHARE_FOLDER_CACHE = os.path.join(CACHE_DIR, "fshare_folder_cache.json")

# 2. Persistent Content (User Data - keep always)
USER_DIR = os.path.join(DATA_ROOT, "user")
USER_SETTINGS = os.path.join(USER_DIR, "settings.json")
USER_PROGRESS = os.path.join(USER_DIR, "progress.json")
USER_HISTORY = os.path.join(USER_DIR, "history.json")

# 3. Sensitive Content (Config/Secrets)
SECRETS_DIR = os.path.join(DATA_ROOT, "secrets")
# (Reserved for future encrypted tokens or private keys)
