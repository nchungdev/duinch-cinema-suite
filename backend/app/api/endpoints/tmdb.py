"""
TMDB API wrapper endpoints.
Tất cả các TMDB calls đều đi qua đây, caching + error handling chuẩn.
"""
from fastapi import APIRouter, Request, Query
from app.core import config
from app.services import cache_manager
import urllib.parse

router = APIRouter()

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMG = "https://image.tmdb.org/t/p"


def _headers():
    return {
        "Authorization": f"Bearer {config.TMDB_READ_ACCESS_TOKEN}",
        "accept": "application/json",
    }


def _fmt_item(item: dict, media_type: str = None) -> dict:
    """Normalize TMDB item sang format chung."""
    mt = media_type or item.get("media_type", "movie")
    poster = item.get("poster_path")
    backdrop = item.get("backdrop_path")
    return {
        "tmdb_id": item.get("id"),
        "media_type": mt,
        "title": item.get("title") or item.get("name"),
        "origin_name": item.get("original_title") or item.get("original_name"),
        "overview": item.get("overview"),
        "year": (item.get("release_date") or item.get("first_air_date") or "")[:4],
        "rating": item.get("vote_average"),
        "vote_count": item.get("vote_count"),
        "poster": f"{TMDB_IMG}/w500{poster}" if poster else None,
        "backdrop": f"{TMDB_IMG}/original{backdrop}" if backdrop else None,
        "popularity": item.get("popularity"),
        "genre_ids": item.get("genre_ids", []),
    }


async def _tmdb_get(client, path: str, params: dict = None):
    """Generic TMDB GET, returns parsed JSON hoặc None nếu lỗi."""
    try:
        url = f"{TMDB_BASE}{path}"
        resp = await client.get(url, headers=_headers(), params=params or {})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


# ────────────────────────────────────────────
# GET /api/tmdb/search
# ────────────────────────────────────────────
@router.get("/search")
async def tmdb_search(
    request: Request,
    query: str = Query(..., min_length=1),
    media_type: str = Query("all", description="all | movie | tv"),
    page: int = Query(1, ge=1),
    language: str = Query("vi-VN"),
):
    """Search phim/TV qua TMDB."""
    client = request.app.state.http_client
    cache_key = f"tmdb_search_{media_type}_{urllib.parse.quote(query)}_{page}_{language}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

    if media_type == "all":
        data = await _tmdb_get(client, "/search/multi", {
            "query": query, "include_adult": "false",
            "language": language, "page": page,
        })
        results = [
            _fmt_item(i)
            for i in data.get("results", [])
            if i.get("media_type") in ("movie", "tv")
        ]
    else:
        data = await _tmdb_get(client, f"/search/{media_type}", {
            "query": query, "include_adult": "false",
            "language": language, "page": page,
        })
        results = [_fmt_item(i, media_type) for i in data.get("results", [])]

    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = {
        "results": results,
        "page": data.get("page", page),
        "total_pages": data.get("total_pages", 1),
        "total_results": data.get("total_results", len(results)),
        "success": True,
    }
    if results:
        cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp


# ────────────────────────────────────────────
# GET /api/tmdb/upcoming
# ────────────────────────────────────────────
@router.get("/upcoming")
async def tmdb_upcoming(
    request: Request,
    page: int = Query(1, ge=1),
    language: str = Query("vi-VN"),
    region: str = Query("VN"),
):
    """Phim sắp chiếu."""
    client = request.app.state.http_client
    cache_key = f"tmdb_upcoming_{page}_{language}_{region}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached:
        return cached

    data = await _tmdb_get(client, "/movie/upcoming", {
        "language": language, "page": page, "region": region,
    })
    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = {
        "results": [_fmt_item(i, "movie") for i in data.get("results", [])],
        "page": data.get("page", page),
        "total_pages": data.get("total_pages", 1),
        "dates": data.get("dates"),
        "success": True,
    }
    cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp


