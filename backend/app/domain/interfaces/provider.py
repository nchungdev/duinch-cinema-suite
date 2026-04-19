from abc import ABC, abstractmethod
from typing import List, Optional, Any
import httpx
from app.domain.models.media import StreamingEpisode, DownloadableLink
from app.domain.models.tmdb import TMDBInfo

class MediaProviderPort(ABC):
    @abstractmethod
    async def lookup(
        self,
        client: httpx.AsyncClient,
        tmdb_id: Optional[Any] = None,
        title: Optional[str] = None,
        localize_title: Optional[str] = None,
        media_type: str = "movie",
        season: int = 1,
        episode: Optional[int] = None,
        year: Optional[int] = None,
        force: bool = False,
        tmdb_info: Optional[TMDBInfo] = None
    ) -> List[Any]:
        pass
