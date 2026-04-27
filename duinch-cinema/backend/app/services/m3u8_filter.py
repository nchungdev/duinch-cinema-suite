import re
import httpx
import os
from urllib.parse import urljoin

class M3U8AdFilter:
    def __init__(self, base_url: str = ""):
        self.base_url = base_url

    async def get_clean_content(self, m3u8_url: str) -> str:
        """Downloads m3u8, handles Master Playlists, removes ads, and returns clean content."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(m3u8_url, follow_redirects=True)
            content = resp.text

        # 1. Handle Master Playlist
        if "#EXT-X-STREAM-INF" in content:
            # Find the first variant (usually the best or only one)
            lines = content.splitlines()
            variant_url = None
            for i in range(len(lines)):
                if lines[i].startswith("#EXT-X-STREAM-INF"):
                    # The next line is the URL
                    for j in range(i + 1, len(lines)):
                        if lines[j] and not lines[j].startswith("#"):
                            variant_url = lines[j].strip()
                            break
                    if variant_url: break
            
            if variant_url:
                # Resolve full URL for the variant
                full_variant_url = urljoin(m3u8_url, variant_url)
                print(f"[Filter] Detected Master Playlist. Moving to variant: {full_variant_url}")
                # Recursively get the actual media playlist
                return await self.get_clean_content(full_variant_url)

        # 2. Process Media Playlist (The one with .ts segments)
        lines = content.splitlines()
        clean_lines = []
        skip_mode = False
        
        for i in range(len(lines)):
            line = lines[i].strip()
            if not line: continue
            
            if line == "#EXT-X-DISCONTINUITY":
                is_ad = False
                # Check next 5 lines for ad keywords
                for j in range(i+1, min(i+6, len(lines))):
                    if any(key in lines[j].lower() for key in ["adjump", "ads", "promo", "pre-roll"]):
                        is_ad = True
                        break
                if is_ad:
                    skip_mode = True
                    continue
                else:
                    skip_mode = False
            
            if skip_mode and line == "#EXT-X-DISCONTINUITY":
                skip_mode = False
                continue

            if not skip_mode:
                # Convert relative TS URLs to absolute for FFmpeg
                if not line.startswith("#") and not line.startswith("http"):
                    line = urljoin(m3u8_url, line)
                clean_lines.append(line)

        return "\n".join(clean_lines)
