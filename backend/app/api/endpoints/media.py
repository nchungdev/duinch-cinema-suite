from fastapi import APIRouter, Request, Query, HTTPException
import asyncio
import os
import re
from typing import Optional, List, Dict, Any
from app.core import config
from app.services import media_service, tmdb_service

# Scrapers
from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.fshare_lookup import resolve_fshare_url
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare
from app.services.scrapers.hdvietnam_lookup import lookup_hdvietnam
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent

router = APIRouter()

def find_existing_path(title: str, media_type: str):
    if not title or not title.strip():
        return None
    base = os.path.join(config.STORAGE_PATH, "Movies" if media_type == "movie" else "TV Shows")
    if not os.path.exists(base):
        return None
    title_clean = title.lower().strip()
    for root, dirs, files in os.walk(base):
        for d in dirs:
            if title_clean == d.lower().strip() or f"({title_clean})" in d.lower(): 
                return os.path.join(root, d)
        for f in files:
            if title_clean in f.lower():
                return root
    return None

def check_local_storage_sync(title: str, media_type: str):
    path = find_existing_path(title, media_type)
    return {"exists": True, "path": path} if path else {"exists": False}

@router.get("/search/{query}")
async def fast_search(request: Request, query: str, media_type: str = "all"):
    client = request.app.state.http_client
    tmdb_task = media_service.fetch_tmdb_metadata(client, query, media_type)
    kk_task = media_service.fetch_kkphim_search(client, query, media_type)
    
    meta_results, kk_results = await asyncio.gather(tmdb_task, kk_task)
    kk_map = {item["title"].lower().strip(): item["slug"] for item in kk_results}
    
    combined = []
    seen = set()
    for item in meta_results:
        clean_title = item["title"].lower().strip()
        if clean_title in kk_map:
            item["slug"] = kk_map[clean_title]
        else:
            item["slug"] = f"tmdb:{item.get('media_type', 'movie')}:{item.get('tmdb_id', '')}"
        combined.append(item)
        seen.add(clean_title)
        
    for item in kk_results:
        clean_title = item["title"].lower().strip()
        if clean_title not in seen:
            combined.append(item)
            seen.add(clean_title)

    if not combined:
        return {"error": "No results found"}
    return {"results": combined, "type": "list"}

@router.get("/metadata/{slug}")
async def get_movie_metadata(request: Request, slug: str):
    try:
        # Simplified metadata fetch, focus on raw metadata
        if slug.startswith("tmdb:"):
            parts = slug.split(":")
            m_type = parts[1]
            t_id = parts[2]
            url = f"https://api.themoviedb.org/3/{m_type}/{t_id}?language=vi-VN"
            headers = {"Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}", "accept": "application/json"}
            client = request.app.state.http_client
            resp = await client.get(url, headers=headers)
            tmdb_data = resp.json()
            
            metadata = {
                "title": tmdb_data.get("title") or tmdb_data.get("name") or "Unknown Title",
                "origin_name": tmdb_data.get("original_title") or tmdb_data.get("original_name") or "Unknown",
                "poster": f"https://image.tmdb.org/t/p/w500{tmdb_data.get('poster_path')}" if tmdb_data.get('poster_path') else "",
                "poster_url": f"https://image.tmdb.org/t/p/w500{tmdb_data.get('poster_path')}" if tmdb_data.get('poster_path') else "",
                "thumb_url": f"https://image.tmdb.org/t/p/original{tmdb_data.get('backdrop_path')}" if tmdb_data.get('backdrop_path') else "",
                "content": tmdb_data.get("overview", "No overview provided."),
                "year": (tmdb_data.get("release_date") or tmdb_data.get("first_air_date", "0000"))[:4],
                "type": "tv" if m_type == "tv" else "movie",
                "quality": "TMDB Source",
                "lang": "Global",
                "tmdb_id": int(t_id) if t_id.isdigit() else None
            }
        else:
            # Fallback for KKPhim slugs
            from app.services.scrapers.kkphim_lookup import kkphim_get_details
            metadata = await asyncio.to_thread(kkphim_get_details, slug)
            if "error" in metadata:
                return {"error": metadata["error"]}

        title = metadata["title"]
        local_res = await asyncio.to_thread(check_local_storage_sync, title, metadata.get("type", "movie"))
        
        return {
            "metadata": metadata,
            "local": local_res,
            "success": True
        }
    except Exception as e:
        return {"error": str(e), "success": False}

