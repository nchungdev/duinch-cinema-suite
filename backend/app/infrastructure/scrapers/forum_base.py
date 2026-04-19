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
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
]

class ForumScraperBase:
    def __init__(self, domain: str, name: str):
        self.domain = domain.rstrip('/')
        self.name = name
        self.base_url = f"https://{self.domain}"

    def _get_headers(self, referer: str = None):
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": referer or self.base_url,
            "Origin": self.base_url
        }

    async def _fetch_token_and_cookie(self, session: requests.AsyncSession) -> Optional[str]:
        """Visit search page to get session cookies and _xfToken."""
        search_init_url = f"{self.base_url}/search/"
        try:
            resp = await session.get(search_init_url, headers=self._get_headers(), timeout=15, impersonate="chrome110")
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                # Extract _xfToken from input or data attribute
                token_input = soup.find('input', {'name': '_xfToken'})
                token = token_input.get('value') if token_input else None
                if not token:
                    # Fallback: look in script tags or data-csrf
                    match = re.search(r'csrf":\s*"([^"]+)"', resp.text)
                    if match: token = match.group(1)
                return token
        except Exception as e:
            print(f"[{self.name}] Token Fetch Error: {e}")
        return None

    async def _native_search(self, query: str) -> List[str]:
        """Perform direct search with dynamic token bypass."""
        search_url = f"{self.base_url}/search/search"
        thread_urls = []
        
        try:
            async with requests.AsyncSession() as session:
                # 1. Get Token and establish Session
                token = await self._fetch_token_and_cookie(session)
                if not token:
                    # If forum requires login for search, token might be missing
                    # Some XenForo forums use a default guest token like '12345678,abcdef...'
                    token = "" 

                # 2. Post search request with Token
                payload = {
                    "keywords": query,
                    "c[users]": "",
                    "c[nodes][]": "",
                    "c[child_nodes]": "1",
                    "o": "date",
                    "_xfToken": token
                }
                
                resp = await session.post(search_url, data=payload, headers=self._get_headers(), timeout=20, impersonate="chrome110")
                
                # Check for redirect to results
                final_url = str(resp.url)
                if "search/" not in final_url:
                    print(f"[{self.name}] Search failed or restricted for '{query}'. URL: {final_url}")
                    return []
                
                # 3. Parse search results
                soup = BeautifulSoup(resp.text, 'html.parser')
                links = soup.select('h3.contentRow-title a[href*="/threads/"]') or \
                        soup.select('a[href*="/threads/"][data-tp-primary]') or \
                        soup.select('.structItem-title a[href*="/threads/"]')
                
                for a in links:
                    href = a.get('href')
                    if href:
                        # Clean up URL (remove page suffix if any)
                        clean_href = href.split('?')[0].split('#')[0]
                        full_url = urllib.parse.urljoin(self.base_url, clean_href)
                        thread_urls.append(full_url)
                
                print(f"[{self.name}] Native search found {len(thread_urls)} threads for '{query}'")
        except Exception as e:
            print(f"[{self.name}] Native Search Error: {e}")
            
        return list(dict.fromkeys(thread_urls))[:5]

    async def _mine_thread(self, thread_url: str) -> List[DownloadableLink]:
        """Mine FShare links from thread content."""
        links = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self._get_headers(), timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                
                html = resp.text
                # Find both folder and file links
                matches = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', html)
                
                soup = BeautifulSoup(html, 'html.parser')
                # Improved title extraction: split common suffixes
                page_title = soup.title.string if soup.title else "Forum Post"
                for sep in ['|', '-', '—']:
                    page_title = page_title.split(sep)[0]
                page_title = page_title.strip()

                for url in list(dict.fromkeys(matches)):
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
        """Discovery Lifecycle with Token Bypass."""
        all_found = []
        search_terms = [query]
        if tmdb_info and tmdb_info.title and tmdb_info.title != query:
            search_terms.append(tmdb_info.title)

        for q in list(dict.fromkeys(search_terms)):
            thread_urls = await self._native_search(q)
            if not thread_urls: continue
            
            for url in thread_urls:
                r_list = await self._mine_thread(url)
                all_found.extend(r_list)
                await asyncio.sleep(random.uniform(0.5, 1.0))
            
        # Prioritize Folders and Deduplicate
        unique_links, seen = [], set()
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        
        unique_links.sort(key=lambda x: not x.is_folder)
        return unique_links
