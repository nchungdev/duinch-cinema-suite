import sqlite3
import os
import json
import subprocess
import tempfile
import asyncio
import httpx
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.use_cases.discovery import DiscoveryUseCase
from app.infrastructure.scrapers.fshare_lookup import resolve_fshare_url, lookup_timfshare
from app.domain.models.media import DiscoveryTaskResult, DownloadableLink
from app.services.response_wrapper import wrap_response
from app.services.m3u8_filter import M3U8AdFilter

router = APIRouter()

@router.get("/media/download-m3u8")
async def download_m3u8(url: str, filename: str = "video.mp4"):
    """Streams m3u8 to mp4 with parallel chunk downloading and ad filtering."""
    filter_service = M3U8AdFilter()
    clean_content = await filter_service.get_clean_content(url)

    async def stream_generator():
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".m3u8")
        tmp.write(clean_content.encode())
        tmp.close()

        # Note: HTTP options (-user_agent, -headers, -reconnect) are rejected by FFmpeg 8.x
        # when the input is a local file — only -protocol_whitelist is accepted globally.
        cmd = [
            "ffmpeg", "-y",
            "-protocol_whitelist", "file,http,https,tcp,tls,crypto,data",
            "-i", tmp.name,
            "-c", "copy", "-bsf:a", "aac_adtstoasc",
            "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1"
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Drain stderr concurrently — prevents pipe buffer deadlock when FFmpeg is verbose
        stderr_buf: list[bytes] = []
        async def _drain_stderr():
            while True:
                chunk = await process.stderr.read(4096)
                if not chunk:
                    break
                stderr_buf.append(chunk)

        stderr_task = asyncio.create_task(_drain_stderr())

        try:
            while True:
                chunk = await process.stdout.read(1024 * 256)
                if not chunk:
                    break
                yield chunk
        finally:
            await stderr_task
            if process.returncode not in (0, None):
                print(f"[FFmpeg] exit={process.returncode}\n" +
                      b"".join(stderr_buf).decode(errors="replace")[-3000:])
            if process.returncode is None:
                try:
                    process.terminate()
                    await process.wait()
                except Exception:
                    pass
            if os.path.exists(tmp.name):
                os.remove(tmp.name)

    # Chuẩn hóa tên file để tránh lỗi Unicode trong Header
    safe_filename = filename.replace('"', '').replace("'", "")
    from urllib.parse import quote
    encoded_filename = quote(safe_filename)

    return StreamingResponse(
        stream_generator(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Content-Type": "video/mp4",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache",
        }
    )

DISCOVERY_SOURCES = [
    {"source_type": "fshare",      "source": "indexed"},
    {"source_type": "m3u8",        "source": "kkphim"},
    {"source_type": "m3u8",        "source": "ophim"},
    {"source_type": "fshare",      "source": "timfshare"},
    {"source_type": "fshare",      "source": "forum"},
    {"source_type": "torrent",     "source": "default"},
    {"source_type": "gdrive",      "source": "googlesearch"}
]

@router.get("/media/stream")
async def discovery_stream(
    request: Request,
    tmdb_id: int = Query(None),
    media_type: str = Query("movie"),
    title: str = Query(...),
    localize_title: str = Query(None),
    year: str = Query(None),
    season: int = Query(None),
    episode: int = Query(None),
    force: bool = Query(False),
):
    """Server-Sent Events (SSE) stream for real-time discovery results."""
    client = request.app.state.http_client
    use_case = DiscoveryUseCase(client)
    tmdb_info = await use_case.get_tmdb_info(media_type, str(tmdb_id)) if tmdb_id else None
    
    async def event_generator():
        tasks = [
            asyncio.create_task(use_case.execute_task(
                tmdb_id, media_type, title, localize_title, year, season, episode, 
                src["source_type"], src["source"], force, tmdb_info
            )) for src in DISCOVERY_SOURCES
        ]
        yield f"data: {json.dumps({'type': 'init', 'total_sources': len(tasks), 'sources': DISCOVERY_SOURCES})}\n\n"
        for completed_task in asyncio.as_completed(tasks):
            try:
                result = await completed_task
                res_data = result.dict(exclude_none=True) if hasattr(result, "dict") else result
                yield f"data: {json.dumps({'type': 'result', 'data': res_data})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'result', 'data': {'error': str(e)}})}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/media/fetch")
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

    # Map source_type/source if user provided a provider name in source_type
    actual_source_type = source_type
    actual_source = source
    
    if not source:
        # If source is missing, check if source_type is actually a provider name
        for s in DISCOVERY_SOURCES:
            if s["source"] == source_type:
                actual_source_type = s["source_type"]
                actual_source = s["source"]
                break
    
    result = await use_case.execute_task(
        tmdb_id, media_type, title, localize_title, year, season, episode, 
        actual_source_type, actual_source, force, tmdb_info
    )
    return wrap_response(result.dict(exclude_none=True))

@router.get("/media/expand-folder")
async def folder_expand(request: Request, url: str, provider: str = "fshare"):
    """List all files within an FShare folder."""
    try:
        client = request.app.state.http_client
        if provider == "fshare":
            files = await resolve_fshare_url(url, client)
            return wrap_response({"results": files})
        return wrap_response(error_code=400, error_message="Not supported")
    except Exception as e:
        return wrap_response(error_code=500, error_message=str(e))