# ────────────────────────────────────────────
# GET /api/tmdb/movies
# category: popular | top_rated | now_playing | upcoming
# ────────────────────────────────────────────
@router.get("/movies")
async def tmdb_movies(
    request: Request,
    category: str = Query("popular", description="popular | top_rated | now_playing | upcoming"),
    page: int = Query(1, ge=1),
    language: str = Query("vi-VN"),
):
    """Danh sách phim theo category."""
    valid = {"popular", "top_rated", "now_playing", "upcoming"}
    if category not in valid:
        return {"error": f"category phải là một trong: {', '.join(valid)}", "success": False}

    client = request.app.state.http_client
    cache_key = f"tmdb_movies_{category}_{page}_{language}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached:
        return cached

    data = await _tmdb_get(client, f"/movie/{category}", {"language": language, "page": page})
    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = {
        "results": [_fmt_item(i, "movie") for i in data.get("results", [])],
        "page": data.get("page", page),
        "total_pages": data.get("total_pages", 1),
        "category": category,
        "success": True,
    }
    cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp


# ────────────────────────────────────────────
# GET /api/tmdb/tvs
# category: popular | top_rated | on_the_air | airing_today
# ────────────────────────────────────────────
@router.get("/tvs")
async def tmdb_tvs(
    request: Request,
    category: str = Query("popular", description="popular | top_rated | on_the_air | airing_today"),
    page: int = Query(1, ge=1),
    language: str = Query("vi-VN"),
):
    """Danh sách TV shows theo category."""
    valid = {"popular", "top_rated", "on_the_air", "airing_today"}
    if category not in valid:
        return {"error": f"category phải là một trong: {', '.join(valid)}", "success": False}

    client = request.app.state.http_client
    cache_key = f"tmdb_tvs_{category}_{page}_{language}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached:
        return cached

    data = await _tmdb_get(client, f"/tv/{category}", {"language": language, "page": page})
    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = {
        "results": [_fmt_item(i, "tv") for i in data.get("results", [])],
        "page": data.get("page", page),
        "total_pages": data.get("total_pages", 1),
        "category": category,
        "success": True,
    }
    cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp


# ────────────────────────────────────────────
# GET /api/tmdb/movie/{tmdb_id}
# ────────────────────────────────────────────
@router.get("/movie/{tmdb_id}")
async def tmdb_movie_detail(
    request: Request,
    tmdb_id: int,
    language: str = Query("vi-VN"),
    append: str = Query(
        "credits,videos,similar,recommendations,release_dates",
        description="append_to_response fields",
    ),
):
    """Chi tiết phim từ TMDB."""
    client = request.app.state.http_client
    cache_key = f"tmdb_movie_detail_{tmdb_id}_{language}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

    data = await _tmdb_get(client, f"/movie/{tmdb_id}", {
        "language": language, "append_to_response": append,
    })
    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = _build_movie_detail(data)
    resp["success"] = True
    cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp


def _build_movie_detail(data: dict) -> dict:
    poster = data.get("poster_path")
    backdrop = data.get("backdrop_path")

    # Extract cast (top 10)
    cast = []
    for c in data.get("credits", {}).get("cast", [])[:10]:
        cast.append({
            "name": c.get("name"),
            "character": c.get("character"),
            "profile": f"{TMDB_IMG}/w185{c['profile_path']}" if c.get("profile_path") else None,
        })

    # Trailers (YouTube only)
    trailers = [
        {"key": v["key"], "name": v["name"], "site": v["site"]}
        for v in data.get("videos", {}).get("results", [])
        if v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser")
    ]

    return {
        "tmdb_id": data.get("id"),
        "media_type": "movie",
        "title": data.get("title"),
        "origin_name": data.get("original_title"),
        "tagline": data.get("tagline"),
        "overview": data.get("overview"),
        "year": (data.get("release_date") or "")[:4],
        "release_date": data.get("release_date"),
        "runtime": data.get("runtime"),
        "rating": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "poster": f"{TMDB_IMG}/w500{poster}" if poster else None,
        "backdrop": f"{TMDB_IMG}/original{backdrop}" if backdrop else None,
        "genres": [g["name"] for g in data.get("genres", [])],
        "status": data.get("status"),
        "original_language": data.get("original_language"),
        "budget": data.get("budget"),
        "revenue": data.get("revenue"),
        "cast": cast,
        "trailers": trailers,
        "similar": [_fmt_item(i, "movie") for i in data.get("similar", {}).get("results", [])[:6]],
        "recommendations": [_fmt_item(i, "movie") for i in data.get("recommendations", {}).get("results", [])[:6]],
    }


