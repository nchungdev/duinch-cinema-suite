#!/bin/bash

# --- CinemaPro Dashboard Orchestrator (Watch Mode Enabled) ---

# 1. Kill existing processes on target ports
echo "--- 1. Cleaning up ports 8086 (Backend) and 5173 (Frontend) ---"
lsof -t -i:8086 | xargs kill -9 2>/dev/null
lsof -t -i:5173 | xargs kill -9 2>/dev/null

# Prepare logs directory
mkdir -p logs

# 2. Setup environment
source venv/bin/activate
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend

# 3. Start Backend with Auto-Reload
# Using uvicorn --reload to monitor changes in backend directory
echo "--- 2. Starting Backend with Watch Mode (Port 8086) ---"
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8086 --reload --reload-dir app > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 4. Start Frontend with Hot-Reload (Native Vite)
echo "--- 3. Starting Frontend with HMR (Port 5173) ---"
cd frontend
npm run dev -- --host 0.0.0.0 > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo "========================================="
echo "🚀 SERVICES STARTED IN AUTO-RELOAD MODE"
echo "Backend PID: $BACKEND_PID (Watching: backend/app/)"
echo "Frontend PID: $FRONTEND_PID (HMR Enabled)"
echo ""
echo "📊 MONITORING LOGS (Press Ctrl+C to stop):"
echo "-----------------------------------------"

# Function to stop both processes cleanly
cleanup() {
    echo -e "\n🛑 Shutting down services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Cleaned up."
    exit
}

# Trap Ctrl+C
trap cleanup SIGINT

# Combined log stream for easy monitoring
tail -f logs/backend.log logs/frontend.log
