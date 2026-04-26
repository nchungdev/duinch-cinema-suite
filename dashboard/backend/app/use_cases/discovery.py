import asyncio
import re
from typing import List, Dict, Any, Optional, AsyncGenerator
import json

from app.domain.models.media import DiscoveryTaskResult, StreamingServerGroup, StreamingEpisode, DownloadableLink
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
        cache_key_season = season if season else 1
        if not force:
            cached_data = cache_manager.get_discovery(source, tmdb_id, cache_key_season)
            if cached_data:
                return DiscoveryTaskResult(source_type=source_type, source=source, results=cached_data)
        else:
            cache_manager.clear_discovery(tmdb_id, cache_key_season)

        clean_title = re.sub(r'\(.*?\)', '', title).strip()
        clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None
        
        results = []
        try:
            # 2. Execution logic
            if source_type == "m3u8":
                target_ep = None if media_type == "tv" else episode
                if source == "kkphim":
                    results = await lookup_kkphim(self.client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year, force=force, tmdb_info=tmdb_info)
                elif source == "ophim":
                    results = await lookup_ophim(self.client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year, force=force, tmdb_info=tmdb_info)

            elif source_type == "fshare":
                if source == "timfshare" and media_type == "movie":
                    # TimFShare API is for Movies (individual files)
                    results = await lookup_timfshare(clean_title, year=year, filter_title=clean_title, localize_title=clean_localize, media_type=media_type, tmdb_info=tmdb_info)
                elif source == "forum":
                    # Forum Miner: Best for Folders and TV Series Collections
                    results = await lookup_all_forums(clean_title, tmdb_info=tmdb_info)
                elif source == "indexed":
                    # Pre-crawled/indexed FShare links from Private Crawler
                    results = fshare_repo.get_links_by_tmdb_id(str(tmdb_id))

            elif source_type == "torrent":
                results = await lookup_torrent(clean_title, tmdb_id, media_type, None, None, str(year) if year else None, tmdb_info=tmdb_info)

            elif source_type == "gdrive":
                results = await lookup_gdrive(clean_title)

            # 3. Post-process (Grouping)
            final_results = []
            if source_type == "m3u8":
                internal_groups = {}
                series_start = tmdb_info.series_year if tmdb_info else (int(year) if year else 0)
                is_anime_search = series_start > 0 and series_start < 2010

                for r in results:
                    m_name, srv = (r.movie_name or "Movie").lower(), (r.server or "Server")
                    
                    # 1. Year Guard: Prevent 2023 matching 1999
                    r_year = int(getattr(r, 'year', 0) or 0)
                    if r_year > 0 and series_start > 0 and abs(r_year - series_start) > 2:
                        continue
                    
                    # 2. Keyword Guard: Prevent 'Live Action' leaking into Anime search
                    if is_anime_search and "live action" in m_name:
                        continue

                    m3u8 = r.m3u8 or ""
                    domain_match = re.search(r'https?://([^/]+)', m3u8)
                    domain = domain_match.group(1) if domain_match else "unknown"
                    group_key = f"{source}:{m_name}:{srv}:{domain}"
                    if group_key not in internal_groups: internal_groups[group_key] = []
                    internal_groups[group_key].append(r)
                
                for eps in internal_groups.values():
                    display_name = f"[{eps[0].provider}] {eps[0].server}"
                    final_results.append(StreamingServerGroup(server=display_name, episodes=eps))
            else:
                final_results = results

            # 4. Cache
            if final_results:
                cache_manager.set_discovery(source, tmdb_id, cache_key_season, [r.dict(exclude_none=True) for r in (final_results if isinstance(final_results, list) else [])], ttl=3600 * 6)

            return DiscoveryTaskResult(source_type=source_type, source=source, results=final_results)

        except Exception as e:
            print(f"[DiscoveryUseCase] Error in {source_type}/{source}: {e}")
            return DiscoveryTaskResult(source_type=source_type, source=source, results=[], error=str(e))

    async def get_tmdb_info(self, media_type: str, tmdb_id: str) -> TMDBInfo:
        return await tmdb_get_info(self.client, media_type, tmdb_id)