def get_query_variants(title: str, year: Optional[str] = None, season: Optional[int] = None, episode: Optional[int] = None) -> List[str]:
    """Bóc tách title thành các variant từ chi tiết đến tổng quát."""
    variants = []
    clean_title = re.sub(r'\(.*?\)', '', title).strip() # Bỏ phần trong ngoặc
    base = clean_title
    
    # 1. Cụ thể nhất: Title + Year + SxxExx
    if season and episode:
        s_str = f"S{season:02d}E{episode:02d}"
        if year: variants.append(f"{base} {year} {s_str}")
        variants.append(f"{base} {s_str}")
        
    # 2. Vừa: Title + Year + Sxx
    if season:
        s_str = f"S{season:02d}"
        if year: variants.append(f"{base} {year} {s_str}")
        variants.append(f"{base} {s_str}")
        
    # 3. Tổng quát hơn: Title + Year
    if year:
        variants.append(f"{base} {year}")
        
    # 4. Cơ bản nhất: Title gốc
    variants.append(base)
    
    # Loại bỏ trùng lặp và giữ thứ tự
    seen = set()
    return [x for x in variants if not (x in seen or seen.add(x))]

@router.get("/lookup/sources")
async def lookup_sources(
    request: Request,
    media_type: str = Query(..., pattern="^(movie|tv)$"),
    title: str = Query(...),
    tmdb_id: Optional[int] = Query(None),
    year: Optional[str] = Query(None),
    season: Optional[int] = Query(None),
    episode: Optional[int] = Query(None),
    provider: str = Query("all")
):
    if media_type == "movie" and (season is not None or episode is not None):
        raise HTTPException(status_code=400, detail="Movies cannot have season or episode")
    if episode is not None and season is None:
        raise HTTPException(status_code=400, detail="Episode requires season")
    
    valid_providers = ["all", "kkphim", "ophim", "fshare", "gdrive", "torrent"]
    if provider not in valid_providers:
        raise HTTPException(status_code=400, detail=f"Invalid provider. Must be one of {valid_providers}")

    client = request.app.state.http_client
    
    # --- PHA 1: ĐỊNH DANH THỰC THỂ DUY NHẤT ---
    details = {}
    if tmdb_id:
        details = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)
    else:
        # Tìm kiếm trên TMDB
        tmdb_results = await media_service.fetch_tmdb_metadata(client, title, media_type)
        if not tmdb_results:
            return {"error": f"Không tìm thấy phim '{title}' trên TMDB.", "success": False}
        
        # CHIẾN LƯỢC ĐỊNH DANH TUYỆT ĐỐI (STRICT ONLY)
        match = None
        clean_query = title.lower().strip()
        
        # 1. Tìm phim khớp cả Title và Year (nếu có year)
        if year:
            match = next((item for item in tmdb_results if (item.get("title", "").lower() == clean_query or item.get("origin_name", "").lower() == clean_query) and item.get("year") == str(year)), None)
        
        # 2. Tìm phim khớp chính xác tuyệt đối Title (Exact Match)
        if not match:
            match = next((item for item in tmdb_results if item.get("title", "").lower() == clean_query or item.get("origin_name", "").lower() == clean_query), None)
            
        # 3. KHÔNG có bước fuzzy matching (không lấy bừa kết quả chứa từ khóa)
        
        # 4. Nếu không có exact match -> Báo lỗi ngay lập tức
        if not match:
            return {
                "error": f"Không tìm thấy phim khớp chính xác với tiêu đề '{title}'.", 
                "suggestions": [item.get("title") for item in tmdb_results[:3]],
                "success": False
            }
            
        tmdb_id = match.get("tmdb_id")
        details = await tmdb_service.get_tmdb_details(client, tmdb_id, media_type)

    if not details or not tmdb_id:
        return {"error": "Failed to fetch authoritative metadata for the entity.", "success": False}

    # THÔNG TIN CHÍNH XÁC TUYỆT ĐỐI CỦA PHIM
    target_title = details.get("title") or details.get("name")
    target_origin = details.get("original_title") or details.get("original_name")
    target_year = (details.get("release_date") or details.get("first_air_date") or "")[:4]
    
    # --- PHA 2: TÌM NGUỒN (SCRAPING CHÍNH XÁC) ---
    
    # Metadata trả về
    metadata_response = {
        "title": target_title,
        "original_title": target_origin,
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "year": target_year,
        "poster": f"https://image.tmdb.org/t/p/w500{details.get('poster_path')}" if details.get('poster_path') else None,
        "backdrop": f"https://image.tmdb.org/t/p/original{details.get('backdrop_path')}" if details.get('backdrop_path') else None,
        "overview": details.get("overview")
    }
    if season: metadata_response["season"] = season
    if episode: metadata_response["episode"] = episode

    # CHỈ DÙNG TỪ KHÓA CHUẨN ĐỂ SCRAPE
    # Không dùng "variants" mở rộng, chỉ dùng Title chính thức + Năm
    search_query = target_title
    if target_year:
        search_query = f"{target_title} {target_year}"
    
    # Nếu là TV Show, thêm thông tin Season/Episode vào query tìm kiếm link download
    if media_type == "tv" and season:
        if episode:
            search_query += f" S{int(season):02d}E{int(episode):02d}"
        else:
            search_query += f" S{int(season):02d}"

    # Build tasks
    tasks = []
    
    # Streaming: Luôn dùng TMDB ID (Tuyệt đối chính xác)
    if provider in ["all", "kkphim"]:
        tasks.append(lookup_kkphim(client, str(tmdb_id), target_title, media_type, season, episode))
    if provider in ["all", "ophim"]:
        tasks.append(lookup_ophim(client, tmdb_id, target_title, media_type, season, episode))
        
    # Download: Tìm kiếm trực diện bằng search_query chuẩn
    async def surgical_provider_search(scraper_func, query):
        try:
            return await scraper_func(query)
        except Exception:
            return []

    if provider in ["all", "fshare"]:
        async def wrap_fshare(q):
            f_res = await asyncio.gather(
                lookup_thuviencine(q), 
                lookup_google_fshare(q), 
                lookup_hdvietnam(q),
                return_exceptions=True
            )
            links = []
            for r in f_res:
                if isinstance(r, list): links.extend(r)
            if not links: return []
            
            expanded = await asyncio.gather(*[resolve_fshare_url(l["url"], client) for l in links], return_exceptions=True)
            fshare_final = []
            for source_link, resolved_items in zip(links, expanded):
                if isinstance(resolved_items, list):
                    for item in resolved_items:
                        fshare_final.append({
                            "type": "download", "provider": "fshare",
                            "url": item.get("url"), "name": item.get("name"),
                            "size": item.get("size", 0), "source_page": source_link.get("source_page", "")
                        })
            return fshare_final
            
        tasks.append(surgical_provider_search(wrap_fshare, search_query))
        
    if provider in ["all", "gdrive"]:
        tasks.append(surgical_provider_search(lookup_gdrive, search_query))
        
    if provider in ["all", "torrent"]:
        tasks.append(surgical_provider_search(lookup_torrent, search_query))

    # 4. Gather all providers
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 5. Phân loại và gom nhóm thành mảng 'sources' tinh gọn
    final_sources = []
    
    def get_link_format(url):
        if not url: return "url"
        url_lower = url.lower()
        if url_lower.startswith("magnet:"): return "magnet"
        if ".m3u8" in url_lower: return "m3u8"
        if any(x in url_lower for x in ["share/", "embed/", "player/", "storage/"]): return "embed"
        if url_lower.endswith(".mp4"): return "mp4"
        if url_lower.endswith(".mkv"): return "mkv"
        return "url"

    for res in results_list:
        if not isinstance(res, list) or not res:
            continue
            
        p_name = res[0].get("provider", "unknown")
        
        provider_links = []
        for item in res:
            # Gom tất cả các loại URL về 1 field duy nhất
            raw_url = item.get("url") or item.get("m3u8") or item.get("embed")
            if not raw_url:
                continue
            
            link_obj = {
                "name": item.get("name"),
                "url": raw_url,
                "format": get_link_format(raw_url),
                "server": item.get("server"),
                "size": item.get("size"),
            }
            
            # Chỉ thêm season/episode cho TV Show
            if media_type == "tv":
                link_obj["season"] = item.get("season")
                link_obj["episode"] = item.get("episode")
            
            # Loại bỏ các thuộc tính null
            clean_link = {k: v for k, v in link_obj.items() if v is not None}
            provider_links.append(clean_link)
            
        final_sources.append({
            "provider": p_name,
            "links": provider_links
        })

    return {
        "sources": final_sources,
        "metadata": metadata_response,
        "success": True
    }


@router.get("/lookup/folder-expand")
async def folder_expand(request: Request, url: str, provider: str = "fshare"):
    """Standalone endpoint to expand folder URLs (extensible)."""
    try:
        client = request.app.state.http_client
        if provider == "fshare":
            files = await resolve_fshare_url(url, client)
            return {"results": files, "success": True}
        else:
            return {"error": f"Provider {provider} not supported for expansion", "success": False}
    except Exception as e:
        return {"error": str(e), "success": False}
