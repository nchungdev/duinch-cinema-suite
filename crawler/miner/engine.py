import asyncio
import re
import json
import httpx
from typing import List, Dict, Any, Optional
from .scrapers.forums import TimFShareForumScraper, VozScraper
from .database import db
from . import config

class CrawlerEngine:
    def __init__(self):
        self.tf_forum = TimFShareForumScraper()
        self.voz_forum = VozScraper()
        self.targets = [
            (self.tf_forum, "https://forum.timfshare.com/forums/hd.8/"),
            (self.tf_forum, "https://forum.timfshare.com/forums/phim-anh.3/"),
            (self.voz_forum, "https://voz.vn/f/phim-nhac-sach.31/")
        ]

    async def run(self, pages=1):
        print(f"[*] Starting Data Miner (Forum ➔ RAW)...")
        db.reset_status("miner")
        db.update_status("miner", "running", progress="0%", current_item="Starting...")
        
        total_targets = len(self.targets)
        for i, (scraper, node_url) in enumerate(self.targets):
            for page in range(1, pages + 1):
                prog = f"{int((i / total_targets) * 100)}%"
                db.update_status("miner", "running", progress=prog, current_item=f"Crawling {scraper.name} page {page}")
                
                threads = await scraper._list_threads(node_url, page=page)
                if not threads: break
                
                for t in threads:
                    # CACHE CHECK: Only click into thread if not fresh in DB
                    if db.is_thread_fresh(t['url'], config.RAW_THREAD_TTL):
                        # print(f"    [SKIP] Thread already fresh: {t['title']}")
                        continue
                    
                    db.update_status("miner", "running", current_item=f"Mining: {t['title'][:40]}...")
                    raw_urls = await scraper._mine_thread(t['url'])
                    if raw_urls:
                        db.save_raw_thread(t['url'], t['title'], scraper.name, node_url, raw_urls)
                        db.update_status("miner", "running", success_inc=1)
                        print(f"    [RAW] Scraped: {t['title']} ({len(raw_urls)} links)")
                        await asyncio.sleep(0.5)
                    else:
                        # Save thread anyway but with empty links so we don't retry immediately
                        # Only wait a bit
                        db.save_raw_thread(t['url'], t['title'], scraper.name, node_url, [])
                        await asyncio.sleep(0.2)
            await asyncio.sleep(2.0)
        
        db.update_status("miner", "idle", progress="100%", current_item="Done.")

crawler = CrawlerEngine()
