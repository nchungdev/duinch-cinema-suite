import asyncio
import re
import httpx
from typing import List, Dict, Any
import urllib.parse
from bs4 import BeautifulSoup

async def lookup_gdrive(title_query: str) -> List[Dict[str, Any]]:
    """Search for Google Drive links using specialized search queries."""
    results = []
    
    # 1. Bóc tách title
    clean_title = re.sub(r'\(.*?\)', '', title_query).strip()
    
    # Kỹ thuật search GDrive chuyên sâu
    queries = [
        f'"{clean_title}" drive.google.com/drive/folders/',
        f'"{clean_title}" site:drive.google.com'
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
        for q in queries:
            try:
                # Thử qua DuckDuckGo (vì Google dễ bị block search query nâng cao)
                search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(q)}"
                resp = await client.get(search_url)
                if resp.status_code != 200: continue
                
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # 1. Trích xuất link trực tiếp từ text/soup
                gdrive_links = re.findall(r'https?://drive\.google\.com/(?:drive/folders/|file/d/)[a-zA-Z0-9_-]+', resp.text)
                for link in gdrive_links:
                    results.append({
                        "type": "downloadable", "provider": "gdrive",
                        "url": link, "name": f"GDRIVE | {clean_title}", "source": "search"
                    })
                
                if results: break # Thấy rồi thì thôi
                
            except Exception:
                continue
                
    # Deduplicate
    seen = set()
    final = []
    for r in results:
        if r["url"] not in seen:
            final.append(r)
            seen.add(r["url"])
            
    return final
