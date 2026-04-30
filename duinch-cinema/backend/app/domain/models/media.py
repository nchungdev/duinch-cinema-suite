from typing import List, Dict, Optional, Any, Union
from pydantic import BaseModel, Field

class MediaInfo(BaseModel):
    id: str
    name: str

class ScraperEpisode(BaseModel):
    type: str = "streamable"
    provider: str
    server: str
    name: str
    m3u8: Optional[str] = None
    embed: Optional[str] = None
    season: Optional[int] = None
    movie_name: Optional[str] = None
    slug: Optional[str] = None
    year: Optional[int] = None

class StreamingEpisode(BaseModel):
    id: str
    name: str
    order: int
    m3u8: Optional[str] = None
    embed: Optional[str] = None

class StreamingServer(BaseModel):
    server_name: str
    audio_type: str = "Vietsub"
    episodes: List[StreamingEpisode]

class StreamingCollection(BaseModel):
    id: str
    collection_name: str
    order: int
    servers: List[StreamingServer]

class DownloadableLink(BaseModel):
    type: str = "downloadable"
    name: str
    url: str
    size: int = 0
    source: str
    is_folder: bool = False
    source_page: Optional[str] = None
    magnet: Optional[str] = None
    seeders: Optional[int] = None
    leechers: Optional[int] = None

class DiscoveryTaskResult(BaseModel):
    source_type: str
    source: str
    media_info: Optional[MediaInfo] = None
    results: Union[List[StreamingCollection], List[DownloadableLink]]
    error: Optional[str] = None
