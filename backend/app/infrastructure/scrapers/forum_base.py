import asyncio
import re
import urllib.parse
from typing import List, Dict, Any, Optional
from curl_cffi import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

class ForumScraperBase:
    def __init__(self, domain: str, name: str):
        self.domain = domain
        self.name = name
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Referer": f"https://{domain}/"
        }

    async def _dork_threads(self, query: str) -> List[str]:
        """Find relevant forum threads using DuckDuckGo Dorking."""
        dork_query = f'site:{self.domain} "{query}" Fshare'
        thread_urls = []
        try:
            # Running DDGS in a thread pool to avoid blocking
            def fetch_ddgs():
                with DDGS() as ddgs:
                    return [r.get("href") for r in ddgs.text(dork_query, max_results=5)]
            
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, fetch_ddgs)
            
            for url in results:
                if self.domain in url and any(x in url for x in ["/threads/", "/t/", "/showthread.php"]):
                    thread_urls.append(url)
        except Exception as e:
            print(f"[{self.name}] Dorking Error: {e}")
        return thread_urls

    async def _mine_links(self, thread_url: str) -> List[DownloadableLink]:
        """Visit thread and extract all FShare links (Folders and Files)."""
        links = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self.headers, timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                
                html = resp.text
                # Find all FShare links
                matches = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', html)
                
                # Get page title for context
                soup = BeautifulSoup(html, 'html.parser')
                page_title = soup.title.string.split('|')[0].split('-')[0].strip() if soup.title else "Forum Post"

                for url in list(dict.fromkeys(matches)):
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
        """Full discovery cycle: Dork -> Mine -> Deduplicate."""
        all_found = []
        # Search using both original and localized title if available
        search_queries = [query]
        if tmdb_info and tmdb_info.title and tmdb_info.title != query:
            search_queries.append(tmdb_info.title)

        for q in list(dict.fromkeys(search_queries)):
            thread_urls = await self._dork_threads(q)
            if not thread_urls: continue
            
            # Mine threads in parallel
            tasks = [self._mine_links(url) for url in thread_urls]
            results = await asyncio.gather(*tasks)
            for r_list in results:
                all_found.extend(r_list)
            
            await asyncio.sleep(0.5) # Anti-spam delay
            
        # Deduplicate by URL
        unique_links, seen = [], set()
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        return unique_links
