#!/bin/bash
PROJECT_ROOT=$(pwd)
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

echo "--- 1. Cleaning up ports 8086 and 5173 ---"
lsof -ti:8086,5173 | xargs kill -9 2>/dev/null || true

echo "--- 2. Starting Backend on port 8086 ---"
cd "$PROJECT_ROOT/backend"
../venv/bin/python run.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID (Log: logs/backend.log)"

echo "--- 3. Starting Frontend on port 5173 ---"
cd "$PROJECT_ROOT/frontend"
# Sử dụng 0.0.0.0 để chấp nhận mọi kết nối và background command
npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID (Log: logs/frontend.log)"

echo "--- Services are running ---"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8086"
