import asyncio
import re
import urllib.parse
import random
from typing import List, Dict, Any, Optional, Set
from curl_cffi import requests
from bs4 import BeautifulSoup
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo
from app.core.text_utils import normalize_text, get_tokens, check_identity_leakage

def normalize_for_match(text: str) -> str:
    """Old normalization logic for backward compatibility in regex checks."""
    if not text: return ""
    t = text.lower().replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', ' ', ascii_str).strip()

import unicodedata

class ForumScraperBase:
    def __init__(self, name: str, base_url: str):
        self.name = name
        self.base_url = base_url
        self.proxies = [
            "http://proxy.example.com:8080",
        ]

    async def api_call(self, url: str, params: Dict = None) -> str:
        try:
            resp = await asyncio.to_thread(
                requests.get, 
                url, 
                params=params, 
                timeout=15,
                impersonate="chrome"
            )
            if resp.status_code == 200: return resp.text
        except Exception: pass
        return ""

    async def lookup(self, query: str, tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
        """
        Giai đoạn 1: Tìm kiếm thread liên quan
        Giai đoạn 2: Trích xuất link từ các thread đó
        """
        search_terms = [query]
        if tmdb_info and tmdb_info.title and tmdb_info.title.lower() != query.lower():
            search_terms.append(tmdb_info.title)
            
        all_found = []
        seen = set()
        
        for term in search_terms:
            threads = await self._search_threads(term)
            # Giới hạn lấy 5 thread đầu tiên để tránh spam
            for t in threads[:5]:
                # --- STRICT FILTERING ---
                norm_thread_title = normalize_text(t['title'])
                
                # A. Identity Match
                # Check if query is actually in thread title
                q_tokens = get_tokens(term)
                t_tokens = get_tokens(t['title'])
                if not q_tokens.issubset(t_tokens):
                    continue
                
                # B. Identity Leakage Guard (General)
                if check_identity_leakage(t['title'], term, ignore_year=tmdb_info.series_year if tmdb_info else 0):
                    continue
                
                # C. Year Guard (if thread has year)
                if tmdb_info and tmdb_info.series_year > 0:
                    found_years = re.findall(r'\b(20\d{2}|19\d{2})\b', t['title'])
                    if found_years:
                        if not any(abs(int(fy) - tmdb_info.series_year) <= 1 for fy in found_years):
                            continue

                # Mine validated thread
                r_list = await self._mine_thread(t['url'], t['title'])
                all_found.extend(r_list)

        unique_links = []
        for link in all_found:
            if link.url not in seen:
                unique_links.append(link)
                seen.add(link.url)
        
        unique_links.sort(key=lambda x: not x.is_folder)
        return unique_links

    async def _search_threads(self, query: str) -> List[Dict[str, str]]:
        """Phải được ghi đè bởi subclass"""
        return []

    async def _mine_thread(self, url: str, title: str) -> List[DownloadableLink]:
        """Phải được ghi đè bởi subclass"""
        return []
