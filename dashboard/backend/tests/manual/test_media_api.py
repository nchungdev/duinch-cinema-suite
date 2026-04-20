import httpx
import asyncio
import json
import sys

async def test_media_detail():
    print("\n--- Testing API: /api/tv/76479 ---")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get("http://localhost:8086/api/tv/76479")
            data = resp.json()
            if "data" in data and "metadata" in data["data"]:
                print("[OK] Detail API is working.")
                return True
            else:
                print(f"[FAIL] Wrong structure: {data.keys()}")
                return False
        except Exception as e:
            print(f"[ERROR] Connection failed: {e}")
            return False

async def test_discovery():
    print("\n--- Testing API: Discovery ---")
    params = {
        "tmdb_id": 76479, "media_type": "tv", "title": "The Boys",
        "source_type": "m3u8", "source": "kkphim", "season": 1, "episode": 1
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get("http://localhost:8086/api/media/discovery", params=params)
            data = resp.json()
            if "data" in data and "results" in data["data"]:
                print("[OK] Discovery API is working.")
                return True
            else:
                print(f"[FAIL] Discovery structure wrong: {data.keys()}")
                return False
        except Exception as e:
            print(f"[ERROR] Discovery failed: {e}")
            return False

async def run_all():
    s1 = await test_media_detail()
    s2 = await test_discovery()
    if not s1 or not s2:
        sys.exit(1) # THOÁT VỚI LỖI
    sys.exit(0)

if __name__ == "__main__":
    asyncio.run(run_all())
