from .forum_base import ForumScraperBase
from typing import List, Optional
from app.domain.models.media import DownloadableLink
from app.domain.models.tmdb import TMDBInfo
import asyncio

class TimFShareForumScraper(ForumScraperBase):
    def __init__(self):
        super().__init__("forum.timfshare.com", "TF-Forum")

class HDVietnamScraper(ForumScraperBase):
    def __init__(self):
        # Updated to .ai domain
        super().__init__("www.hdvietnam.ai", "HDVN")

class VozScraper(ForumScraperBase):
    def __init__(self):
        super().__init__("voz.vn", "Voz")

# Singleton instances
tf_forum = TimFShareForumScraper()
hdvn_forum = HDVietnamScraper()
voz_forum = VozScraper()

async def lookup_all_forums(query: str, tmdb_info: Optional[TMDBInfo] = None) -> List[DownloadableLink]:
    """Concurrent discovery across all supported forums using Native Search."""
    scrapers = [tf_forum, hdvn_forum, voz_forum]
    
    # Run all forum searches in parallel
    tasks = [s.lookup(query, tmdb_info) for s in scrapers]
    results = await asyncio.gather(*tasks)
    
    all_links = []
    for r_list in results:
        all_links.extend(r_list)
        
    return all_links
