import asyncio
import httpx
import os
import sys
import json
from dotenv import load_dotenv
from typing import List, Dict, Any

load_dotenv()
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core import config
from app.infrastructure.scrapers.ophim_lookup import lookup_ophim
from app.infrastructure.scrapers.phimapi_base import tmdb_get_info

# Set token
config.TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

TEST_CASES = [
    {"id": "37854",  "type": "tv",    "title": "One Piece",         "year": 1999, "note": "Anime"},
    {"id": "111110", "type": "tv",    "title": "One Piece",         "year": 2023, "note": "Live Action"},
    {"id": "76479",  "type": "tv",    "title": "The Boys",          "year": 2019},
    {"id": "1399",   "type": "tv",    "title": "Game of Thrones",   "year": 2011},
]

async def run_ophim_analysis():
    async with httpx.AsyncClient(timeout=40.0) as client:
        print(f"\n{'='*100}")
        print(f"{'OPHIM ACCURACY & COVERAGE ANALYSIS (CLEAN ARCH)':^100}")
        print(f"{'='*100}\n")
        
        for case in TEST_CASES:
            tmdb_id, m_type, title, expected_year = case["id"], case["type"], case["title"], case["year"]
            
            tmdb_info = await tmdb_get_info(client, m_type, tmdb_id)
            tmdb_total = tmdb_info.total_episodes or 40

            print(f"🎬 {title:<15} ({expected_year}) | ID: {tmdb_id:<7} | TMDB Target: {tmdb_total:>4} eps")

            try:
                res = await lookup_ophim(client, tmdb_id, title, None, m_type, 1, None, expected_year, tmdb_info=tmdb_info)
                
                unique_eps = {}
                for ep in res:
                    key = (ep.season, ep.name.strip())
                    if key not in unique_eps: unique_eps[key] = ep
                
                found_count = len(unique_eps)
                coverage = (found_count / tmdb_total) * 100 if tmdb_total > 0 else 0
                
                season_stats = {}
                for (s, _) in unique_eps.keys(): season_stats[s] = season_stats.get(s, 0) + 1
                
                print(f"   - Found: {found_count:>4} unique eps | Coverage: {coverage:>5.1f}%")
                for s, count in sorted(season_stats.items()):
                    print(f"     * Season {s}: {count} eps")

            except Exception as e:
                print(f"   - 🔴 Error: {e}")

            print("-" * 60)

if __name__ == "__main__":
    asyncio.run(run_ophim_analysis())
