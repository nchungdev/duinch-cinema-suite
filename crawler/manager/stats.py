import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "user", "fshare_crawler.db")

def get_pipeline_stats():
    if not os.path.exists(DB_PATH):
        return {"raw_count": 0, "cooked_count": 0, "error": "DB not found"}

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        
        # 1. RAW Stats
        res_raw = conn.execute("SELECT COUNT(*) as cnt FROM raw_threads").fetchone()
        raw_count = res_raw['cnt']
        
        # 2. COOKED Stats
        res_cooked = conn.execute("SELECT COUNT(*) as cnt FROM fshare_links").fetchone()
        cooked_count = res_cooked['cnt']
        
        # 3. Quality Stats
        res_q = conn.execute("SELECT quality, COUNT(*) as cnt FROM fshare_links GROUP BY quality").fetchall()
        qualities = {r['quality']: r['cnt'] for r in res_q}
        
        return {
            "raw_count": raw_count,
            "cooked_count": cooked_count,
            "qualities": qualities
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    stats = get_pipeline_stats()
    print("\n" + "="*40)
    print("   📊 PIPELINE DASHBOARD STATS")
    print("="*40)
    print(f"  [RAW]   Total Threads Found:  {stats.get('raw_count', 0)}")
    print(f"  [COOKED] Total Links Mapped:   {stats.get('cooked_count', 0)}")
    print("-" * 40)
    print("  [QUALITY DISTRIBUTION]")
    for q, cnt in stats.get('qualities', {}).items():
        print(f"   - {q:<10} : {cnt}")
    print("="*40 + "\n")
