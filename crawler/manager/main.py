import os
import subprocess
import argparse
import sys
from apscheduler.schedulers.blocking import BlockingScheduler
from stats import get_pipeline_stats

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def run_miner(pages=1):
    print(f"\n[MANAGER] ⛏️ Starting Miner...")
    subprocess.run(["bash", os.path.join(PROJECT_ROOT, "start_miner.sh"), str(pages)])

def run_cooker(limit=100):
    print(f"\n[MANAGER] 🍳 Starting Cooker...")
    subprocess.run(["bash", os.path.join(PROJECT_ROOT, "start_cooker.sh"), str(limit)])

def show_stats():
    stats = get_pipeline_stats()
    print("\n" + "="*40)
    print("   📊 PIPELINE DASHBOARD STATS")
    print("="*40)
    print(f"  [RAW]    Threads Scraped:  {stats.get('raw_count', 0)}")
    print(f"  [COOKED] Links Mapped:     {stats.get('cooked_count', 0)}")
    print("="*40 + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline Manager")
    parser.add_argument("command", choices=["mine", "cook", "stats", "schedule", "all"], help="Command to run")
    parser.add_argument("--pages", type=int, default=1)
    parser.add_argument("--limit", type=int, default=100)
    
    args = parser.parse_args()

    if args.command == "mine":
        run_miner(args.pages)
    elif args.command == "cook":
        run_cooker(args.limit)
    elif args.command == "stats":
        show_stats()
    elif args.command == "all":
        run_miner(args.pages)
        run_cooker(args.limit)
    elif args.command == "schedule":
        scheduler = BlockingScheduler()
        # Ví dụ: Chạy Miner lúc 2h sáng mỗi ngày
        scheduler.add_job(run_miner, 'cron', hour=2, minute=0, args=[args.pages])
        # Ví dụ: Chạy Cooker lúc 3h sáng mỗi ngày
        scheduler.add_job(run_cooker, 'cron', hour=3, minute=0, args=[args.limit])
        
        print("[MANAGER] Scheduler started. Press Ctrl+C to stop.")
        try:
            scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            pass
