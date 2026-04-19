import asyncio
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.use_cases.discovery import DiscoveryUseCase
from app.infrastructure.scrapers.fshare_lookup import resolve_fshare_url, lookup_timfshare
from app.domain.models.media import DiscoveryTaskResult, DownloadableLink

router = APIRouter()

DISCOVERY_SOURCES = [
    {"source_type": "m3u8",        "source": "kkphim"},
    {"source_type": "m3u8",        "source": "ophim"},
    {"source_type": "fshare",      "source": "timfshare"},
    {"source_type": "torrent",     "source": "default"},
    {"source_type": "gdrive",      "source": "googlesearch"}
]

@router.post("/test-timfshare", response_model=List[DownloadableLink], tags=["Test"])
async def test_timfshare_endpoint(
    request: Request,
    query: str = Query(..., description="Search keyword for TimFShare"),
    year: int = Query(None),
    filter_title: str = Query(None),
    media_type: str = Query("movie", description="movie or tv")
):
    """
    Directly test TimFShare API v1. 
    Returns grouped and sorted results for TV shows.
    """
    client = request.app.state.http_client
    results = await lookup_timfshare(query, year=year, filter_title=filter_title or query, media_type=media_type)
    
    if media_type == "tv":
        # Group and Sort by Season
        season_groups = {}
        for r in results:
            s_label = r.source_page if r.source_page else "Season 01"
            if s_label not in season_groups: season_groups[s_label] = []
            season_groups[s_label].append(r)
        
        final_sorted = []
        for s_label in sorted(season_groups.keys()):
            links = season_groups[s_label]
            links.sort(key=lambda x: x.name)
            final_sorted.extend(links)
        return final_sorted
        
    return results

@router.get("/stream")
async def discovery_stream(
    request: Request,
    tmdb_id: int = Query(None, description="TMDB ID of the movie/show"),
    media_type: str = Query("movie", description="movie or tv"),
    title: str = Query(..., description="Original/English title"),
    localize_title: str = Query(None, description="Localized/Vietnamese title"),
    year: str = Query(None, description="Release year"),
    season: int = Query(None, description="Season number (for TV)"),
    episode: int = Query(None, description="Episode number"),
    force: bool = Query(False, description="Bypass cache and force re-scan"),
):
    """
    Server-Sent Events (SSE) stream for real-time discovery results.
    Each event contains results from one provider.
    """
    client = request.app.state.http_client
    use_case = DiscoveryUseCase(client)
    tmdb_info = await use_case.get_tmdb_info(media_type, str(tmdb_id)) if tmdb_id else None
    
    print(f"\n[SSE] 🚀 Starting Discovery Stream for: {title} ({year}) | ID: {tmdb_id}")

    async def event_generator():
        tasks = [
            asyncio.create_task(use_case.execute_task(
                tmdb_id, media_type, title, localize_title, year, season, episode, 
                src["source_type"], src["source"], force, tmdb_info
            )) for src in DISCOVERY_SOURCES
        ]
        yield f"data: {json.dumps({'type': 'init', 'total_sources': len(tasks), 'sources': DISCOVERY_SOURCES})}\n\n"
        for completed_task in asyncio.as_completed(tasks):
            result = await completed_task
            yield f"data: {json.dumps({'type': 'result', 'data': result.dict(exclude_none=True)})}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/fetch")
async def discovery_fetch(
    request: Request,
    tmdb_id: int = Query(None),
    media_type: str = Query("movie"),
    title: str = Query(...),
    localize_title: str = Query(None),
    year: str = Query(None),
    season: int = Query(None),
    episode: int = Query(None),
    source_type: str = Query(...),
    source: str = Query(None),
    force: bool = Query(False),
):
    """Fetch results from a specific provider immediately."""
    client = request.app.state.http_client
    use_case = DiscoveryUseCase(client)
    tmdb_info = await use_case.get_tmdb_info(media_type, str(tmdb_id)) if tmdb_id else None
    result = await use_case.execute_task(
        tmdb_id, media_type, title, localize_title, year, season, episode, 
        source_type, source, force, tmdb_info
    )
    return {"data": result.dict(exclude_none=True), "error_code": 0, "error_msg": ""}

@router.get("/expand-folder")
async def folder_expand(request: Request, url: str, provider: str = "fshare"):
    """List all files within an FShare folder."""
    try:
        client = request.app.state.http_client
        if provider == "fshare":
            files = await resolve_fshare_url(url, client)
            return { "data": {"results": files}, "error_code": 0, "error_msg": "" }
        return { "data": None, "error_code": 400, "error_msg": "Not supported" }
    except Exception as e:
        return { "data": None, "error_code": 500, "error_msg": str(e) }
