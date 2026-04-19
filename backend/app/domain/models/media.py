from typing import List, Dict, Optional, Any, Union
from pydantic import BaseModel, Field
from enum import Enum

class MediaSourceType(str, Enum):
    M3U8 = "m3u8"
    FSHARE = "fshare"
    TORRENT = "torrent"
    GDRIVE = "gdrive"

class StreamingEpisode(BaseModel):
    type: str = "streamable"
    provider: str
    server: str
    name: str
    m3u8: Optional[str] = None
    embed: Optional[str] = None
    season: int = 1
    movie_name: Optional[str] = None
    slug: Optional[str] = None

class StreamingServerGroup(BaseModel):
    server: str
    episodes: List[StreamingEpisode]

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
    results: Union[List[StreamingServerGroup], List[DownloadableLink]]
    error: Optional[str] = None
