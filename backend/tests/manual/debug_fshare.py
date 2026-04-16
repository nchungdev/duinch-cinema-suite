import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare

async def main():
    print("Searching for: one piece live action")
    try:
        tv = await lookup_thuviencine("one piece live action")
        print(f"Thuvien: {len(tv)} results")
        for r in tv:
            print(f"  - {r['url']}")
            
        gf = await lookup_google_fshare("one piece live action")
        print(f"GoogleFShare: {len(gf)} results")
        for r in gf:
            print(f"  - {r['url']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
