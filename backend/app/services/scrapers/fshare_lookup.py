import httpx
import asyncio
from typing import List, Dict, Tuple, Optional
from app.core import config

FSHARE_BASE = "https://www.fshare.vn/api/v3"
FSHARE_FOLDER_API = f"{FSHARE_BASE}/files/folder"

def parse_fshare_url(url: str) -> Tuple[str, str]:
    """
    Parse FShare URL to extract type and linkcode.
    Returns: ("file"|"folder", linkcode)
    """
    url = url.strip()
    if "?token=" in url:
        url = url.split("?token=")[0]

    if "/file/" in url:
        parts = url.split("/file/")
        if len(parts) > 1:
            linkcode = parts[1].split("/")[0].split("?")[0]
            return ("file", linkcode)
    elif "/folder/" in url:
        parts = url.split("/folder/")
        if len(parts) > 1:
            linkcode = parts[1].split("/")[0].split("?")[0]
            return ("folder", linkcode)

    raise ValueError(f"Invalid FShare URL: {url}")

async def fetch_folder_files(
    linkcode: str,
    client: httpx.AsyncClient,
    depth: int = 0,
    max_depth: int = 2
) -> List[Dict]:
    """
    Fetch all files from FShare folder recursively.
    Returns list of file items.
    """
    if depth > max_depth:
        return []

    items = []
    page = 0
    per_page = 50

    while True:
        try:
            params = {
                "linkcode": linkcode,
                "sort": "type,name",
                "page": page,
                "per-page": per_page
            }

            headers = {
                "User-Agent": config.FSHARE_USER_AGENT or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
            }

            resp = await client.get(
                FSHARE_FOLDER_API,
                params=params,
                headers=headers,
                timeout=10
            )
            resp.raise_for_status()
            data = resp.json()

            # Process current page items
            current_items = data.get("items", [])
            for item in current_items:
                item_type = item.get("type")  # 0=file, 1=folder
                name = item.get("name", "")
                size = item.get("size", 0)
                item_linkcode = item.get("linkcode", "")

                if item_type == 0:  # File
                    items.append({
                        "url": f"https://www.fshare.vn/file/{item_linkcode}",
                        "name": name,
                        "size": size
                    })
                elif item_type == 1 and depth < max_depth:  # Folder, recurse
                    sub_items = await fetch_folder_files(
                        item_linkcode, client, depth + 1, max_depth
                    )
                    items.extend(sub_items)

            # Check if more pages
            total = data.get("total", 0)
            if (page + 1) * per_page >= total:
                break
            page += 1

        except Exception as e:
            # Log error but continue with what we have
            print(f"FShare API error for {linkcode}: {e}")
            break

    return items

async def resolve_fshare_url(url: str, client: httpx.AsyncClient) -> List[Dict]:
    """
    Resolve FShare URL to list of downloadable files.
    Handles both single files and folders.
    """
    try:
        url_type, linkcode = parse_fshare_url(url)

        if url_type == "file":
            # Single file - return as-is
            return [{
                "url": url,
                "name": None,  # Unknown without API call
                "size": None   # Unknown without API call
            }]
        elif url_type == "folder":
            # Folder - fetch all files recursively
            return await fetch_folder_files(linkcode, client)

    except ValueError as e:
        print(f"Error parsing FShare URL {url}: {e}")
        return []

    return []

# For testing
if __name__ == "__main__":
    import asyncio

    async def test():
        async with httpx.AsyncClient() as client:
            # Test folder URL
            folder_url = "https://www.fshare.vn/folder/ABC123"
            files = await resolve_fshare_url(folder_url, client)
            print(f"Found {len(files)} files in folder")
            for f in files[:3]:  # Show first 3
                print(f"  {f}")

            # Test file URL
            file_url = "https://www.fshare.vn/file/DEF456"
            files = await resolve_fshare_url(file_url, client)
            print(f"File URL resolved to: {files}")

    asyncio.run(test())