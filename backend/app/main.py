from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(), override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
from app.api.endpoints import search, media, recommended, downloader, proxy, monitor, detail, user, stream
from collections import deque
import time

# Global storage for recent requests
recent_requests = deque(maxlen=20)

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.http_client.aclose()

app = FastAPI(
    title="NexusStream API",
    description="Business-Logic focused API Architecture",
    version="4.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

@app.middleware("http")
async def log_requests(request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    
    # Don't log internal monitor/health pings to keep clean
    if "/api/monitor/health" not in request.url.path:
        recent_requests.append({
            "path": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "duration": f"{int(duration * 1000)}ms",
            "timestamp": time.strftime("%H:%M:%S")
        })
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(detail.router, prefix="/api", tags=["Detail"])   # /api/movie/:id  /api/tv/:id
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(media.router, prefix="/api/media", tags=["Media"])
app.include_router(recommended.router, prefix="/api", tags=["Recommended"])
app.include_router(downloader.router, prefix="/api/downloader", tags=["Downloader"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["Proxy"])
app.include_router(monitor.router, prefix="/api/monitor", tags=["Monitor"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(stream.router, prefix="/api/stream", tags=["Streaming"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8086, reload=True)
