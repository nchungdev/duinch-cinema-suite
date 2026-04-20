import asyncio
import sys
import os
import argparse

# Ensure we can import from local crawler package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from miner.engine import crawler

async def main():
    parser = argparse.ArgumentParser(description="FShare Data Miner (Crawler)")
    parser.add_argument("--pages", type=int, default=1, help="Number of pages to scrape per node")
    args = parser.parse_args()

    print("\n" + "="*50)
    print("      ⛏️  FSHARE DATA MINER (CRAWLER) 🚀")
    print("="*50)

    await crawler.run(pages=args.pages)

    print("\n" + "="*50)
    print("      ✅ MINING SESSION FINISHED")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())
