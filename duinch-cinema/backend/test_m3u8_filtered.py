import asyncio
import os
from app.services.m3u8_filter import M3U8AdFilter
import subprocess

async def test_filtered_download():
    m3u8_url = "https://s3.phim1280.tv/20240507/RKsuOm4s/2000kb/hls/index.m3u8"
    filter_service = M3U8AdFilter(base_url="https://s3.phim1280.tv")
    
    clean_m3u8 = "clean_index.m3u8"
    output_mp4 = "test_filtered.mp4"
    
    print("[*] Filtering ads and generating clean m3u8...")
    await filter_service.clean_playlist(m3u8_url, clean_m3u8)
    
    print("[*] Starting ffmpeg download with clean file...")
    # Thêm protocol_whitelist để ffmpeg có thể đọc link https từ file m3u8 cục bộ
    cmd = [
        "ffmpeg", "-y", 
        "-protocol_whitelist", "file,http,https,tcp,tls,crypto,data",
        "-i", clean_m3u8,
        "-c", "copy", "-bsf:a", "aac_adtstoasc",
        output_mp4
    ]
    
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in process.stdout:
        if "time=" in line:
            print(f"\r[Progress] {line.strip()}", end="")
    
    process.wait()
    print(f"\n[✓] Download finished: {output_mp4}")

if __name__ == "__main__":
    # Ensure current dir is backend for app imports
    import sys
    sys.path.append(os.getcwd())
    asyncio.run(test_filtered_download())
