import os
from dotenv import load_dotenv

# Load .env tu thu muc goc cua project (3 cap thu muc len tren)
_current_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(os.path.dirname(_current_dir))
load_dotenv(os.path.join(_project_root, ".env"))

# Data & Logs cuc bo
DATA_DIR = os.path.join(_current_dir, "data")
LOGS_DIR = os.path.join(_current_dir, "logs")
DB_PATH = os.path.join(DATA_DIR, "miner.db")

RAW_THREAD_TTL = int(os.getenv("RAW_THREAD_TTL", 86400))
DATABASE_URL = os.getenv("DATABASE_URL")
TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")
