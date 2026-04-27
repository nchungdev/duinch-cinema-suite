# OMV JDownloader Dashboard API

Backend API for OMV media management and JDownloader duinch-cinema. Built with FastAPI and provides endpoints for media discovery, search, and download management.

## Requirements

- Python 3.9+
- FastAPI
- uvicorn
- httpx
- And other dependencies listed in `requirements.txt`

## Environment Variables

Create a `.env` file in the backend directory or set these via Docker Compose:

```env
MYJD_EMAIL=your-email@example.com
MYJD_PASSWORD=your-myjd-password
TMDB_READ_ACCESS_TOKEN=your-tmdb-api-token
STORAGE_PATH=/path/to/storage
JD_INTERNAL_PATH=/path/to/jd/downloads
```

**Note:** For Docker Compose, these are already configured in `docker-compose.yml` and override `.env` if it exists.

### Variable Descriptions

- `MYJD_EMAIL`: Email for MyJD account (myjd.jdownloader.org)
- `MYJD_PASSWORD`: Password for MyJD account
- `TMDB_READ_ACCESS_TOKEN`: TMDB API token for movie/TV metadata
- `STORAGE_PATH`: Local storage mount path (default: `/storage`)
- `JD_INTERNAL_PATH`: JDownloader internal path (default: `/downloads`)

## Setup for Local Development

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Create `.env` File

```bash
cat > .env << EOF
MYJD_EMAIL=your-email@example.com
MYJD_PASSWORD=your-password
TMDB_READ_ACCESS_TOKEN=your-tmdb-token
STORAGE_PATH=/Users/YOUR_USERNAME/omv-storage
JD_INTERNAL_PATH=/Users/YOUR_USERNAME/omv-downloads
EOF
```

### 3. Run the API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8086 --reload
```

The API will be available at `http://localhost:8086`

API documentation: `http://localhost:8086/docs`

## Docker Compose

Run the entire stack (backend + frontend):

```bash
docker-compose up -d
```

The backend will be accessible at `http://localhost:8086`

**Ensure environment variables are set before running:**

```bash
export MYJD_EMAIL="your-email@example.com"
export MYJD_PASSWORD="your-password"
export TMDB_READ_ACCESS_TOKEN="your-tmdb-token"
export HOST_STORAGE_PATH="/path/to/host/storage"
```

## API Endpoints

### Discovery

- `GET /api/discovery?category=new&page=1` - Get latest media
- `GET /api/discovery?category=phim-bo&page=1` - Get TV shows
- `GET /api/discovery?category=hoat-hinh&page=1` - Get anime

### Media Search & Lookup

- `GET /api/search?q=keyword&media_type=movie` - Search for media metadata (TMDB)
- `GET /api/lookup/sources?tmdb_id=123&media_type=movie&title=Name&year=2024` - Lookup streaming and download sources for a specific entity.

#### Lookup Sources Details

**Request Parameters:**
- `tmdb_id` (optional): The authoritative TMDB ID. If provided, lookup is strictly tied to this ID.
- `media_type` (required): `movie` or `tv`.
- `title` (required): The title to resolve if `tmdb_id` is missing.
- `year` (optional): The release year to refine resolution.
- `season` / `episode` (optional): For TV shows, filters results to specific content.

**Response Schema (Simplified):**
```json
{
  "sources": [
    {
      "provider": "kkphim",
      "links": [
        {
          "name": "Tập 01",
          "url": "https://...",
          "format": "m3u8",
          "server": "Vietsub #1",
          "season": 1,
          "episode": 1
        }
      ]
    }
  ],
  "metadata": {
    "title": "Official Title",
    "tmdb_id": 123,
    "media_type": "movie",
    "year": "2024",
    "poster": "https://...",
    "backdrop": "https://...",
    "overview": "Summary..."
  },
  "success": true
}
```

### Downloads

- `POST /api/downloads/start` - Start a download
- `GET /api/downloads/status` - Get download status

## Caching

The API uses in-memory caching with periodic persistence:

- Metadata cache (TMDB, KKPhim): 24 hours TTL
- Discovery cache: 1 hour TTL
- Cache files: `tmdb_cache.json`, `kkphim_cache.json`

Cache data is automatically saved:
- Every 5 seconds during operation
- On API shutdown

## Development Notes

- Cache is stored in-memory for speed, with file persistence every 5 seconds
- All API requests use async/await for better performance
- `.gitignore` excludes cache JSON files from version control

## Troubleshooting

### Missing environment variables

If you see errors about missing variables, ensure `.env` file is created and contains all required fields, or set them via shell:

```bash
export MYJD_EMAIL="..."
export MYJD_PASSWORD="..."
export TMDB_READ_ACCESS_TOKEN="..."
```

### Cache issues

If cache seems stale, look at `tmdb_cache.json` and `kkphim_cache.json`. These are gitignored and safe to delete to reset cache.

### API not responding

Ensure the API is running on port 8086 and check logs for errors:

```bash
# Check if port is in use
lsof -i :8086
```
