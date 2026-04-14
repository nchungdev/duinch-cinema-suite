from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import httpx
import os
import json
import myjdapi
import re
from typing import Optional, List
from duckduckgo_search import DDGS
import time
from app.scripts.thuviencine_lookup import lookup_thuviencine
from app.scripts.google_search_lookup import lookup_google_fshare

# --- Configuration ---
STORAGE_PATH = os.getenv("STORAGE_PATH", "/storage")
# Path inside JD container (standardized to /downloads)
JD_INTERNAL_PATH = os.getenv("JD_INTERNAL_PATH", "/downloads")
MYJD_EMAIL = os.getenv("MYJD_EMAIL")
MYJD_PASSWORD = os.getenv("MYJD_PASSWORD")
TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")
METADATA_CACHE_EXPIRE = 24 * 3600 # 24 hours
DISCOVERY_CACHE_EXPIRE = 3600     # 1 hour
TMDB_CACHE = "tmdb_cache.json"
KKPHIM_CACHE = "kkphim_cache.json"

# Global Cache/State
jd = myjdapi.Myjdapi()
jd.set_app_key("OMV_JD_Dashboard_Ultra")
http_client: Optional[httpx.AsyncClient] = None
jd_device = None

# --- Cache Helpers ---
def load_cache(filename):
    if not os.path.exists(filename):
        return {}
    try:
        with open(filename, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_cache(filename, cache):
    try:
        with open(filename, "w") as f:
            json.dump(cache, f, ensure_ascii=False)
    except Exception:
        pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=10)
    yield
    await http_client.aclose()

