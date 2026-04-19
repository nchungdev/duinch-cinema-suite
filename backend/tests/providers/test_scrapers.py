import pytest
import httpx
from app.infrastructure.scrapers.kkphim_lookup import lookup_kkphim
from app.infrastructure.scrapers.ophim_lookup import lookup_ophim
from app.infrastructure.scrapers.gdrive_lookup import lookup_gdrive
from app.infrastructure.scrapers.torrent_lookup import lookup_torrent
from app.infrastructure.scrapers.fshare_lookup import lookup_timfshare

@pytest.mark.asyncio
async def test_kkphim_provider():
    async with httpx.AsyncClient(timeout=25.0) as client:
        results = await lookup_kkphim(client, title="One Piece", media_type="tv", tmdb_id="37854")
        assert isinstance(results, list)
        if results:
            assert "name" in results[0]

@pytest.mark.asyncio
async def test_kkphim_provider_merges_split_seasons():
    async with httpx.AsyncClient(timeout=25.0) as client:
        results = await lookup_kkphim(client, title="The Boys", media_type="tv", tmdb_id="76479")
        assert isinstance(results, list)
        if results:
            seasons = {item.get("season") for item in results if item.get("season") is not None}
            assert len(seasons) > 1

@pytest.mark.asyncio
async def test_ophim_provider():
    async with httpx.AsyncClient(timeout=25.0) as client:
        results = await lookup_ophim(client, tmdb_id=37854, title="One Piece", media_type="tv")
        assert isinstance(results, list)
        if results:
            assert "name" in results[0]

@pytest.mark.asyncio
async def test_torrent_provider():
    results = await lookup_torrent("One Piece")
    assert isinstance(results, list)

@pytest.mark.asyncio
async def test_gdrive_provider():
    results = await lookup_gdrive("One Piece")
    assert isinstance(results, list)

@pytest.mark.asyncio
async def test_fshare_timfshare_provider():
    results = await lookup_timfshare("One Piece")
    assert isinstance(results, list)
