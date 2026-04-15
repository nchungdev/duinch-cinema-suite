import httpx
from bs4 import BeautifulSoup
import asyncio
import re
import urllib.parse
from typing import List, Dict

async def lookup_google_fshare(title: str) -> List[Dict[str, str]]:
    """Meta-Scraper for FShare using Bing and DuckDuckGo (more scrape-friendly)."""
    all_links = []
    seen_urls = set()
    
    # 1. Search Queries
    q = f'"{title}" fshare.vn'
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

    async with httpx.AsyncClient(timeout=15.0, headers=headers, follow_redirects=True) as client:
        # Task 1: Bing Search (Thường rất tốt cho forum VN)
        # Task 2: DuckDuckGo HTML
        tasks = [
            fetch_from_bing(client, q),
            fetch_from_ddg(client, q)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res_list in results:
            if isinstance(res_list, list):
                for item in res_list:
                    if item["url"] not in seen_urls:
                        all_links.append(item)
                        seen_urls.add(item["url"])
                        
    return all_links

async def fetch_from_bing(client: httpx.AsyncClient, q: str):
    try:
        url = f"https://www.bing.com/search?q={urllib.parse.quote(q)}"
        resp = await client.get(url)
        if resp.status_code != 200: return []
        
        # Trích xuất link FShare từ snippet
        links = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', resp.text)
        return [{"url": l, "name": f"BING | FShare", "source": "bing"} for l in set(links)]
    except Exception: return []

async def fetch_from_ddg(client: httpx.AsyncClient, q: str):
    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(q)}"
        resp = await client.get(url)
        if resp.status_code != 200: return []
        
        links = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', resp.text)
        return [{"url": l, "name": f"DDG | FShare", "source": "ddg"} for l in set(links)]
    except Exception: return []