# ────────────────────────────────────────────
# GET /api/tmdb/tv/{tmdb_id}
# ────────────────────────────────────────────
@router.get("/tv/{tmdb_id}")
async def tmdb_tv_detail(
    request: Request,
    tmdb_id: int,
    language: str = Query("vi-VN"),
    append: str = Query(
        "credits,videos,similar,recommendations,content_ratings",
        description="append_to_response fields",
    ),
):
    """Chi tiết TV show từ TMDB."""
    client = request.app.state.http_client
    cache_key = f"tmdb_tv_detail_{tmdb_id}_{language}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.METADATA_CACHE_EXPIRE)
    if cached:
        return cached

    data = await _tmdb_get(client, f"/tv/{tmdb_id}", {
        "language": language, "append_to_response": append,
    })
    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = _build_tv_detail(data)
    resp["success"] = True
    cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp


def _build_tv_detail(data: dict) -> dict:
    poster = data.get("poster_path")
    backdrop = data.get("backdrop_path")

    cast = []
    for c in data.get("credits", {}).get("cast", [])[:10]:
        cast.append({
            "name": c.get("name"),
            "character": c.get("character"),
            "profile": f"{TMDB_IMG}/w185{c['profile_path']}" if c.get("profile_path") else None,
        })

    trailers = [
        {"key": v["key"], "name": v["name"], "site": v["site"]}
        for v in data.get("videos", {}).get("results", [])
        if v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser")
    ]

    seasons = [
        {
            "season_number": s.get("season_number"),
            "name": s.get("name"),
            "episode_count": s.get("episode_count"),
            "air_date": s.get("air_date"),
            "poster": f"{TMDB_IMG}/w300{s['poster_path']}" if s.get("poster_path") else None,
        }
        for s in data.get("seasons", [])
        if s.get("season_number", 0) > 0  # bỏ Specials (season 0)
    ]

    return {
        "tmdb_id": data.get("id"),
        "media_type": "tv",
        "title": data.get("name"),
        "origin_name": data.get("original_name"),
        "tagline": data.get("tagline"),
        "overview": data.get("overview"),
        "year": (data.get("first_air_date") or "")[:4],
        "first_air_date": data.get("first_air_date"),
        "last_air_date": data.get("last_air_date"),
        "rating": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "poster": f"{TMDB_IMG}/w500{poster}" if poster else None,
        "backdrop": f"{TMDB_IMG}/original{backdrop}" if backdrop else None,
        "genres": [g["name"] for g in data.get("genres", [])],
        "status": data.get("status"),
        "original_language": data.get("original_language"),
        "number_of_seasons": data.get("number_of_seasons"),
        "number_of_episodes": data.get("number_of_episodes"),
        "seasons": seasons,
        "cast": cast,
        "trailers": trailers,
        "similar": [_fmt_item(i, "tv") for i in data.get("similar", {}).get("results", [])[:6]],
        "recommendations": [_fmt_item(i, "tv") for i in data.get("recommendations", {}).get("results", [])[:6]],
        "networks": [n.get("name") for n in data.get("networks", [])],
    }


# ────────────────────────────────────────────
# GET /api/tmdb/recommend/{media_type}/{tmdb_id}
# ────────────────────────────────────────────
@router.get("/recommend/{media_type}/{tmdb_id}")
async def tmdb_recommend(
    request: Request,
    media_type: str,
    tmdb_id: int,
    page: int = Query(1, ge=1),
    language: str = Query("vi-VN"),
):
    """Phim/TV được recommend dựa trên một title cụ thể."""
    if media_type not in ("movie", "tv"):
        return {"error": "media_type phải là 'movie' hoặc 'tv'", "success": False}

    client = request.app.state.http_client
    cache_key = f"tmdb_recommend_{media_type}_{tmdb_id}_{page}_{language}"
    cached = cache_manager.get_from_cache(config.TMDB_CACHE, cache_key, config.DISCOVERY_CACHE_EXPIRE)
    if cached:
        return cached

    data = await _tmdb_get(client, f"/{media_type}/{tmdb_id}/recommendations", {
        "language": language, "page": page,
    })
    if "error" in data:
        return {"error": data["error"], "success": False}

    resp = {
        "results": [_fmt_item(i, media_type) for i in data.get("results", [])],
        "page": data.get("page", page),
        "total_pages": data.get("total_pages", 1),
        "success": True,
    }
    cache_manager.set_to_cache(config.TMDB_CACHE, cache_key, resp)
    return resp
