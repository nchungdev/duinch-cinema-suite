import asyncio
from duckduckgo_search import DDGS

async def debug_simple():
    try:
        with DDGS() as ddgs:
            # Simple keyword search
            results = list(ddgs.text("one piece", max_results=5))
            print(f"Results for 'one piece': {len(results)}")
            for r in results:
                print(f"- {r.get('href')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(debug_simple())
