import re
import urllib.parse
import random
from typing import List, Dict, Any, Optional
from curl_cffi import requests
from bs4 import BeautifulSoup

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

    async def _list_threads(self, node_url: str, page: int = 1) -> List[Dict[str, str]]:
        url = node_url
        if page > 1:
            url = f"{node_url.rstrip('/')}/page-{page}"
            
        thread_data = []
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(url, headers=self._get_headers(), timeout=20, impersonate="chrome110")
                if resp.status_code != 200: return []
                soup = BeautifulSoup(resp.text, 'html.parser')
                items = soup.select('.structItem-title') or soup.select('h3.contentRow-title')
                for item in items:
                    a = item.find('a', href=re.compile(r'/threads/'))
                    if a:
                        thread_data.append({
                            "url": urllib.parse.urljoin(self.base_url, a.get('href').split('?')[0]),
                            "title": a.get_text().strip()
                        })
        except Exception: pass
        return thread_data

    async def _mine_thread(self, thread_url: str) -> List[str]:
        """Simply returns a list of FShare URLs found in thread."""
        try:
            async with requests.AsyncSession() as session:
                resp = await session.get(thread_url, headers=self._get_headers(), timeout=15, impersonate="chrome110")
                if resp.status_code != 200: return []
                matches = re.findall(r'https?://(?:www\.)?fshare\.vn/(?:file|folder)/[a-zA-Z0-9]+', resp.text)
                return list(dict.fromkeys(matches))
        except Exception: return []

# Implementation for forums
class TimFShareForumScraper(ForumScraperBase):
    def __init__(self): super().__init__("forum.timfshare.com", "TF-Forum")

class HDVietnamScraper(ForumScraperBase):
    def __init__(self): super().__init__("www.hdvietnam.ai", "HDVN")

class VozScraper(ForumScraperBase):
    def __init__(self): super().__init__("voz.vn", "Voz")
