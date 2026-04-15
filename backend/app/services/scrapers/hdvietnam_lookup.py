import httpx
from bs4 import BeautifulSoup
import asyncio
import re
import urllib.parse
from typing import List, Dict

async def lookup_hdvietnam(title: str) -> List[Dict[str, str]]:
    """
    Search for FShare links on HDVietnam forum.
    Note: HDVietnam search often requires login, so we use Google site search as a proxy.
    """
    try:
        query = f'site:hdvietnam.xyz "{title}" fshare'
        # We'll use a similar logic to google_search but focused on HDVietnam
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
        
        links = []
        seen_urls = set()
        
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            # 1. Search Google for HDVietnam threads
            search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}"
            resp = await client.get(search_url)
            
            if resp.status_code != 200:
                # Fallback to DDG
                search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
                resp = await client.get(search_url)

            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                thread_urls = []
                
                # Google
                for a in soup.select('a[href^="/url?q="]'):
                    href = a.get('href')
                    real_url = urllib.parse.unquote(href.split("/url?q=")[1].split("&")[0])
                    if "hdvietnam" in real_url:
                        thread_urls.append(real_url)
                
                # DDG
                for a in soup.select('.result__a'):
                    if "hdvietnam" in a.get('href', ''):
                        thread_urls.append(a.get('href'))

                # 2. Scrape threads for FShare links
                tasks = [fetch_fshare_from_hdvn(client, url) for url in thread_urls[:3]]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for res_list in results:
                    if isinstance(res_list, list):
                        for item in res_list:
                            if item["url"] not in seen_urls:
                                links.append(item)
                                seen_urls.add(item["url"])
        return links
    except Exception as e:
        print(f"Error in HDVietnam lookup: {e}")
        return []

async def fetch_fshare_from_hdvn(client: httpx.AsyncClient, url: str) -> List[Dict[str, str]]:
    try:
        resp = await client.get(url, timeout=10.0)
        if resp.status_code != 200: return []
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        links = []
        
        # HDVietnam often puts links in [CODE] tags or specific containers
        # But generic fshare link search is usually enough
        fshare_links = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', resp.text)
        for fl in fshare_links:
            links.append({
                "url": fl,
                "name": f"HDVIETNAM | {url.split('/')[-1][:30]}...",
                "source_page": url,
                "source": "hdvietnam"
            })
        return links
    except Exception:
        return []
