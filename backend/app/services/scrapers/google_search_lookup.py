import httpx
from bs4 import BeautifulSoup
import asyncio
from typing import List, Dict

async def lookup_google_fshare(title: str) -> List[Dict[str, str]]:
    """
    Searches Google for Fshare links based on a movie title.
    Query: "{title} fshare"
    """
    # Use the cleaner query suggested by user
    query = f"{title} fshare"
    search_url = f"https://www.google.com/search?q={httpx.utils.quote(query)}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8"
    }
    
    links = []
    async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
        try:
            resp = await client.get(search_url)
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # Find all links containing fshare.vn
            # Based on research, Google results use a[href*="fshare.vn"]
            search_results = soup.select('a[href*="fshare.vn"]')
            
            for el in search_results:
                url = el.get('href')
                
                # Google URLs often have prefixes like /url?q=
                if url.startswith('/url?q='):
                    url = url.split('/url?q=')[1].split('&')[0]
                
                # Validate it's a real fshare link
                if 'fshare.vn' in url and '/file/' in url or '/folder/' in url:
                    # Try to get a clean name from the title or surrounding text
                    # Usually the text inside the <a> is the title
                    name = el.get_text(strip=True) or "Fshare Content"
                    if url not in [link['url'] for link in links]:
                        links.append({
                            "name": f"GOOGLE | {name[:50]}...",
                            "url": url,
                            "source": "google"
                        })
                        
        except Exception as e:
            print(f"Error scraping Google: {e}")
            
    return links

if __name__ == "__main__":
    # Test
    res = asyncio.run(lookup_google_fshare("One Piece film Red 2022"))
    for r in res:
        print(r)
