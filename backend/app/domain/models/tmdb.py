from typing import List, Dict, Optional, Any
from pydantic import BaseModel

class TMDBSeason(BaseModel):
    season_number: int
    episode_count: int
    year: int

class TMDBInfo(BaseModel):
    series_year: int = 0
    season_years: Dict[int, int] = {}
    tmdb_seasons: List[TMDBSeason] = []
    total_episodes: int = 0
    total_seasons: int = 0
    title: Optional[str] = None
