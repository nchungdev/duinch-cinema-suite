from m3u8downloader.main import M3u8Downloader
import sys

def test():
    downloader = M3u8Downloader(
        "https://s3.phim1280.tv/20240507/RKsuOm4s/index.m3u8",
        output_filename="test_output.mp4"
    )
    downloader.start()

if __name__ == "__main__":
    test()
