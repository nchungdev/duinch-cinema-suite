import re
import httpx
import os

class M3U8AdFilter:
    def __init__(self, base_url: str = ""):
        self.base_url = base_url

    async def get_clean_content(self, m3u8_url: str) -> str:
        """Downloads m3u8, removes ad segments, and returns the cleaned content."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(m3u8_url, follow_redirects=True)
            content = resp.text

        lines = content.splitlines()
        clean_lines = []
        skip_mode = False
        
        # Resolve parent URL for relative segments
        parent_url = "/".join(m3u8_url.split("/")[:-1])

        for i in range(len(lines)):
            line = lines[i].strip()
            if not line: continue
            
            if line == "#EXT-X-DISCONTINUITY":
                is_ad = False
                for j in range(i+1, min(i+5, len(lines))):
                    if "adjump" in lines[j] or "ads" in lines[j]:
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
                # Convert relative URLs to absolute for FFmpeg
                if not line.startswith("#") and not line.startswith("http"):
                    line = f"{parent_url}/{line}"
                clean_lines.append(line)

        return "\n".join(clean_lines)
