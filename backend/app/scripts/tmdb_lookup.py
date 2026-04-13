import sys
import json
import urllib.request
import urllib.parse
import os

def load_keys():
    key_path = "/home/chungnh/.openclaw/tmdb_keys.json"
    if not os.path.exists(key_path):
        return None, None
    with open(key_path, "r") as f:
        data = json.load(f)
        return data.get("api_key"), data.get("read_access_token")

def search_tmdb(query):
    api_key, token = load_keys()
    if not api_key:
        return {"error": "No TMDB keys found"}

    encoded_query = urllib.parse.quote(query)
    url = f"https://api.themoviedb.org/3/search/multi?query={encoded_query}&include_adult=false&language=vi-VN&page=1"
    
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            results = data.get("results", [])
            if not results:
                return {"error": "No results found"}

            for item in results:
                media_type = item.get("media_type")
                if media_type in ["movie", "tv"]:
                    return {
                        "title": item.get("title") or item.get("name"),
                        "year": (item.get("release_date") or item.get("first_air_date", "0000-"))[:4],
                        "media_type": media_type,
                        "tmdb_id": item.get("id"),
                        "overview": item.get("overview")
                    }
            return {"error": "No media results found"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python tmdb_lookup.py <query>"}))
        sys.exit(1)
    
    result = search_tmdb(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))
