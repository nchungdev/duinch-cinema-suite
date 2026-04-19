import asyncio
import re
import urllib.parse
from typing import List, Dict, Any, Optional
from curl_cffi import requests
from bs4 import BeautifulSoup
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

class ForumScraperBase:
    def __init__(self, domain: str, name: str):
        self.domain = domain.rstrip('/')
        self.name = name
        self.base_url = f"https://{self.domain}"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        }

    async def _dork_threads(self, query: str) -> List[str]:
        """Find relevant forum threads using DuckDuckGo HTML (Anti-bot resilient)."""
        dork_query = f'site:{self.domain} "{query}" Fshare'
        encoded_query = urllib.parse.quote(dork_query)
        # Use DDG HTML version - easier to scrape and less blocking
        url = f"https://duckduckgo.com/html/?q={encoded_query}"
        
        thread_urls = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(url, headers=self.headers, timeout=20, impersonate="chrome110")
                if resp.status_code != 200:
                    print(f"[{self.name}] Dorking Blocked: {resp.status_code}")
                    return []
                
                soup = BeautifulSoup(resp.text, 'html.parser')
                # Results are in 'a.result__a' in DDG HTML
                for a in soup.select('a.result__a'):
                    href = a.get('href')
                    if href:
                        # Decode DDG proxy links if necessary
                        if "uddg=" in href:
                            href = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
                        
                        if self.domain in href and any(x in href for x in ["/threads/", "/t/", "/showthread.php"]):
                            thread_urls.append(href)
                            
                print(f"[{self.name}] Dorking found {len(thread_urls)} threads for '{query}'")
        except Exception as e:
            print(f"[{self.name}] Dorking Error: {e}")
            
        return list(dict.fromkeys(thread_urls))[:5]

    async def _mine_links(self, thread_url: str) -> List[DownloadableLink]:
        """Deep mine FShare links from thread content."""
        links = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self.headers, timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                
                html = resp.text
                # Look for folder and file links
                fshare_matches = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', html)
                
                soup = BeautifulSoup(html, 'html.parser')
                page_title = soup.title.string.split('|')[0].split('-')[0].strip() if soup.title else "Forum Post"

                for url in list(dict.fromkeys(fshare_matches)):
                    is_folder = "/folder/" in url
                    links.append(DownloadableLink(
                        name=f"[{self.name}] {page_title}",
                        url=url,
                        size=0,
                        source=self.name.lower(),
                        is_folder=is_folder,
                        source_page=thread_url
                    ))
        except Exception as e:
            print(f"[{self.name}] Mining Error {thread_url}: {e}")
        return links

    async def lookup(self, query: str, tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
        """Discovery Cycle: Resilient Dorking -> Deep Mining."""
        all_found = []
        search_terms = [query]
        if tmdb_info and tmdb_info.title and tmdb_info.title != query:
            search_terms.append(tmdb_info.title)

        for q in list(dict.fromkeys(search_terms)):
            thread_urls = await self._dork_threads(q)
            if not thread_urls: continue
            
            # Mine each thread found
            for url in thread_urls:
                r_list = await self._mine_links(url)
                all_found.extend(r_list)
                await asyncio.sleep(0.5) # Polite delay
            
        # Prioritize folders and deduplicate
        unique_links, seen = [], set()
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        
        # Sort so folders come first
        unique_links.sort(key=lambda x: not x.is_folder)
        return unique_links
