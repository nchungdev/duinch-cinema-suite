import sys
import json
import urllib.request
import urllib.parse
import os
import re

TMDB_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN")

def kkphim_api_call(url):
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        with urllib.request.urlopen(req, timeout=10) as response:
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

def tmdb_get_info(media_type, tmdb_id):
    if not TMDB_TOKEN or not tmdb_id:
        return {}
    
    # Mapping for TMDB
    tmdb_type = "movie" if media_type in ["movie", "hoathinh"] else "tv"
    url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}?language=vi-VN"
    
    try:
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {TMDB_TOKEN}")
        req.add_header("accept", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            poster_path = data.get("poster_path")
            return {
                "poster": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
                "total_seasons": data.get("number_of_seasons"),
                "total_episodes": data.get("number_of_episodes"),
                "status": data.get("status"),
                "overview": data.get("overview")
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
    
    movie = data.get("movie", {})
    episodes = data.get("episodes", [])
    
    tmdb_id = str(movie.get("tmdb", {}).get("id")) if movie.get("tmdb") else None
    tmdb_info = {}
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
        "type": movie.get("type"),
        "season": season,
        "total_seasons": tmdb_info.get("total_seasons"),
        "total_episodes": tmdb_info.get("total_episodes"),
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
