import asyncio
import re
from typing import List, Dict, Any, Optional, AsyncGenerator
import json

from app.domain.models.media import DiscoveryTaskResult, StreamingCollection, StreamingServer, StreamingEpisode, DownloadableLink, MediaInfo, ScraperEpisode
from app.domain.models.tmdb import TMDBInfo
from app.infrastructure.scrapers.phimapi_base import tmdb_get_info
from app.infrastructure.scrapers.kkphim_lookup import lookup_kkphim
from app.infrastructure.scrapers.ophim_lookup import lookup_ophim
from app.infrastructure.scrapers.fshare_lookup import lookup_timfshare
from app.infrastructure.scrapers.torrent_lookup import lookup_torrent
from app.infrastructure.scrapers.gdrive_lookup import lookup_gdrive
from app.infrastructure.scrapers.forum_scrapers import lookup_all_forums
from app.infrastructure.persistence.fshare_repo import fshare_repo
from app.infrastructure.cache.redis_cache import cache_manager

class DiscoveryUseCase:
    def __init__(self, http_client):
        self.client = http_client

    async def execute_task(self, tmdb_id, media_type, title, localize_title, year, season, episode, source_type, source, force, tmdb_info: TMDBInfo) -> DiscoveryTaskResult:
        """Run a single scraper and return standardized results."""
        
        # 1. Check Cache
        # For TV shows, we now use a global cache key (season=0) to store results for all seasons
        cache_key_season = 0 if media_type == 'tv' else (season if season else 1)
        
        if not force:
            cached_data = cache_manager.get_discovery(source, tmdb_id, cache_key_season)
            if cached_data:
                clean_name = localize_title or title
                if tmdb_info and tmdb_info.title:
                    clean_name = tmdb_info.title
                return DiscoveryTaskResult(
                    source_type=source_type, 
                    source=source, 
                    media_info=MediaInfo(id=str(tmdb_id), name=clean_name),
                    results=cached_data
                )
        else:
            # Clear all relevant cache keys
            cache_manager.clear_discovery(tmdb_id, 0)
            cache_manager.clear_discovery(tmdb_id, 1)
            if season: cache_manager.clear_discovery(tmdb_id, season)

        clean_title = re.sub(r'\(.*?\)', '', title).strip()
        clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None
        
        results = []
        try:
            # 2. Execution logic
            if source_type == "m3u8":
                # For TV, we search for all seasons at once (season=None)
                search_season = None if media_type == "tv" else season
                target_ep = None if media_type == "tv" else episode
                
                if source == "kkphim":
                    results = await lookup_kkphim(self.client, tmdb_id, clean_title, clean_localize, media_type, search_season, target_ep, year, force=force, tmdb_info=tmdb_info)
                elif source == "ophim":
                    results = await lookup_ophim(self.client, tmdb_id, clean_title, clean_localize, media_type, search_season, target_ep, year, force=force, tmdb_info=tmdb_info)

            elif source_type == "fshare":
                if source == "timfshare" and media_type == "movie":
                    results = await lookup_timfshare(clean_title, year=year, filter_title=clean_title, localize_title=clean_localize, media_type=media_type, tmdb_info=tmdb_info)
                elif source == "forum":
                    results = await lookup_all_forums(clean_title, tmdb_info=tmdb_info)
                elif source == "indexed":
                    results = fshare_repo.get_links_by_tmdb_id(str(tmdb_id))

            elif source_type == "torrent":
                results = await lookup_torrent(clean_title, tmdb_id, media_type, None, None, str(year) if year else None, tmdb_info=tmdb_info)

            elif source_type == "gdrive":
                results = await lookup_gdrive(clean_title)

            # 3. Post-process (Grouping into Single Schema)
            final_results = []
            m_info = None

            if source_type == "m3u8":
                # Intermediate storage: collection_id -> { meta, servers: { server_key -> [streams] } }
                collections_map = {}
                
                series_start = tmdb_info.series_year if tmdb_info else (int(year) if year else 0)
                is_anime_search = series_start > 0 and series_start < 2010

                for r in results:
                    # Basic metadata for the whole task (taken from first valid result)
                    if not m_info:
                        clean_name = localize_title or title
                        if tmdb_info and tmdb_info.title:
                            clean_name = tmdb_info.title
                        m_info = MediaInfo(id=str(tmdb_id), name=clean_name)

                    m_name = (r.movie_name or "").lower()
                    
                    # 1. Year Guard: Prevent 2023 matching 1999
                    r_year = int(getattr(r, 'year', 0) or 0)
                    if r_year > 0 and series_start > 0 and abs(r_year - series_start) > 2:
                        # If year is wildly different, check if it might match a later season
                        matches_any_season = any(abs(r_year - y) <= 1 for y in tmdb_info.season_years.values() if y > 0)
                        if not matches_any_season:
                            continue
                    
                    # 2. Keyword Guard: Prevent 'Live Action' leaking into Anime search
                    if is_anime_search and "live action" in m_name:
                        continue

                    # 3. Determine Collection (Season for TV, "Bản Chính" for Movie)
                    is_tv = media_type == "tv"
                    sn = r.season
                    
                    if is_tv:
                        # For TV, prioritize detected season, fallback to 1 only if we're sure it's a series result
                        effective_sn = sn if sn is not None else 1
                        c_id = f"col_{effective_sn}"
                        c_name = f"Phần {effective_sn}"
                        c_order = effective_sn
                    else:
                        c_id = "col_movie_1"
                        c_name = "Bản Chính"
                        c_order = 1
                    
                    if c_id not in collections_map:
                        collections_map[c_id] = {
                            "id": c_id,
                            "name": c_name,
                            "order": c_order,
                            "servers": {}
                        }
                    
                    # 2. Determine Server & Audio Type
                    raw_srv = r.server or "Server"
                    audio = "Lồng Tiếng" if "lồng tiếng" in raw_srv.lower() else "Vietsub"
                    srv_clean = raw_srv.replace("(Vietsub)", "").replace("(Lồng Tiếng)", "").strip()
                    srv_key = f"{srv_clean}|{audio}"
                    
                    if srv_key not in collections_map[c_id]["servers"]:
                        collections_map[c_id]["servers"][srv_key] = []
                    
                    # 3. Create Episode
                    ep_name = r.name or "Full"
                    ep_num = 1
                    epm = re.search(r'\d+', ep_name)
                    if epm: ep_num = int(epm.group())

                    collections_map[c_id]["servers"][srv_key].append(StreamingEpisode(
                        id=f"str_{c_id}_{len(collections_map[c_id]['servers'][srv_key])}",
                        name=ep_name,
                        order=ep_num,
                        m3u8=r.m3u8,
                        embed=r.embed
                    ))

                # Build final hierarchical structure
                for c_data in sorted(collections_map.values(), key=lambda x: x["order"], reverse=False):
                    servers = []
                    for srv_key, episodes in c_data["servers"].items():
                        srv_name, audio_type = srv_key.split("|")
                        # Sort episodes by order
                        sorted_eps = sorted(episodes, key=lambda x: x.order)
                        servers.append(StreamingServer(
                            server_name=f"[{source.upper()}] {srv_name}",
                            audio_type=audio_type,
                            episodes=sorted_eps
                        ))
                    
                    final_results.append(StreamingCollection(
                        id=c_data["id"],
                        collection_name=c_data["name"],
                        order=c_data["order"],
                        servers=servers
                    ))
            else:
                final_results = results

            # 4. Cache
            res_obj = DiscoveryTaskResult(
                source_type=source_type, 
                source=source, 
                media_info=m_info,
                results=final_results
            )
            
            if final_results:
                # Handle both Pydantic objects and plain dicts
                results_data = [
                    r.dict(exclude_none=True) if hasattr(r, 'dict') else r 
                    for r in final_results
                ]
                cache_manager.set_discovery(source, tmdb_id, cache_key_season, results_data, ttl=3600 * 6)

            return res_obj

        except Exception as e:
            return DiscoveryTaskResult(source_type=source_type, source=source, results=[], error=str(e))

    async def get_tmdb_info(self, media_type: str, tmdb_id: str) -> TMDBInfo:
        return await tmdb_get_info(self.client, media_type, tmdb_id)
