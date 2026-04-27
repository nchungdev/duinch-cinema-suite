import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.infrastructure.scrapers.fshare_lookup import lookup_timfshare

async def main():
    print("Searching for: one piece live action")
    try:
        results = await lookup_timfshare("one piece live action")
        print(f"TimFShare: {len(results)} results")
        for r in results:
            print(f"  - {r.name}: {r.url}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
