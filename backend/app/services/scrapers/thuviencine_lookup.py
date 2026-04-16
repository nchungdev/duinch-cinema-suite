import httpx
from bs4 import BeautifulSoup
import asyncio
import re
from typing import List, Dict

import urllib.parse

async def lookup_thuviencine(title: str) -> List[Dict[str, str]]:
    """
    Searches ThuVienCine for Fshare links.
    Flow: Search (multiple attempts) -> Detail Page -> Download Page -> Extract Fshare links
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
    
    # 0. Tạo search variants
    search_queries = [title]
    # Bỏ các phần phụ để search rộng nhất có thể
    simple_title = re.sub(r'Part\s+\d+|Season\s+\d+|Live\s+Action|\d{4}', '', title, flags=re.IGNORECASE).strip()
    if simple_title != title:
        search_queries.append(simple_title)
    
    words = simple_title.split()
    if len(words) > 1:
        search_queries.append(words[0]) # Thử chỉ từ đầu tiên
        
    links = []
    async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
        for query in search_queries:
            try:
                search_url = f"https://thuviencine.com/?s={urllib.parse.quote(query)}"
                # print(f"[ThuVienCine] Searching: {search_url}")
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # Tìm các bài viết trong kết quả search - more robust selectors
                results = soup.select('.item a[href], article a[href], .post-title a, h2 a, h3 a')
                # print(f"[ThuVienCine] Found {len(results)} potential results")
                
                if not results: continue # Thử variant tiếp theo
                
                # Duyệt qua top 5 kết quả để tìm đúng phim
                for res in results[:5]:
                    detail_url = res.get('href', '')
                    if not detail_url or 'thuviencine.com' not in detail_url: continue
                    if 'download?id=' in detail_url: continue # Skip if it's already a download link
                    
                    # 2. Get Detail Page
                    # print(f"[ThuVienCine] Fetching detail: {detail_url}")
                    resp_detail = await client.get(detail_url)
                    soup_detail = BeautifulSoup(resp_detail.text, 'html.parser')
                    
                    # More robust selector for download button
                    download_btn = soup_detail.select_one('a[href*="/download?id="], #download-button a, .download-link')
                    if not download_btn:
                        # print(f"[ThuVienCine] No download button on {detail_url}")
                        continue
                    
                    download_page_url = download_btn.get('href')
                    if download_page_url.startswith('/'): download_page_url = "https://thuviencine.com" + download_page_url
                    
                    # 3. Get Download Page
                    # print(f"[ThuVienCine] Fetching download page: {download_page_url}")
                    resp_download = await client.get(download_page_url)
                    soup_download = BeautifulSoup(resp_download.text, 'html.parser')
                    
                    fshare_els = soup_download.select('a[href*="fshare.vn"]')
                    # print(f"[ThuVienCine] Found {len(fshare_els)} Fshare links")
                    
                    for el in fshare_els:
                        url = el.get('href')
                        name = el.get_text(" ", strip=True) or f"FShare Link"
                        
                        # Clean up name: "Download | 33.37 GB One.Piece..." -> "33.37 GB - One.Piece..."
                        name = re.sub(r'^Download\s*\|\s*', '', name)
                        # Fix spacing for size: "33.37 GBOne.Piece" -> "33.37 GB - One.Piece"
                        name = re.sub(r'^(\d+\.?\d*\s*[GM]B)(.*)', r'\1 - \2', name)
                        
                        if url not in [link['url'] for link in links]:
                            links.append({
                                "type": "downloadable",
                                "name": f"THUVIENCINE | {name}",
                                "url": url,
                                "source": "thuviencine"
                            })
                
                if links: break # Đã thấy link thì ko cần thử query tổng quát hơn nữa
            except Exception:
                continue
                
    return links

if __name__ == "__main__":
    # Test
    res = asyncio.run(lookup_thuviencine("One Piece film Red 2022"))
    for r in res:
        print(r)
