#!/bin/bash

# --- Duinch Cinema Dashboard Orchestrator (Watch Mode) ---

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# 1. Kill existing processes
echo "--- 1. Cleaning up ports 8086 (Backend) and 5173 (Frontend) ---"
lsof -t -i:8086 | xargs kill -9 2>/dev/null
lsof -t -i:5173 | xargs kill -9 2>/dev/null

# Prepare logs directory
mkdir -p duinch-cinema/backend/logs

# 2. Setup Python environment for Backend
echo "--- 2. Setting up Python environment for Backend ---"
source venv/bin/activate
python3 -m pip install -q --upgrade pip
python3 -m pip install -q -r duinch-cinema/backend/requirements.txt

# 3. Start Backend
echo "--- 3. Starting Backend (HQ) (Port 8086) ---"
export PYTHONPATH=$PYTHONPATH:$PROJECT_ROOT/duinch-cinema/backend # Ensure PYTHONPATH is set before uvicorn
cd duinch-cinema/backend
uvicorn app.main:app --host 0.0.0.0 --port 8086 --reload --reload-dir app > logs/backend.log 2>&1 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

# 4. Start Frontend
echo "--- 4. Starting Frontend (Port 5173) ---"
cd duinch-cinema/frontend
# Ensure frontend dependencies are installed
npm install --silent
npm run dev -- --host 0.0.0.0 > ../backend/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd "$PROJECT_ROOT"

echo "========================================="
echo "🚀 SERVICES STARTED IN AUTO-RELOAD MODE"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "📊 MONITORING LOGS (Press Ctrl+C to stop):"
echo "-----------------------------------------"

cleanup() {
    echo -e "
🛑 Shutting down services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Cleaned up."
    deactivate # Deactivate venv
    exit
}

trap cleanup SIGINT

# Combined log stream for easy monitoring
tail -f duinch-cinema/backend/logs/backend.log duinch-cinema/backend/logs/frontend.log
