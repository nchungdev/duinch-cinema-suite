from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
from app.api.endpoints import discovery, media, download

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize global async client for services
    app.state.http_client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.http_client.aclose()

app = FastAPI(
    title="OMV JDownloader Dashboard API",
    description="Modular API for OMV media management",
    version="2.0.0",
    lifespan=lifespan
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(discovery.router, tags=["Discovery"])
app.include_router(media.router, tags=["Media"])
app.include_router(download.router, tags=["Downloads"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8086, reload=True)
