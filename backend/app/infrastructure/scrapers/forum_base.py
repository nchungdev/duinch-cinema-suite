import asyncio
import re
import urllib.parse
import random
from typing import List, Dict, Any, Optional
from curl_cffi import requests
from bs4 import BeautifulSoup
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
]

class ForumScraperBase:
    def __init__(self, domain: str, name: str):
        self.domain = domain.rstrip('/')
        self.name = name
        self.base_url = f"https://{self.domain}"

    def _get_headers(self, referer: str = "https://duckduckgo.com/"):
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": referer
        }

    async def _dork_duckduckgo(self, query: str) -> List[str]:
        """Dorking via DDG HTML."""
        dork_query = f'site:{self.domain} "{query}" Fshare'
        url = f"https://duckduckgo.com/html/?q={urllib.parse.quote(dork_query)}"
        thread_urls = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(url, headers=self._get_headers(), timeout=15, impersonate="chrome110")
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    for a in soup.select('a.result__a'):
                        href = a.get('href')
                        if href and "uddg=" in href:
                            href = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
                        if self.domain in str(href): thread_urls.append(href)
        except Exception: pass
        return thread_urls

    async def _dork_bing(self, query: str) -> List[str]:
        """Dorking via Bing (Fallback engine)."""
        dork_query = f'site:{self.domain} "{query}" Fshare'
        url = f"https://www.bing.com/search?q={urllib.parse.quote(dork_query)}"
        thread_urls = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(url, headers=self._get_headers("https://www.bing.com/"), timeout=15, impersonate="chrome110")
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    for a in soup.select('li.b_algo h2 a'):
                        href = a.get('href')
                        if href and self.domain in str(href): thread_urls.append(href)
        except Exception: pass
        return thread_urls

    async def _mine_thread(self, thread_url: str) -> List[DownloadableLink]:
        """Deep mine links, focusing on Folders."""
        links = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self._get_headers(self.base_url), timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                
                html = resp.text
                fshare_matches = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', html)
                
                soup = BeautifulSoup(html, 'html.parser')
                page_title = soup.title.string.split('|')[0].split('-')[0].strip() if soup.title else "Forum Post"

                for url in list(dict.fromkeys(fshare_matches)):
                    is_folder = "/folder/" in url
                    links.append(DownloadableLink(
                        name=f"[{'FOLDER' if is_folder else 'FILE'}] {page_title}",
                        url=url,
                        size=0,
                        source=self.name.lower(),
                        is_folder=is_folder,
                        source_page=thread_url
                    ))
        except Exception: pass
        return links

    async def lookup(self, query: str, tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
        all_found = []
        search_terms = [query]
        if tmdb_info and tmdb_info.title and tmdb_info.title != query:
            search_terms.append(tmdb_info.title)

        for q in list(dict.fromkeys(search_terms)):
            # Try DuckDuckGo first
            thread_urls = await self._dork_duckduckgo(q)
            # Fallback to Bing if DDG returns nothing
            if not thread_urls:
                await asyncio.sleep(1)
                thread_urls = await self._dork_bing(q)
            
            if not thread_urls: continue
            
            for url in thread_urls[:3]: # Mine top 3 threads to stay fast
                r_list = await self._mine_thread(url)
                all_found.extend(r_list)
                await asyncio.sleep(random.uniform(0.5, 1.0))
            
        unique_links, seen = [], set()
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        
        # Sort: Folders first
        unique_links.sort(key=lambda x: not x.is_folder)
        return unique_links
