import asyncio
import httpx
import os
import sys
import json
import re
from dotenv import load_dotenv
from typing import List, Dict, Any

# Load environment
load_dotenv()
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core import config
from app.infrastructure.scrapers.fshare_lookup import lookup_timfshare
from app.infrastructure.scrapers.phimapi_base import tmdb_get_info

# Set token manually
config.TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

TEST_CASES = [
    {"id": "37854",  "type": "tv", "title": "One Piece",         "localize": "Đảo Hải Tặc",            "year": 1999},
    {"id": "76479",  "type": "tv", "title": "The Boys",          "localize": "Siêu Anh Hùng Phá Hoại", "year": 2019},
    {"id": "157336", "type": "movie", "title": "Interstellar",   "localize": "Hố Đen Tử Thần",         "year": 2014},
]

async def run_fshare_analysis():
    async with httpx.AsyncClient(timeout=60.0) as client:
        print(f"\n{'='*100}")
        print(f"{'FSHARE DISCOVERY BENCHMARK (CLEAN ARCH)':^100}")
        print(f"{'='*100}\n")
        
        for case in TEST_CASES:
            tmdb_id, m_type, title, localize, year = case["id"], case["type"], case["title"], case["localize"], case["year"]
            
            # Fetch real metadata
            tmdb_info = await tmdb_get_info(client, m_type, tmdb_id)
            print(f"🎬 {title} ({year}) | ID: {tmdb_id}")
            
            query = f"{title} {year}"
            
            # lookup_timfshare returns list of DownloadableLink objects
            results_tim = await lookup_timfshare(query, year=year, filter_title=title, localize_title=localize, media_type=m_type, tmdb_info=tmdb_info)
            
            print(f"  - timfshare      : {'✅' if results_tim else '⚪'} Found {len(results_tim):>3} links")
            for r in results_tim[:3]:
                size_gb = (r.size / 1024**3)
                print(f"      * {r.name[:60]}... ({size_gb:.1f} GB)")
            
            print("-" * 60)

if __name__ == "__main__":
    asyncio.run(run_fshare_analysis())
