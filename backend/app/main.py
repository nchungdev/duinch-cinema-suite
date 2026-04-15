from dotenv import load_dotenv, find_dotenv

# PHẢI load trước khi import bất kỳ app module nào,
# vì config.py evaluate os.getenv() tại thời điểm import.
load_dotenv(find_dotenv(), override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
from app.api.endpoints import media, download, tmdb, proxy
from app.services import cache_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize global async client for services
    app.state.http_client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.http_client.aclose()
    cache_manager.save_all_caches()

app = FastAPI(
    title="OMV JDownloader Dashboard API",
    description="Modular API for OMV media management",
    version="2.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(media.router, prefix="/api", tags=["Media"])
app.include_router(download.router, prefix="/api", tags=["Downloads"])
app.include_router(tmdb.router, prefix="/api/tmdb", tags=["TMDB"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["Proxy"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8086, reload=True)
