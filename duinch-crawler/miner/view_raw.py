import sqlite3
import json
import os
import sys
from datetime import datetime

# Path to shared DB
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "user", "fshare_crawler.db")

def view_data(limit=10):
    if not os.path.exists(DB_PATH):
        print(f"[!] Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM raw_threads ORDER BY scraped_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()

    print("\n" + "="*80)
    print(f"{'SOURCE':<10} | {'LINKS':<5} | {'TITLE'}")
    print("-" * 80)

    for row in rows:
        links = json.loads(row['raw_links'])
        title = (row['title'][:60] + '..') if len(row['title']) > 60 else row['title']
        print(f"{row['source']:<10} | {len(links):<5} | {title}")

    print("="*80)
    print(f"Showing {len(rows)} most recent raw threads.")
    print("Run with: python3 miner/view_raw.py [limit]")

if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    view_data(limit)
