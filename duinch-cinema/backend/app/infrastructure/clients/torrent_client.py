import httpx
import re
from typing import List, Dict, Any, Optional
import urllib.parse

class TorrentClient:
    async def search_solid(self, q: str) -> List[Dict[str, Any]]:
        try:
            url = f"https://solidtorrents.net/api/v1/search?q={urllib.parse.quote(q)}&category=all&sort=seeders"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json().get("results", [])
        except Exception: pass
        return []

    async def search_apibay(self, q: str) -> List[Dict[str, Any]]:
        try:
            url = f"https://apibay.org/q.php?q={urllib.parse.quote(q)}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data and isinstance(data, list) and data[0].get("id") != "0":
                        return data[:15]
        except Exception: pass
        return []

    async def get_files(self, magnet: str) -> List[Dict[str, Any]]:
        """List files inside a torrent via magnet link.
        Strategy: extract info_hash + dn → search apibay by name → match hash → /f.php?id=
        """
        try:
            # 1. Extract info_hash and display name from magnet
            hash_match = re.search(r'urn:btih:([a-fA-F0-9]{40})', magnet)
            if not hash_match:
                return []
            info_hash = hash_match.group(1).upper()

            dn_match = re.search(r'[&?]dn=([^&]+)', magnet)
            dn = urllib.parse.unquote_plus(dn_match.group(1)) if dn_match else ""

            async with httpx.AsyncClient(timeout=15.0) as client:
                # 2. Search apibay by name (shorter query works better)
                query = " ".join(dn.split()[:6]) if dn else info_hash
                resp = await client.get(f"https://apibay.org/q.php?q={urllib.parse.quote(query)}")
                if resp.status_code != 200:
                    return []

                results = resp.json()
                if not results or results[0].get("id") == "0":
                    return []

                # 3. Match by info_hash
                torrent_id = None
                for item in results:
                    if item.get("info_hash", "").upper() == info_hash:
                        torrent_id = item.get("id")
                        break

                # Fallback: use first result if name matches well enough
                if not torrent_id and results:
                    torrent_id = results[0].get("id")

                if not torrent_id:
                    return []

                # 4. Fetch file list
                resp2 = await client.get(f"https://apibay.org/f.php?id={torrent_id}")
                if resp2.status_code != 200:
                    return []

                files = resp2.json()
                results_out = []
                for f in files:
                    names = f.get("name", [])
                    sizes = f.get("size", [])
                    name = names[0] if names else "Unknown"
                    size = int(sizes[0]) if sizes else 0
                    if name and name != "Filelist not found":
                        results_out.append({
                            "name": name,
                            "url": None,       # torrent files không có direct URL
                            "is_folder": False,
                            "size": size,
                            "magnet": magnet,  # parent magnet để download cả torrent
                        })
                return results_out

        except Exception as e:
            print(f"[TorrentClient] get_files error: {e}")
            return []

# Singleton
torrent_client = TorrentClient()
