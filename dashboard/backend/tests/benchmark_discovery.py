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
from app.infrastructure.scrapers.kkphim_lookup import lookup_kkphim
from app.infrastructure.scrapers.ophim_lookup import lookup_ophim
from app.infrastructure.scrapers.phimapi_base import tmdb_get_info

# Set token
config.TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

TEST_CASES = [
    {"id": "37854",  "type": "tv", "title": "One Piece",         "localize": "Đảo Hải Tặc",            "year": 1999, "note": "Anime"},
    {"id": "111110", "type": "tv", "title": "One Piece",         "localize": "Đảo Hải Tặc Live Action","year": 2023, "note": "Live Action"},
    {"id": "76479",  "type": "tv", "title": "The Boys",          "localize": "Siêu Anh Hùng Phá Hoại", "year": 2019, "note": "Series"},
]

async def run_focused_analysis(provider_name, lookup_func):
    async with httpx.AsyncClient(timeout=60.0) as client:
        print(f"\n{'='*100}")
        print(f"{f'{provider_name.upper()} FOCUSED COVERAGE ANALYSIS':^100}")
        print(f"{'='*100}\n")
        
        for case in TEST_CASES:
            tmdb_id, m_type, title, localize, year = case["id"], case["type"], case["title"], case["localize"], case["year"]
            
            # Fetch Real Metadata
            tmdb_info = await tmdb_get_info(client, m_type, tmdb_id)
            target_eps = tmdb_info.total_episodes or 40
            
            print(f"🎬 {title:<12} ({year}) | ID: {tmdb_id:<7} | Target: {target_eps:>4} eps | {case['note']}")

            try:
                # lookup_func returns list of StreamingEpisode objects
                res = await lookup_func(client, tmdb_id, title, localize, m_type, 1, None, year, tmdb_info=tmdb_info)
                
                # Count Unique Episodes
                unique_eps = {}
                for ep in res:
                    # ep is StreamingEpisode model
                    key = (ep.season, ep.name.strip())
                    if key not in unique_eps: unique_eps[key] = ep
                
                found_count = len(unique_eps)
                coverage = (found_count / target_eps) * 100 if target_eps > 0 else 0
                
                # Distribution
                stats = {}
                for (s, _) in unique_eps.keys(): stats[s] = stats.get(s, 0) + 1
                
                print(f"   - Found: {found_count:>4} unique eps | Coverage: {coverage:>5.1f}%")
                for s, count in sorted(stats.items()):
                    print(f"     * Season {s}: {count} eps")

            except Exception as e:
                print(f"   - 🔴 Error: {e}")
            print("-" * 60)

async def main():
    await run_focused_analysis("kkphim", lookup_kkphim)
    await run_focused_analysis("ophim", lookup_ophim)

if __name__ == "__main__":
    asyncio.run(main())
