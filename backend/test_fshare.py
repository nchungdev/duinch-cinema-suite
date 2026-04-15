import asyncio
import os
import sys
import httpx
from typing import List, Dict, Any

# Add backend to path
sys.path.append(os.getcwd())

from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.hdvietnam_lookup import lookup_hdvietnam

async def test_fshare_discovery(title: str, tmdb_id: int = None):
    print(f"=== TESTING FSHARE DISCOVERY FOR: {title} ===")
    
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        # 1. ThuvienCine
        try:
            tv = await lookup_thuviencine(title)
            print(f"[ThuvienCine]: {len(tv)} links")
        except Exception as e: print(f"[ThuvienCine] ERROR: {e}")

        # 2. Google Search (Direct)
        try:
            gf = await lookup_google_fshare(title)
            print(f"[Google]: {len(gf)} links")
            if gf: print(f"   Sample: {gf[0]['url']}")
        except Exception as e: print(f"[Google] ERROR: {e}")

        # 3. HDVietnam
        try:
            hd = await lookup_hdvietnam(title)
            print(f"[HDVietnam]: {len(hd)} links")
            if hd: print(f"   Sample: {hd[0]['url']}")
        except Exception as e: print(f"[HDVietnam] ERROR: {e}")

        # 4. KKPhim/OPhim (Verify Streaming one last time)
        try:
            kk = await lookup_kkphim(client, title=title, media_type="tv", tmdb_id=str(tmdb_id))
            op = await lookup_ophim(client, tmdb_id=tmdb_id, title=title, media_type="tv")
            print(f"[Streaming]: KKPhim({len(kk)}), OPhim({len(op)})")
        except Exception as e: print(f"[Streaming] ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_fshare_discovery("one piece live action", tmdb_id=111110))
