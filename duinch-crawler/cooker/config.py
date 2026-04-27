import os
from dotenv import load_dotenv

_current_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(os.path.dirname(_current_dir))
load_dotenv(os.path.join(_project_root, ".env"))

DATA_DIR = os.path.join(_current_dir, "data")
DB_PATH = os.path.join(DATA_DIR, "cooker.db")

# Path to Miner's DB (Source for RAW threads) - Now using same PG DB
DATABASE_URL = os.getenv("DATABASE_URL")
TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")
