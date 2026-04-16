import pytest
import httpx
from app.services.scrapers.kkphim_lookup import lookup_kkphim
from app.services.scrapers.ophim_lookup import lookup_ophim
from app.services.scrapers.gdrive_lookup import lookup_gdrive
from app.services.scrapers.torrent_lookup import lookup_torrent
from app.services.scrapers.thuviencine_lookup import lookup_thuviencine
from app.services.scrapers.google_search_lookup import lookup_google_fshare

@pytest.mark.asyncio
async def test_kkphim_provider():
    async with httpx.AsyncClient(timeout=25.0) as client:
        results = await lookup_kkphim(client, title="One Piece", media_type="tv", tmdb_id="37854")
        assert isinstance(results, list)
        if results:
            assert "name" in results[0]

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
async def test_fshare_google_provider():
    results = await lookup_google_fshare("One Piece")
    assert isinstance(results, list)
