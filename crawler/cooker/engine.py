import asyncio
import re
import json
import httpx
from typing import List, Dict, Any, Optional
from .database import db
from . import config

class ProcessorEngine:
    async def expand_fshare_folder(self, client: httpx.AsyncClient, folder_url: str) -> List[Dict[str, str]]:
        files = []
        try:
            # Mask as browser to avoid basic blocks
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            resp = await client.get(folder_url, headers=headers, follow_redirects=True)
            if resp.status_code == 200:
                # Fshare often embeds file info in JS: var list_file = [...]
                # Or sometimes just direct links for public folders.
                # Standard regex for Fshare file links in their internal JSON strings
                matches = re.findall(r'"name":"([^"]+)","link":"([^"]+)"', resp.text)
                for name, link in matches:
                    decoded_link = link.replace('\\/', '/')
                    if any(name.lower().endswith(ext) for ext in ['.mkv', '.mp4', '.avi', '.m4v', '.ts']):
                        files.append({"name": name, "link": decoded_link})
                
                if not files:
                    # Fallback to BeautifulSoup logic if JS regex fails
                    try:
                        from bs4 import BeautifulSoup
                        soup = BeautifulSoup(resp.text, 'html.parser')
                        # Look for row-like structures or <a> tags with file links
                        for link_tag in soup.select('a[href*="/file/"]'):
                            href = link_tag.get('href')
                            name = link_tag.get_text() or link_tag.get('title')
                            if href and name and any(name.lower().endswith(ext) for ext in ['.mkv', '.mp4', '.avi', '.ts']):
                                files.append({"name": name.strip(), "link": href})
                    except ImportError: pass
        except Exception as e:
            print(f"      [!] Folder Expansion Error ({folder_url}): {e}")
        return files

    async def process_item(self, client: httpx.AsyncClient, url: str, display_title: str, thread_meta: Dict[str, Any]):
        clean_name = self._clean_title(display_title)
        if len(clean_name) < 2: return False
        
        try:
            search_res = await self.fetch_tmdb_search(client, clean_name)
            if search_res and search_res.get("results"):
                best = search_res["results"][0]
                media_type = best.get("media_type", "movie")
                if media_type not in ["movie", "tv"]: return False
                
                tmdb_id = str(best["id"])
                tmdb_title = best.get("title") or best.get("name")
                
                quality = "Unknown"
                q_match = re.search(r'(?i)\b(1080p|720p|2160p|4k|remux)\b', display_title)
                if q_match: quality = q_match.group(1).upper()
                
                db.save_cooked_link(
                    url=url, tmdb_id=tmdb_id, media_type=media_type, title=tmdb_title,
                    quality=quality, is_folder=("/folder/" in url), source=thread_meta['source'],
                    source_page=thread_meta['thread_url']
                )
                print(f"      [✓] Mapped: '{display_title}' ➔ {tmdb_title} (TMDB:{tmdb_id})")
                return True
            return False
        except Exception as e:
            print(f"      [!] Processing Error: {e}")
            return False

    async def run(self, limit=100):
        print(f"[*] Starting Data Processor (RAW ➔ COOKED)...")
        db.reset_status("cooker")
        db.update_status("cooker", "running", progress="0%", current_item="Fetching RAW threads...")
        
        pending = db.get_pending_raw_threads(limit=limit)
        total = len(pending)
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            for i, thread in enumerate(pending):
                prog = f"{int((i / total) * 100)}%" if total > 0 else "100%"
                db.update_status("cooker", "running", progress=prog, current_item=f"Analyzing {thread['title']}")
                
                urls = json.loads(thread['raw_links'])
                for url in urls:
                    if "/folder/" in url:
                        print(f"    - Expanding Folder: {url}")
                        child_files = await self.expand_fshare_folder(client, url)
                        if child_files:
                            print(f"      [+] Found {len(child_files)} items in folder.")
                            for f in child_files:
                                # Process each file separately with its own filename!
                                await self.process_item(client, f['link'], f['name'], thread)
                        else:
                            # If expansion fails, fallback to processing the folder as one item using thread title
                            await self.process_item(client, url, thread['title'], thread)
                    else:
                        # Direct file: logic remains the same
                        await self.process_item(client, url, thread['title'], thread)
                
                db.update_status("cooker", "running", success_inc=1)
                await asyncio.sleep(0.5)
        
        db.update_status("cooker", "idle", progress="100%", current_item="Done.")

processor = ProcessorEngine()
