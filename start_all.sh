#!/bin/bash
echo "--- 1. Cleaning up ports 8086 and 5173 ---"
lsof -ti:8086,5173 | xargs kill -9 2>/dev/null || true

echo "--- 2. Starting Backend on port 8086 ---"
cd "/Users/chungnh/Studio Projects/omv-jdownloader-dashboard/backend"
../venv/bin/python run.py > out.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

echo "--- 3. Starting Frontend on port 5173 ---"
cd "/Users/chungnh/Studio Projects/omv-jdownloader-dashboard/frontend"
# Sử dụng 0.0.0.0 để chấp nhận mọi kết nối và background command
npm run dev -- --host 0.0.0.0 --port 5173 > dev.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

echo "--- Services are running ---"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8086"