app = FastAPI(title="OMV JDownloader Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_jd_device():
    global jd_device
    if not jd.is_connected():
        if not MYJD_EMAIL or not MYJD_PASSWORD:
            raise HTTPException(status_code=500, detail="MyJD credentials not set")
        jd.connect(MYJD_EMAIL, MYJD_PASSWORD)
    
    if not jd_device:
        jd.update_devices()
        devices = jd.list_devices()
        if devices:
            # Prefer device named 'JDownloader' or take the first one
            target = next((d for d in devices if "JDownloader" in d["name"]), devices[0])
            jd_device = jd.get_device(target["name"])
    return jd_device

async def fetch_tmdb_metadata(query: str, media_type: str = "movie"):
    if not TMDB_READ_ACCESS_TOKEN:
        return []
    
    # Normalize Query
    query_norm = query.strip().lower()
    
    # Check Cache
    cache = load_cache(TMDB_CACHE)
    cache_key = f"{media_type}_{query_norm}"
    if cache_key in cache:
        entry = cache[cache_key]
        if time.time() - entry["timestamp"] < METADATA_CACHE_EXPIRE:
            return entry["data"]

    url = f"https://api.themoviedb.org/3/search/multi?query={query}&include_adult=false&language=vi-VN&page=1"
    headers = {"Authorization": f"Bearer {TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
    try:
        resp = await http_client.get(url, headers=headers)
        raw_results = resp.json().get("results", [])
        results = []
        for item in raw_results:
            item_type = item.get("media_type")
            # If all is requested, allow both movie and tv. Otherwise filter by type.
            if media_type == "all":
                if item_type not in ["movie", "tv"]:
                    continue
            elif item_type != media_type:
                continue
                
            results.append({
                "title": item.get("title") or item.get("name"),
                "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                "tmdb_id": item.get("id"),
                "overview": item.get("overview"),
                "media_type": item_type,
                "poster": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get('poster_path') else None,
                "source": "tmdb"
            })
        
        # Save to Cache
        if results:
            cache[cache_key] = {"timestamp": time.time(), "data": results}
            save_cache(TMDB_CACHE, cache)
        return results
    except Exception:
        pass
    return []

async def fetch_kkphim_search(query: str, media_type: str = "movie"):
    # Normalize Query
    query_norm = query.strip().lower()
    
    # Check Cache
    cache = load_cache(KKPHIM_CACHE)
    cache_key = f"search_{media_type}_{query_norm}"
    if cache_key in cache:
        entry = cache[cache_key]
        if time.time() - entry["timestamp"] < METADATA_CACHE_EXPIRE:
            return entry["data"]

    try:
        resp = await http_client.get(f"https://phimapi.com/v1/api/tim-kiem?keyword={query}&limit=10")
        items = resp.json().get("data", {}).get("items", [])
        
        results = []
        for item in items:
            img_prefix = "https://phimimg.com/" if not item.get("poster_url", "").startswith("http") else ""
            results.append({
                "title": item.get("name"),
                "origin_name": item.get("origin_name"),
                "slug": item.get("slug"),
                "poster": img_prefix + item.get("poster_url") if item.get("poster_url") else None,
                "year": item.get("year"),
                "media_type": media_type, # Use the requested media type as a hint
                "source": "kkphim"
            })

        # Save to Cache
        cache[cache_key] = {"timestamp": time.time(), "data": results}
        save_cache(KKPHIM_CACHE, cache)
        return results
    except Exception:
        return []

async def fetch_kkphim_links(slug: str):
    # Check Cache
    cache = load_cache(KKPHIM_CACHE)
    cache_key = f"links_{slug}"
    if cache_key in cache:
        entry = cache[cache_key]
        if time.time() - entry["timestamp"] < METADATA_CACHE_EXPIRE:
            return entry["data"]

    try:
        resp = await http_client.get(f"https://phimapi.com/phim/{slug}")
        data = resp.json()
        if data.get("status"):
            links = [{"name": ep["name"], "m3u8": ep["link_m3u8"]} for s in data["episodes"] for ep in s["server_data"]]
            
            # Save to Cache
            cache[cache_key] = {"timestamp": time.time(), "data": links}
            save_cache(KKPHIM_CACHE, cache)
            return links
    except Exception:
        pass
    return []

async def fetch_google_links(query: str):
    fshare_links = []
    web_links = []
    try:
        with DDGS() as ddgs:
            results = ddgs.text(f"{query} fshare", max_results=8)
            for r in results:
                if "fshare.vn" in r["href"]:
                    fshare_links.append({"name": "Fshare", "url": r["href"], "title": r["title"]})
            
            results_extra = ddgs.text(f"{query} phim moi m3u8", max_results=5)
            for r in results_extra:
                if "http" in r["href"] and "fshare.vn" not in r["href"] and "google" not in r["href"]:
                    web_links.append({"name": "Web", "url": r["href"], "title": r["title"]})
    except Exception:
        pass
    return {"fshare": fshare_links, "web": web_links}

def find_existing_path(title: str, media_type: str):
    """
    Quét thư mục cục bộ để tìm đường dẫn hiện có của phim/show.
    """
    if not title or not title.strip():
        return None
    
    base = os.path.join(STORAGE_PATH, "Movies" if media_type == "movie" else "TV Shows")
    if not os.path.exists(base):
        return None
    
    title_clean = title.lower().strip()
    if not title_clean:
        return None
    
    for root, dirs, files in os.walk(base):
        # Kiểm tra thư mục (Ưu tiên TV Shows hoặc Movie folders)
        for d in dirs:
            # Exact match or bracketed match to avoid partial hits like "index" matching "indextools"
            if title_clean == d.lower().strip() or f"({title_clean})" in d.lower(): 
                return os.path.join(root, d)
        # Kiểm tra file (Dành cho Movies để trực tiếp trong Movies/ hoặc Collection/)
        for f in files:
            if title_clean in f.lower():
                return root
    return None

def check_local_storage_sync(title: str, media_type: str):
    path = find_existing_path(title, media_type)
    if path:
        return {"exists": True, "path": path}
    return {"exists": False}

@app.get("/proxy-download")
async def proxy_download(url: str):
    """
    Proxy a URL and force download by adding Content-Disposition header.
    """
    try:
        # Standardize filename from URL
        filename = url.split("/")[-1].split("?")[0] or "download"
        if "." not in filename:
            filename += ".bin"
        
        # Stream the response from remote
        # Note: We use a larger timeout for potentially large files
        async def stream_content():
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", url, follow_redirects=True) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk

        return StreamingResponse(
            stream_content(),
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Endpoints ---
@app.get("/search/{query}")
async def fast_search(query: str, media_type: str = "all"):
    """
    Search both TMDB and KKPhim, then combine results with Slug Bridging.
    Defaults to 'all' to find both Movies and TV Shows.
    """
    # Simultaneous search
    tmdb_task = fetch_tmdb_metadata(query, media_type)
    # KKPhim search is always 'all' by nature of its endpoint
    kk_task = fetch_kkphim_search(query, media_type)
    
    meta_results, kk_results = await asyncio.gather(tmdb_task, kk_task)
    
    # Create KKPhim mapping (title -> slug) for bridging
    kk_map = {item["title"].lower().strip(): item["slug"] for item in kk_results}
    
    # Combined results
    combined = []
    seen = set()
    
    # Process TMDB results with Bridging
    for item in meta_results:
        clean_title = item["title"].lower().strip()
        # Bridge: Attach KKPhim slug if a title match is found
        if clean_title in kk_map:
            item["slug"] = kk_map[clean_title]
            
        combined.append(item)
        seen.add(clean_title)
        
    # Add unique KKPhim results
    for item in kk_results:
        clean_title = item["title"].lower().strip()
        if clean_title not in seen:
            combined.append(item)
            seen.add(clean_title)

    if not combined:
        return {"error": "No results found"}
        
    return {"results": combined, "type": "list"}

@app.get("/discovery")
async def discovery_list(category: str = "new", page: int = 1):
    # Check Cache
    cache = load_cache(KKPHIM_CACHE)
    cache_key = f"discovery_{category}_{page}"
    if cache_key in cache:
        entry = cache[cache_key]
        if time.time() - entry["timestamp"] < DISCOVERY_CACHE_EXPIRE:
            return entry["data"]

    try:
        if category == "new":
            url = f"https://phimapi.com/danh-sach/phim-moi-cap-nhat?page={page}"
        else:
            url = f"https://phimapi.com/v1/api/danh-sach/{category}?page={page}"
            
        resp = await http_client.get(url)
        data = resp.json()
        
        # Standardize items and pagination
        items = []
        raw_items = data.get("items", []) or data.get("data", {}).get("items", [])
        raw_pagination = data.get("pagination") or data.get("data", {}).get("params", {}).get("pagination", {})
        
        for item in raw_items:
            img_prefix = "https://phimimg.com/" if not item.get("poster_url", "").startswith("http") else ""
            items.append({
                "title": item.get("name"),
                "origin_name": item.get("origin_name"),
                "slug": item.get("slug"),
                "poster": img_prefix + item.get("poster_url") if item.get("poster_url") else None,
                "year": item.get("year"),
                "media_type": "tv" if "(Phần" in item.get("name") or "Season" in item.get("name") or category in ["phim-bo", "tv-shows"] else "movie"
            })
            
        res_data = {
            "items": items,
            "pagination": raw_pagination,
            "success": True
        }
        
        # Save Cache
        cache[cache_key] = {"timestamp": time.time(), "data": res_data}
        save_cache(KKPHIM_CACHE, cache)
        return res_data
    except Exception as e:
        return {"error": str(e), "success": False}

@app.get("/metadata/{slug}")
async def get_movie_metadata(slug: str):
    try:
        # Get details from KKPhim script
        proc = await asyncio.create_subprocess_exec(
            "python3", "app/scripts/kkphim_lookup.py", slug,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if stderr:
            print(f"Lookup Error: {stderr.decode()}")
        metadata = json.loads(stdout.decode())
        
        if "error" in metadata:
            return {"error": metadata["error"]}

        # Check local storage only (Google/ThuVienCine moved to discovery endpoint)
        title = metadata["title"]
        local_res = await asyncio.to_thread(check_local_storage_sync, title, metadata.get("type", "movie"))
        
        return {
            "metadata": metadata,
            "links": {
                "streaming": metadata.get("links", []),
                "fshare": [], # Initially empty, filled by discovery
                "web": []
            },
            "local": local_res,
            "type": "detail"
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/lookup/fshare-discovery/{slug}")
async def fshare_discovery(slug: str, title: str):
    """
    Search for extended Fshare links in the background from ThuVienCine and Google.
    """
    try:
        # Start both scrapers concurrently
        t_cine = lookup_thuviencine(title)
        t_google = lookup_google_fshare(title)
        
        results = await asyncio.gather(t_cine, t_google)
        
        combined_fshare = results[0] + results[1]
        
        return {
            "fshare": combined_fshare,
            "success": True
        }
    except Exception as e:
        return {"error": str(e), "success": False}

@app.get("/jd/list")
async def jd_list():
    try:
        device = await get_jd_device()
        # Query more detailed package info
        pkgs = device.downloads.query_packages([{
            "bytesLoaded": True, 
            "bytesTotal": True, 
            "running": True, 
            "status": True, 
            "speed": True, 
            "eta": True,
            "uuid": True,
            "enabled": True
        }])
        return [{
            "uuid": p.get("uuid"),
            "name": p.get("name"),
            "bytesLoaded": p.get("bytesLoaded", 0),
            "bytesTotal": p.get("bytesTotal", 0),
            "speed": p.get("speed", 0),
            "eta": p.get("eta", 0),
            "status": p.get("status", "Idle"),
            "running": p.get("running", False),
            "enabled": p.get("enabled", True)
        } for p in pkgs]
    except Exception:
        return []

@app.post("/jd/control")
async def jd_control(action: str, uuids: List[str] = Query([])):
    try:
        device = await get_jd_device()
        if action == "START":
            device.downloads.start_downloads() # Global start if no specific target
        elif action == "STOP":
            device.downloads.stop_downloads() # Global stop
        elif action == "RESUME_JOB":
            device.downloads.id_enabled(True, uuids, [])
        elif action == "STOP_JOB":
            device.downloads.id_enabled(False, uuids, [])
        elif action == "REMOVE_JOB":
            device.downloads.remove_downloads(uuids, [])
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

def sanitize_filename(name: str):
    # More aggressive sanitization for paths/filenames
    return re.sub(r'[\\/*?:"<>|]', "", name).replace(":", " -").strip()

def extract_season(text: str):
    # Tìm các mẫu như: Phần 02, Phần 2, Season 3, S4, Season 05
    patterns = [
        r'[Pp]hần\s*(\d+)',
        r'[Ss]eason\s*(\d+)',
        r'[Ss](\d+)'
    ]
    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return 1

@app.post("/download")
async def jd_download(
    url: str, 
    name: str,           # This is the segment/episode name (e.g., "Tập 01")
    title: str,          # This is the pure movie/show title (e.g., "The Boys")
    origin_name: Optional[str] = None, # English/Original title for folder naming
    year: Optional[str] = None,
    media_type: str = "movie", 
    collection: Optional[str] = None,
    season: Optional[int] = None
):
    try:
        # Validation
        if not title or title.strip() == "":
            # Try to recover title from name if it looks like "Title - Episode"
            if " - " in name:
                title = name.split(" - ")[0].strip()
            else:
                raise HTTPException(status_code=400, detail="Movie/TV Title is required for path resolution")

        print(f"DEBUG: Download Request -> Title: {title}, Name: {name}, Type: {media_type}")
        
        device = await get_jd_device()
        jd_base = JD_INTERNAL_PATH 
        
        # Trích xuất Season nếu chưa có
        if media_type == "tv" and season is None:
            season = extract_season(title)
            if season == 1 and origin_name:
                s_origin = extract_season(origin_name)
                if s_origin > 1:
                    season = s_origin
        
        # Làm sạch Title
        clean_title_only = re.sub(r'([Pp]hần|[Ss]eason|[Ss])\s*\d+', '', title, flags=re.IGNORECASE).strip()
        clean_title = sanitize_filename(clean_title_only)
        clean_segment = sanitize_filename(name)
        
        if media_type == "movie":
            display_title = f"{clean_title} ({year})" if year else clean_title
            folder_title = display_title
            package_name = display_title
            # Force filename to be movie name if it's a stream
            filename = f"{display_title}.mp4" if "m3u8" in url.lower() or "index" in url.lower() or "fragment" in url.lower() else ""
            download_sub = "Movies"
        else:
            display_title = clean_title
            folder_title = clean_title
            season_str = f"Season {season:02d}" if season else "Season 01"
            package_name = f"{clean_title} - {season_str} - {clean_segment}"
            # Force filename for TV episodes
            filename = f"{package_name}.mp4" if "m3u8" in url.lower() or "index" in url.lower() or "fragment" in url.lower() else ""
            download_sub = os.path.join("TV Shows", folder_title, season_str)

        # 1. Tìm đường dẫn hiện có (Recursive search) sử dụng tiêu đề đã làm sạch
        existing_info = check_local_storage_sync(clean_title, media_type)
        
        if existing_info["exists"]:
            # Nếu tìm thấy thư mục local, map sang JD container path
            base_path = existing_info["path"].replace(STORAGE_PATH, jd_base)
            if media_type == "tv":
                # Đảm bảo vào đúng Season folder bên trong thư mục đã tìm thấy
                download_path = os.path.join(base_path, f"Season {season:02d}" if season else "Season 01")
            else:
                download_path = base_path
        else:
            # 2. Nếu chưa có, tạo cấu trúc thư mục mới khớp với logic scan
            if media_type == "movie":
                dest_sub = "Movies"
                if collection:
                    coll_name = sanitize_filename(collection.replace("Collection", "").strip())
                    base_movies = os.path.join(STORAGE_PATH, "Movies")
                    found_coll = None
                    if os.path.exists(base_movies):
                        for d in os.listdir(base_movies):
                            if coll_name.lower() in d.lower() and os.path.isdir(os.path.join(base_movies, d)):
                                found_coll = d
                                break
                    if found_coll:
                        dest_sub = os.path.join("Movies", found_coll)
                
                # Khớp tuyệt đối với find_existing_path: base/Movies/Movie (Year)/
                download_path = os.path.join(jd_base, dest_sub, folder_title)
            else:
                # TV Shows: base/TV Shows/Title/Season XX/
                download_path = os.path.join(jd_base, download_sub)
        
        print(f"DEBUG: Final JD Path: {download_path}")
        print(f"DEBUG: Package Name: {package_name}")

        device.linkgrabber.add_links([{
            "links": url,
            "downloadFolder": download_path,
            "packageName": package_name,
            "destinationFilename": filename,
            "autostart": True,
            "autoConfirm": True
        }])
        return {"success": True, "path": download_path, "package": package_name}
    except Exception as e:
        print(f"ERROR: Download failed: {str(e)}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8086)
