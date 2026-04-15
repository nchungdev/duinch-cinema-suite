import asyncio
import os
import sys
import httpx
from typing import List, Dict, Any

# Add backend to path
sys.path.append(os.getcwd())

from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare

async def test_all_providers(title: str, media_type: str = "tv", tmdb_id: int = None):
    print(f"=== TESTING ALL PROVIDERS FOR: {title} (ID: {tmdb_id}) ===")
    
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        # 1. KKPhim
        try:
            kk = await lookup_kkphim(client, title=title, media_type=media_type, tmdb_id=str(tmdb_id) if tmdb_id else None)
            print(f"[KKPhim]: {len(kk)} results")
            if kk: print(f"   First: {kk[0]['name']} - {kk[0].get('server')}")
        except Exception as e: print(f"[KKPhim] ERROR: {e}")

        # 2. OPhim
        try:
            op = await lookup_ophim(client, tmdb_id=tmdb_id, title=title, media_type=media_type)
            print(f"[OPhim]: {len(op)} results")
            if op: print(f"   First: {op[0]['name']} - {op[0].get('server')}")
        except Exception as e: print(f"[OPhim] ERROR: {e}")

        # 3. Torrent
        try:
            tor = await lookup_torrent(title)
            print(f"[Torrent]: {len(tor)} results")
        except Exception as e: print(f"[Torrent] ERROR: {e}")

        # 4. GDrive
        try:
            gd = await lookup_gdrive(title)
            print(f"[GDrive]: {len(gd)} results")
        except Exception as e: print(f"[GDrive] ERROR: {e}")

        # 5. FShare
        try:
            gf = await lookup_google_fshare(title)
            print(f"[FShare]: {len(gf)} results from Google")
        except Exception as e: print(f"[FShare] ERROR: {e}")

if __name__ == "__main__":
    # One Piece (TV) TMDB ID is 37854
    asyncio.run(test_all_providers("One Piece", tmdb_id=37854))
