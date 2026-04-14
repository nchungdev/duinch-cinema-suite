import httpx
from bs4 import BeautifulSoup
import asyncio
from typing import List, Dict

import urllib.parse

async def lookup_thuviencine(title: str) -> List[Dict[str, str]]:
    """
    Searches ThuVienCine for Fshare links based on a movie title.
    Flow: Search -> Detail Page -> Download Page -> Extract Fshare links
    """
    search_url = f"https://thuviencine.com/?s={urllib.parse.quote(title)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    links = []
    async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
        try:
            # 1. Search
            resp = await client.get(search_url)
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # Find the best match in search results
            # The browser research indicated a[title] is a good selector
            results = soup.select('a[title]')
            if not results:
                return []
            
            # Use the first result (usually the most relevant)
            detail_url = results[0].get('href')
            if not detail_url:
                return []
            
            # 2. Get Detail Page
            resp_detail = await client.get(detail_url)
            soup_detail = BeautifulSoup(resp_detail.text, 'html.parser')
            
            # Find Download link /download?id=...
            # The selector from research was a[href*="/download?id="]
            download_btn = soup_detail.select_one('a[href*="/download?id="]')
            if not download_btn:
                return []
            
            download_page_url = download_btn.get('href')
            # Handle relative URLs if any
            if download_page_url.startswith('/'):
                download_page_url = "https://thuviencine.com" + download_page_url
            
            # 3. Get Download Page
            resp_download = await client.get(download_page_url)
            soup_download = BeautifulSoup(resp_download.text, 'html.parser')
            
            # Extract Fshare links
            # Selector from research: a#hover[href*="fshare.vn"]
            fshare_els = soup_download.select('a[href*="fshare.vn"]')
            for el in fshare_els:
                url = el.get('href')
                name = el.get_text(strip=True) or "Fshare Link (ThuVienCine)"
                if url not in [link['url'] for link in links]:
                    links.append({
                        "name": f"THUVIENCINE | {name}",
                        "url": url,
                        "source": "thuviencine"
                    })
                    
        except Exception as e:
            print(f"Error scraping ThuVienCine: {e}")
            
    return links

if __name__ == "__main__":
    # Test
    res = asyncio.run(lookup_thuviencine("One Piece film Red 2022"))
    for r in res:
        print(r)
