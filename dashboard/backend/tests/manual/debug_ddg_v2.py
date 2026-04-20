import asyncio
from duckduckgo_search import DDGS
import warnings

async def test_ddgs_v2():
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    print("Testing DDGS with simple proxy/agent-like parameters...")
    
    try:
        def _search():
            # Sử dụng tham số context linh hoạt hơn
            with DDGS() as ddgs:
                results = list(ddgs.text("one piece fshare", max_results=5))
                return results
        
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(None, _search)
        print(f"Success! Found {len(res)} results.")
        for r in res:
            print(f" - {r['title']}: {r['href']}")
            
    except Exception as e:
        print(f"DDGS Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_ddgs_v2())
