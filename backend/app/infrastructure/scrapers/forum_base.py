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
            "Referer": self.base_url,
            "Origin": self.base_url
        }

    async def _native_search(self, query: str) -> List[str]:
        """Perform direct search on XenForo forum and return thread URLs."""
        search_url = f"{self.base_url}/search/search"
        payload = {
            "keywords": query,
            "c[users]": "",
            "c[nodes][]": "",
            "c[child_nodes]": "1",
            "o": "date",
            "_xfToken": "" # XenForo guest token is usually empty
        }
        
        thread_urls = []
        try:
            async with requests.AsyncSession() as session:
                # 1. Post search request
                resp = await session.post(search_url, data=payload, headers=self.headers, timeout=15, impersonate="chrome110")
                
                # XenForo redirects to /search/12345/
                results_url = str(resp.url)
                if "search/" not in results_url: return []
                
                # 2. Parse results page
                soup = BeautifulSoup(resp.text, 'html.parser')
                # XenForo 2 thread links usually have data-tp-primary="on" or class="contentRow-title"
                for a in soup.select('h3.contentRow-title a[href*="/threads/"]'):
                    href = a.get('href')
                    if href:
                        full_url = urllib.parse.urljoin(self.base_url, href)
                        thread_urls.append(full_url)
                
                # Dedup
                thread_urls = list(dict.fromkeys(thread_urls))
                print(f"[{self.name}] Native search found {len(thread_urls)} threads for '{query}'")
        except Exception as e:
            print(f"[{self.name}] Native Search Error: {e}")
            
        return thread_urls[:5] # Only take top 5 relevant threads

    async def _mine_links(self, thread_url: str) -> List[DownloadableLink]:
        """Visit thread and extract all FShare links."""
        links = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self.headers, timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                
                html = resp.text
                # Find FShare links (Files and Folders)
                fshare_regex = r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+'
                found = re.findall(fshare_regex, html)
                
                soup = BeautifulSoup(html, 'html.parser')
                page_title = soup.title.string.split('|')[0].split('-')[0].strip() if soup.title else "Forum Post"

                for url in list(dict.fromkeys(found)):
                    is_folder = "/folder/" in url
                    links.append(DownloadableLink(
                        name=f"[{self.name}] {page_title}",
                        url=url,
                        size=0, # Size unknown from forum post
                        source=self.name.lower(),
                        is_folder=is_folder,
                        source_page=thread_url
                    ))
        except Exception as e:
            print(f"[{self.name}] Mining Error {thread_url}: {e}")
        return links

    async def lookup(self, query: str, tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
        """Direct Forum Discovery Cycle."""
        all_found = []
        # Combine titles
        search_terms = [query]
        if tmdb_info and tmdb_info.title and tmdb_info.title != query:
            search_terms.append(tmdb_info.title)

        for q in list(dict.fromkeys(search_terms)):
            thread_urls = await self._native_search(q)
            if not thread_urls: continue
            
            tasks = [self._mine_links(url) for url in thread_urls]
            results = await asyncio.gather(*tasks)
            for r_list in results:
                all_found.extend(r_list)
            
            await asyncio.sleep(0.5)
            
        # Deduplicate
        unique_links, seen = [], set()
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        return unique_links
