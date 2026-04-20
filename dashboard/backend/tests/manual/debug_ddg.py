import asyncio
import re
from duckduckgo_search import DDGS
import json

async def debug_torrent(title_query):
    query = f"{title_query} torrent magnet"
    print(f"Searching for: {query}")
    results = []
    try:
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=10))
            print(f"Found {len(search_results)} search results")
            for res in search_results:
                print(f"Result URL: {res.get('href')}")
                snippet = res.get("body", "")
                magnet_links = re.findall(r'magnet:\?xt=[^\s"\'<>]+', snippet)
                if magnet_links:
                    print(f"  Found magnets: {len(magnet_links)}")
                for m in magnet_links:
                    results.append(m)
    except Exception as e:
        print(f"Error: {e}")
    return results

if __name__ == "__main__":
    asyncio.run(debug_torrent("one piece live action"))
