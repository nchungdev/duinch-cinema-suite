from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(), override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
from app.api.endpoints import search, media, recommended, downloader, proxy, monitor, user, stream, detail
from app.services import cache_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.http_client.aclose()
    cache_manager.save_all_caches()

app = FastAPI(
    title="Duinch Cinema Suite API",
    version="4.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api", tags=["Search"])
app.include_router(media.router, prefix="/api", tags=["Media"])
app.include_router(recommended.router, prefix="/api", tags=["Recommended"])
app.include_router(detail.router, prefix="/api", tags=["Detail"])
app.include_router(downloader.router, prefix="/api/downloader", tags=["Downloader"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["Proxy"])
app.include_router(monitor.router, prefix="/api/monitor", tags=["Monitor"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(stream.router, prefix="/api/stream", tags=["Stream"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8086, reload=True)
