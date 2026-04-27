import asyncio
import sys
import os
import argparse

# Ensure we can import from local processor package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cooker.engine import processor

async def main():
    parser = argparse.ArgumentParser(description="FShare Data Cooker (Processor)")
    parser.add_argument("--limit", type=int, default=100, help="Number of raw threads to process")
    args = parser.parse_args()

    print("\n" + "="*50)
    print("      🍳 FSHARE DATA PROCESSOR (COOKER) 🚀")
    print("="*50)

    await processor.run(limit=args.limit)

    print("\n" + "="*50)
    print("      ✅ PROCESSING SESSION FINISHED")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())
