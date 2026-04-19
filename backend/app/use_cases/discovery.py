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
from app.infrastructure.cache.redis_cache import cache_manager

class DiscoveryUseCase:
    def __init__(self, http_client):
        self.client = http_client

    async def execute_task(self, tmdb_id, media_type, title, localize_title, year, season, episode, source_type, source, force, tmdb_info: TMDBInfo) -> DiscoveryTaskResult:
        """Run a single scraper and return standardized result."""
        
        # 1. Check Cache
        cache_key_season = season if season else 1
        if not force:
            cached_data = cache_manager.get_discovery(source, tmdb_id, cache_key_season)
            if cached_data:
                # Need to parse back into models if necessary, but returning as list of dicts/models is fine for SSE
                return DiscoveryTaskResult(source_type=source_type, source=source, results=cached_data)
        else:
            cache_manager.clear_discovery(tmdb_id, cache_key_season)

        clean_title = re.sub(r'\(.*?\)', '', title).strip()
        clean_localize = re.sub(r'\(.*?\)', '', localize_title).strip() if localize_title else None
        
        results = []
        try:
            if source_type == "m3u8":
                target_ep = None if media_type == "tv" else episode
                if source == "kkphim":
                    results = await lookup_kkphim(self.client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year, force=force, tmdb_info=tmdb_info)
                elif source == "ophim":
                    results = await lookup_ophim(self.client, tmdb_id, clean_title, clean_localize, media_type, season, target_ep, year, force=force, tmdb_info=tmdb_info)

            elif source_type == "fshare":
                if source == "timfshare":
                    results = await lookup_timfshare(clean_title, year=year, filter_title=clean_title, localize_title=clean_localize, media_type=media_type, tmdb_info=tmdb_info)

            elif source_type == "torrent":
                results = await lookup_torrent(clean_title, tmdb_id, media_type, None, None, str(year) if year else None, tmdb_info=tmdb_info)

            elif source_type == "gdrive":
                results = await lookup_gdrive(clean_title)

            # 3. Post-process and Cache
            final_results = []
            if source_type == "m3u8":
                # Group by Movie+Server+CDN Domain
                internal_groups = {}
                for r in results:
                    # r is a StreamingEpisode model
                    m_name = r.movie_name or "Movie"
                    srv = r.server or "Server"
                    m3u8 = r.m3u8 or ""
                    domain_match = re.search(r'https?://([^/]+)', m3u8)
                    domain = domain_match.group(1) if domain_match else "unknown"
                    
                    group_key = f"{source}:{m_name}:{srv}:{domain}"
                    if group_key not in internal_groups: internal_groups[group_key] = []
                    internal_groups[group_key].append(r)
                
                for eps in internal_groups.values():
                    provider = eps[0].provider
                    server_name = eps[0].server
                    display_name = f"[{provider}] {server_name}"
                    final_results.append(StreamingServerGroup(server=display_name, episodes=eps))
            else:
                # Results are list of DownloadableLink models
                final_results = results

            # Cache results (as list of dicts for simplicity in redis)
            if final_results:
                cache_manager.set_discovery(source, tmdb_id, cache_key_season, [r.dict(exclude_none=True) for r in final_results], ttl=3600 * 6)

            return DiscoveryTaskResult(source_type=source_type, source=source, results=final_results)

        except Exception as e:
            print(f"[DiscoveryUseCase] Error in {source_type}/{source}: {e}")
            return DiscoveryTaskResult(source_type=source_type, source=source, results=[], error=str(e))

    async def get_tmdb_info(self, media_type: str, tmdb_id: str) -> TMDBInfo:
        return await tmdb_get_info(self.client, media_type, tmdb_id)
