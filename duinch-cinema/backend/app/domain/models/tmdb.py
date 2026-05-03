from typing import List, Dict, Optional, Any
from pydantic import BaseModel

class TMDBSeason(BaseModel):
    season_number: int
    episode_count: int
    year: int

class TMDBInfo(BaseModel):
    id: Optional[int] = None # RESTORE: Core ID
    tmdb_id: Optional[int] = None
    series_year: int = 0
    season_years: Dict[int, int] = {}
    tmdb_seasons: List[TMDBSeason] = []
    total_episodes: int = 0
    total_seasons: int = 0
    title: Optional[str] = None
    alternative_titles: List[str] = []

class TMDBSearchResult(BaseModel):
    id: int # MANDATORY
    tmdb_id: int
    title: str
    origin_name: Optional[str] = None
    year: str
    media_type: str
    poster: Optional[str] = None
    overview: Optional[str] = None
    source: str = "tmdb"
    slug: Optional[str] = None
