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

def normalize_for_match(text: str) -> str:
    if not text: return ""
    t = ''.join(c for c in unicodedata.normalize('NFD', str(text)) if unicodedata.category(c) != 'Mn')
    t = t.replace('đ', 'd').replace('Đ', 'D')
    t = re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()
    return t

import unicodedata

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
        search_init_url = f"{self.base_url}/search/"
        try:
            resp = await session.get(search_init_url, headers=self._get_headers(), timeout=15, impersonate="chrome110")
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                token_input = soup.find('input', {'name': '_xfToken'})
                token = token_input.get('value') if token_input else None
                if not token:
                    match = re.search(r'csrf":\s*"([^"]+)"', resp.text)
                    if match: token = match.group(1)
                return token
        except Exception: pass
        return None

    async def _list_threads(self, node_url: str, page: int = 1) -> List[Dict[str, str]]:
        """List threads from a specific forum node/category."""
        url = node_url
        if page > 1:
            url = f"{node_url.rstrip('/')}/page-{page}"
            
        thread_data = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(url, headers=self._get_headers(), timeout=20, impersonate="chrome110")
                if resp.status_code != 200: 
                    print(f"[!] {self.name} list failed: Status {resp.status_code}")
                    return []
                
                soup = BeautifulSoup(resp.text, 'html.parser')
                # XenForo 2 patterns for thread list
                items = soup.select('.structItem-title')
                if not items:
                    # Fallback for older themes or different structures
                    items = soup.select('h3.contentRow-title')
                
                print(f"[*] {self.name} found {len(items)} items on page {page}")
                
                for item in items:
                    a = item.find('a', href=re.compile(r'/threads/'))
                    if a:
                        href = a.get('href')
                        title = a.get_text().strip()
                        # Ignore sticky threads if needed, but for now take all
                        full_url = urllib.parse.urljoin(self.base_url, href.split('?')[0])
                        thread_data.append({"url": full_url, "title": title})
        except Exception: pass
        return thread_data

    async def _native_search(self, query: str) -> List[Dict[str, str]]:
        """Perform direct search and return list of thread info (url and title)."""
        search_url = f"{self.base_url}/search/search"
        thread_data = []
        
        try:
            async with requests.AsyncSession() as session:
                token = await self._fetch_token_and_cookie(session)
                payload = {
                    "keywords": query, "c[users]": "", "c[nodes][]": "", 
                    "c[child_nodes]": "1", "o": "date", "_xfToken": token or ""
                }
                resp = await session.post(search_url, data=payload, headers=self._get_headers(), timeout=20, impersonate="chrome110")
                
                if "search/" not in str(resp.url): return []
                
                soup = BeautifulSoup(resp.text, 'html.parser')
                # XenForo 2 patterns
                items = soup.select('h3.contentRow-title') or soup.select('.structItem-title')
                
                for item in items:
                    a = item.find('a', href=re.compile(r'/threads/'))
                    if a:
                        href = a.get('href')
                        title = a.get_text().strip()
                        full_url = urllib.parse.urljoin(self.base_url, href.split('?')[0])
                        thread_data.append({"url": full_url, "title": title})
        except Exception: pass
        return thread_data

    async def _mine_thread(self, thread_url: str, thread_title: str) -> List[DownloadableLink]:
        """Mine FShare links from thread, using thread title for validation."""
        links = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self._get_headers(), timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                
                # Regex for FShare links
                matches = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', resp.text)
                
                # Clean up title for display
                display_title = thread_title
                for sep in ['|', '-', '—']: display_title = display_title.split(sep)[0]
                display_title = display_title.strip()

                for url in list(dict.fromkeys(matches)):
                    is_folder = "/folder/" in url
                    links.append(DownloadableLink(
                        name=f"[{self.name}] {display_title}",
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
        
        # 1. Identity Guard Prep
        target_title = tmdb_info.title if tmdb_info and tmdb_info.title else query
        norm_target = normalize_for_match(target_title)
        search_terms = list(dict.fromkeys([str(q) for q in [target_title, query] if q and str(q).lower() != 'none']))

        for q in search_terms:
            threads = await self._native_search(q)
            if not threads: continue
            
            for t in threads[:5]:
                # --- STRICT FILTERING ---
                norm_thread_title = normalize_for_match(t['title'])
                
                # A. Identity Match (Word Boundary)
                is_match = False
                for st in search_terms:
                    norm_st = normalize_for_match(st)
                    if re.search(rf'\b{re.escape(norm_st)}\b', norm_thread_title):
                        is_match = True; break
                if not is_match: continue
                
                # B. Franchise Exclusion (Naruto vs Shippuden)
                if re.search(r'shippu?den', norm_thread_title) and "shippuden" not in norm_target: continue
                if "boruto" in norm_thread_title and "boruto" not in norm_target: continue
                
                # C. Year Guard (if thread has year)
                if tmdb_info and tmdb_info.series_year > 0:
                    found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', t['title'])
                    if found_years:
                        if not any(abs(int(fy) - tmdb_info.series_year) <= 1 for fy in found_years):
                            continue

                # Mine validated thread
                r_list = await self._mine_thread(t['url'], t['title'])
                all_found.extend(r_list)
                await asyncio.sleep(random.uniform(0.3, 0.7))
            
        unique_links, seen = [], set()
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        
        unique_links.sort(key=lambda x: not x.is_folder)
        return unique_links
