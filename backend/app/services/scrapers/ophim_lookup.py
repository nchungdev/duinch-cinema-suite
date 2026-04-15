import httpx
from typing import List, Dict, Optional, Any
import re

async def ophim_search(client: httpx.AsyncClient, keyword: str) -> List[Dict[str, Any]]:
    """Search for movies on OPhim using the V1 API."""
    try:
        url = f"https://ophim1.com/v1/api/tim-kiem?keyword={keyword}&limit=10"
        resp = await client.get(url)
        data = resp.json()
        return data.get("data", {}).get("items", [])
    except Exception as e:
        print(f"OPhim search error: {e}")
        return []

async def ophim_get_detail(client: httpx.AsyncClient, slug: str) -> Dict[str, Any]:
    """Get movie detail from OPhim."""
    try:
        url = f"https://ophim1.com/phim/{slug}"
        resp = await client.get(url)
        return resp.json()
    except Exception as e:
        print(f"OPhim detail error: {e}")
        return {}

def extract_ophim_results(data: Dict[str, Any], media_type: str, season: Optional[int] = None, episode: Optional[int] = None) -> List[Dict[str, Any]]:
    """Extract streaming links from OPhim data."""
    results = []
    movie_info = data.get("movie", {})
    episodes_data = data.get("episodes", [])
    
    if not movie_info or not episodes_data:
        return []

    for server in episodes_data:
        server_name = server.get("server_name", "Default")
        server_data = server.get("server_data", [])
        
        for ep in server_data:
            ep_name = ep.get("name", "")
            ep_slug = ep.get("slug", "")
            m3u8 = ep.get("link_m3u8", "")
            embed = ep.get("link_embed", "")
            
            is_match = False
            if media_type == "movie":
                is_match = True
            else:
                try:
                    # Parse episode number
                    nums = re.findall(r'\d+', ep_name or "")
                    current_ep = int(nums[0]) if nums else None
                    
                    if episode is not None:
                        if current_ep == episode:
                            is_match = True
                    else:
                        is_match = True
                except (ValueError, IndexError):
                    if episode is None:
                        is_match = True
                    elif str(episode) in ep_name:
                        is_match = True

            if is_match:
                # Parse episode number for the result object
                nums = re.findall(r'\d+', ep_name or "")
                parsed_ep = int(nums[0]) if nums else (episode or 1)
                
                results.append({
                    "type": "streaming",
                    "provider": "ophim",
                    "season": season or 1,
                    "episode": parsed_ep,
                    "name": ep_name,
                    "m3u8": m3u8,
                    "embed": embed,
                    "server": server_name
                })
    
    return results

async def lookup_ophim(client: httpx.AsyncClient, tmdb_id: Optional[int], title: str, media_type: str, season: Optional[int] = None, episode: Optional[int] = None) -> List[Dict[str, Any]]:
    """Main entry point for OPhim lookup with TMDB priority."""
    # 1. Search chiến lược từ cụ thể đến tổng quát
    search_attempts = [title]
    words = title.split()
    if len(words) > 2:
        search_attempts.append(" ".join(words[:2])) # 2 từ đầu
        search_attempts.append(words[0]) # 1 từ đầu
        
    items = []
    for q in search_attempts:
        items = await ophim_search(client, q)
        if items: break
        
    if not items:
        return []
    
    # 2. Match
    target_slug = None
    clean_title = title.lower().strip()
    
    # Ưu tiên 1: TMDB ID
    if tmdb_id:
        for item in items:
            item_tmdb = item.get("tmdb", {})
            if item_tmdb and str(item_tmdb.get("id")) == str(tmdb_id):
                target_slug = item.get("slug")
                break
    
    # Ưu tiên 2: Exact Name or Origin Name or Alternative
    if not target_slug:
        for item in items:
            name = item.get("name", "").lower().strip()
            origin_name = item.get("origin_name", "").lower().strip()
            alts = [a.lower().strip() for a in item.get("alternative_names", [])]
            
            if clean_title == name or clean_title == origin_name or clean_title in alts:
                target_slug = item.get("slug")
                break
                
    # Ưu tiên 3: Partial Match
    if not target_slug:
        for item in items:
            name = item.get("name", "").lower().strip()
            origin_name = item.get("origin_name", "").lower().strip()
            alts = [a.lower().strip() for a in item.get("alternative_names", [])]
            if any(clean_title in alt for alt in alts) or clean_title in name or clean_title in origin_name:
                target_slug = item.get("slug")
                break

    # Cuối cùng: Fallback
    if not target_slug and len(items) <= 3:
        target_slug = items[0].get("slug")
        
    if not target_slug:
        return []
        
    # 3. Get Detail
    detail_data = await ophim_get_detail(client, target_slug)
    
    # 4. Extract
    return extract_ophim_results(detail_data, media_type, season, episode)
