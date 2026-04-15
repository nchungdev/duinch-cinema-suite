from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(), override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
from app.api.endpoints import search, media, recommended, downloader, proxy
from app.services import cache_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.http_client.aclose()
    cache_manager.save_all_caches()

app = FastAPI(
    title="OMV JDownloader Dashboard API",
    description="Business-Logic focused API Architecture",
    version="4.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(media.router, prefix="/api/media", tags=["Media"])
app.include_router(recommended.router, prefix="/api/recommended", tags=["Recommended"])
app.include_router(downloader.router, prefix="/api/downloader", tags=["Downloader"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["Proxy"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8086, reload=True)
