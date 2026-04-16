import sys
import json
import urllib.request
import urllib.parse
import os
import re

TMDB_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

import ssl

def kkphim_api_call(url):
    try:
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        return {"error": f"API Error: {str(e)}"}

def kkphim_get_by_tmdb(media_type, tmdb_id):
    # Endpoint mới cực kỳ chính xác: https://phimapi.com/tmdb/{type}/{id}
    # type: movie hoặc tv
    type_map = {"movie": "movie", "tv": "tv"}
    api_type = type_map.get(media_type, "movie")
    url = f"https://phimapi.com/tmdb/{api_type}/{tmdb_id}"
    return kkphim_api_call(url)

def tmdb_search_by_title(title, media_type="tv", is_anime=False):
    """Fallback: search TMDB by title to find tmdb_id when KKPhim doesn't provide it."""
    if not TMDB_TOKEN or not title:
        return None
    
    encoded = urllib.parse.quote(title)
    url = f"https://api.themoviedb.org/3/search/{media_type}?query={encoded}&language=en-US&page=1"
    
    try:
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {TMDB_TOKEN}")
        req.add_header("accept", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            results = data.get("results", [])
            if not results:
                return None
            
            # For anime, prefer results with animation genre (16)
            if is_anime:
                for r in results:
                    if 16 in r.get("genre_ids", []):
                        return str(r.get("id"))
            
            # Default: return first result
            return str(results[0].get("id"))
    except Exception:
        pass
    return None

def tmdb_get_info(media_type, tmdb_id):
    if not TMDB_TOKEN or not tmdb_id:
        return {}
    
    # Mapping for TMDB
    tmdb_type = "movie" if media_type in ["movie"] else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}?language=vi-VN"
    
    try:
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {TMDB_TOKEN}")
        req.add_header("accept", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            poster_path = data.get("poster_path")
            
            # Extract seasons for TV shows
            seasons = []
            if tmdb_type == "tv":
                for s in data.get("seasons", []):
                    if s.get("season_number", 0) == 0:
                        continue  # Skip "Specials"
                    seasons.append({
                        "season_number": s.get("season_number"),
                        "name": s.get("name"),
                        "episode_count": s.get("episode_count", 0)
                    })
            
            return {
                "poster": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
                "total_seasons": data.get("number_of_seasons"),
                "total_episodes": data.get("number_of_episodes"),
                "status": data.get("status"),
                "overview": data.get("overview"),
                "tmdb_seasons": seasons if seasons else None
            }
    except Exception:
        pass
    return {}

def kkphim_search(keyword):
    encoded_keyword = urllib.parse.quote(keyword)
    search_url = f"https://phimapi.com/v1/api/tim-kiem?keyword={encoded_keyword}&limit=5"
    data = kkphim_api_call(search_url)
    if "error" in data:
        return []
    return data.get("data", {}).get("items", [])

def kkphim_get_details(slug):
    detail_url = f"https://phimapi.com/phim/{slug}"
    data = kkphim_api_call(detail_url)
    if "error" in data:
        return data
    
    if not data.get("status", True):
        return {"error": data.get("msg", "Movie not found")}
    
    movie = data.get("movie")
    if not isinstance(movie, dict):
        return {"error": "Invalid movie data"}
        
    episodes = data.get("episodes", [])
    if not isinstance(episodes, list):
        episodes = []
    
    tmdb_data = movie.get("tmdb")
    tmdb_id = None
    if isinstance(tmdb_data, dict):
        tmdb_id = str(tmdb_data.get("id")) if tmdb_data.get("id") else None
    
    tmdb_info = {}
    
    # Fallback: if KKPhim doesn't have tmdb_id, search TMDB by title
    if not tmdb_id and movie.get("type") not in ["movie"]:
        origin_name = movie.get("origin_name") or movie.get("name")
        is_anime = movie.get("type") == "hoathinh"
        tmdb_id = tmdb_search_by_title(origin_name, "tv", is_anime=is_anime)
    
    if tmdb_id:
        tmdb_info = tmdb_get_info(movie.get("type"), tmdb_id)
    
    # Poster Fallback
    poster = tmdb_info.get("poster") or movie.get("poster_url")

    # Trích xuất Season từ tên phim (nếu có)
    season = 1
    s_match = re.search(r'([Pp]hần|[Ss]eason|[Ss])\s*(\d+)', movie.get("name", ""), re.IGNORECASE)
    if s_match:
        season = int(s_match.group(2))
    elif movie.get("origin_name"):
        s_match = re.search(r'([Pp]hần|[Ss]eason|[Ss])\s*(\d+)', movie.get("origin_name"), re.IGNORECASE)
        if s_match:
            season = int(s_match.group(2))

    output = {
        "title": movie.get("name"),
        "origin_name": movie.get("origin_name"),
        "year": movie.get("year"),
        "slug": movie.get("slug"),
        "tmdb_id": tmdb_id,
        "poster": poster,
        "thumb_url": movie.get("thumb_url") or poster,
        "poster_url": poster,
        "content": movie.get("content") or tmdb_info.get("overview"),
        "time": movie.get("time"),
        "quality": movie.get("quality"),
        "lang": movie.get("lang"),
        "category": movie.get("category", []),
        "actor": movie.get("actor", []),
        "type": movie.get("type"),
        "season": season,
        "total_seasons": tmdb_info.get("total_seasons"),
        "total_episodes": tmdb_info.get("total_episodes"),
        "tmdb_seasons": tmdb_info.get("tmdb_seasons"),
        "overview": movie.get("content") or tmdb_info.get("overview"),
        "links": []
    }
    
    output["links"] = []
    
    for ep_group in episodes:
        server = {
            "server_name": ep_group.get("server_name"),
            "server_data": []
        }
        for ep in ep_group.get("server_data", []):
            server["server_data"].append({
                "name": ep.get("name"),
                "m3u8": ep.get("link_m3u8"),
                "embed": ep.get("link_embed")
            })
        output["links"].append(server)
    return output

def extract_kkphim_streaming(details: dict, media_type: str, season: int = None, episode: int = None):
    """Unified extractor for KKPhim streaming links."""
    results = []
    links = details.get("links", [])
    
    # If it's a detail object from kkphim_get_details, it has 'links' which is a list of servers
    for server in links:
        server_name = server.get("server_name")
        server_data = server.get("server_data", [])
        
        for ep in server_data:
            ep_name = ep.get("name")
            m3u8 = ep.get("m3u8")
            embed = ep.get("embed")
            
            is_match = False
            if media_type == "movie":
                is_match = True
            else:
                # TV Show: try to match episode
                # ep_name could be "1", "01", "Tập 1", etc.
                try:
                    # Extract number from ep_name
                    nums = re.findall(r'\d+', ep_name)
                    current_ep = int(nums[0]) if nums else None
                    
                    if episode is not None:
                        if current_ep == episode:
                            is_match = True
                    else:
                        is_match = True # Return all episodes if none specified
                except (ValueError, IndexError):
                    if episode is None:
                        is_match = True
                    elif str(episode) in ep_name:
                        is_match = True

            if is_match:
                # Parse episode number từ ep_name ("1", "01", "Tập 1", ...)
                nums = re.findall(r'\d+', ep_name or "")
                parsed_ep = int(nums[0]) if nums else None
                results.append({
                    "type": "streaming",
                    "provider": "kkphim",
                    "season": season or details.get("season", 1),
                    "episode": parsed_ep,
                    "name": ep_name,
                    "m3u8": m3u8,
                    "embed": embed,
                    "server": server_name
                })
    return results

async def lookup_kkphim(client, tmdb_id: str = None, title: str = None, media_type: str = "movie", season: int = None, episode: int = None):
    """Async wrapper for KKPhim lookup with TMDB priority."""
    import asyncio
    
    details = None
    # Ưu tiên 1: Tra cứu trực tiếp bằng TMDB ID (chính xác nhất)
    if tmdb_id:
        def _get_by_tmdb():
            res = kkphim_get_by_tmdb(media_type, tmdb_id)
            if res and not res.get("error") and res.get("movie"):
                slug = res.get("movie", {}).get("slug")
                if slug:
                    return kkphim_get_details(slug)
            return None
        details = await asyncio.to_thread(_get_by_tmdb)
    
    # Ưu tiên 2: Tìm kiếm theo Title nếu chưa có kết quả (hoặc ko có tmdb_id)
    if not details and title:
        def _get_by_title():
            # Chiến lược search: Thử từ cụ thể đến tổng quát
            search_attempts = [title]
            # Nếu title dài (> 2 từ), thêm variant rút gọn
            words = title.split()
            if len(words) > 2:
                search_attempts.append(" ".join(words[:3])) # Thử 3 từ đầu
                search_attempts.append(words[0]) # Thử từ đầu tiên (rất rộng)
            
            items = []
            for q in search_attempts:
                items = kkphim_search(q)
                if items: break
            
            if items:
                target_slug = None
                clean_title = title.lower().strip()
                
                # 1. Match chính xác TMDB ID
                if tmdb_id:
                    for item in items:
                        item_tmdb = item.get("tmdb", {})
                        if item_tmdb and str(item_tmdb.get("id")) == str(tmdb_id):
                            target_slug = item.get("slug")
                            break

                # 2. Match chính xác Title hoặc Origin Name
                if not target_slug:
                    for item in items:
                        name = item.get("name", "").lower().strip()
                        origin_name = item.get("origin_name", "").lower().strip()
                        if clean_title == name or clean_title == origin_name:
                            target_slug = item.get("slug")
                            break
                
                # 3. Match theo "chứa" title (độ ưu tiên thấp hơn)
                if not target_slug:
                    for item in items:
                        name = item.get("name", "").lower().strip()
                        origin_name = item.get("origin_name", "").lower().strip()
                        if clean_title in name or clean_title in origin_name:
                            target_slug = item.get("slug")
                            break

                # 4. Fallback item đầu tiên nếu search kết quả rất ít (độ tin cậy cao)
                if not target_slug and len(items) <= 3:
                    target_slug = items[0].get("slug")
                    
                if target_slug:
                    return kkphim_get_details(target_slug)
            return None
        details = await asyncio.to_thread(_get_by_title)
            
    if not details:
        return []
        
    return extract_kkphim_streaming(details, media_type, season, episode)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python kkphim_lookup.py <keyword_or_slug> [tmdb_id] [media_type]"}))
        sys.exit(1)
    
    input_str = sys.argv[1]
    tmdb_id = sys.argv[2] if len(sys.argv) > 2 else None
    media_type = sys.argv[3] if len(sys.argv) > 3 else "movie"

    # Ưu tiên 1: Tra cứu trực tiếp bằng TMDB ID (Nếu có)
    if tmdb_id and tmdb_id.isdigit():
        details = kkphim_get_by_tmdb(media_type, tmdb_id)
        if "error" not in details and details.get("movie"):
            # Chuyển đổi format detail của TMDB endpoint sang format chuẩn của chúng ta
            movie = details.get("movie", {})
            slug = movie.get("slug")
            if slug:
                final_details = kkphim_get_details(slug)
                print(json.dumps(final_details, ensure_ascii=False))
                sys.exit(0)

    # Ưu tiên 2: Nếu là slug thì lấy detail
    if "-" in input_str and len(input_str.split("-")) > 1:
        details = kkphim_get_details(input_str)
        if "error" not in details and details.get("title"):
            print(json.dumps(details, ensure_ascii=False))
            sys.exit(0)

    # Ưu tiên 3: Tìm kiếm theo keyword
    items = kkphim_search(input_str)
    if items:
        details = kkphim_get_details(items[0].get("slug"))
        print(json.dumps(details, ensure_ascii=False))
    else:
        print(json.dumps({"error": "Not found on KKPhim"}))
