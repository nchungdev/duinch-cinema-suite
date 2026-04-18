#!/bin/bash

# --- CinemaPro Dashboard Orchestrator ---

DAEMON_MODE=false
if [[ "$1" == "-d" ]] || [[ "$1" == "--daemon" ]]; then
    DAEMON_MODE=true
fi

# 1. Kill existing processes on target ports
echo "--- 1. Cleaning up ports 8086 and 5173 ---"
lsof -t -i:8086 | xargs kill -9 2>/dev/null
lsof -t -i:5173 | xargs kill -9 2>/dev/null

# Prepare logs directory
mkdir -p logs

# 2. Start Backend
echo "--- 2. Starting Backend (Port 8086) ---"
source venv/bin/activate
cd backend
if [ "$DAEMON_MODE" = true ]; then
    nohup python run.py > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
else
    python run.py & 
    BACKEND_PID=$!
fi
cd ..

# 3. Start Frontend
echo "--- 3. Starting Frontend (Port 5173) ---"
cd frontend
if [ "$DAEMON_MODE" = true ]; then
    nohup npm run dev -- --host 0.0.0.0 > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
else
    npm run dev -- --host 0.0.0.0 &
    FRONTEND_PID=$!
fi
cd ..

if [ "$DAEMON_MODE" = true ]; then
    echo "========================================="
    echo "SERVICES STARTED IN BACKGROUND (DAEMON)"
    echo "Backend PID: $BACKEND_PID"
    echo "Frontend PID: $FRONTEND_PID"
    echo "Logs: tail -f logs/backend.log"
    echo "========================================="
    exit 0
else
    echo "========================================="
    echo "ALL SERVICES STARTED IN LIVE LOG MODE"
    echo "Press Ctrl+C to stop both services."
    echo "========================================="

    cleanup() {
        echo ""
        echo "--- Shutting down services ---"
        kill $BACKEND_PID 2>/dev/null
        kill $FRONTEND_PID 2>/dev/null
        exit
    }

    trap cleanup SIGINT
    wait
fi
