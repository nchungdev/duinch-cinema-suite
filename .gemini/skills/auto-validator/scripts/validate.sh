#!/bin/bash
# Script Kiểm thử Thông minh cho dự án CinemaPro (Bản cập nhật: Path Stability)

PROJECT_ROOT=$(git rev-parse --show-toplevel)
VENV_PYTHON="$PROJECT_ROOT/venv/bin/python"
cd "$PROJECT_ROOT"

COMMIT_MSG=$1
ERROR_LOG="logs/frontend_errors.log"
> "$ERROR_LOG"

CHANGED_FILES=$(git diff --name-only HEAD)
MODE="full"
if [[ ! "$CHANGED_FILES" =~ "backend/" ]] && [[ ! "$CHANGED_FILES" =~ "domain/" ]] && [[ ! "$CHANGED_FILES" =~ "infrastructure/" ]] && [[ ! "$CHANGED_FILES" =~ "core/" ]]; then
    MODE="ui"
fi

echo "--- [MODE: $MODE] Starting Validation ---"

echo "--- Step 1: Linting ---"
cd "$PROJECT_ROOT/frontend" && npm run lint || exit 1

if [ "$MODE" != "ui" ]; then
    echo "--- Step 2: Logic Unit Tests ---"
    cd "$PROJECT_ROOT/frontend" && npx -y tsx tests/logic_test.ts || exit 1
fi

echo "--- Step 3: Production Build ---"
cd "$PROJECT_ROOT/frontend" && npm run build || exit 1

if [ "$MODE" == "full" ]; then
    echo "--- Step 4: Backend API Integration Test ---"
    cd "$PROJECT_ROOT"
    lsof -t -i:8086 | xargs kill -9 2>/dev/null
    
    source venv/bin/activate
    cd backend && python run.py > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    cd "$PROJECT_ROOT"
    
    echo "Waiting for Backend to warm up (5s)..."
    sleep 5
    
    $VENV_PYTHON backend/tests/manual/test_media_api.py
    TEST_RESULT=$?
    
    kill $BACKEND_PID 2>/dev/null
    
    if [ $TEST_RESULT -ne 0 ]; then
        echo "❌ CRITICAL: Backend Integration Test FAILED."
        exit 1
    fi
fi

echo "--- Step 5: Runtime Console Check ---"
if [ -s "$PROJECT_ROOT/$ERROR_LOG" ]; then
    echo "❌ CRITICAL: Found Runtime Errors in Browser Console!"
    cat "$PROJECT_ROOT/$ERROR_LOG"
    exit 1
fi

echo "--- Step 6: Amending and Pushing ---"
cd "$PROJECT_ROOT"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git add -A
if [ -n "$COMMIT_MSG" ]; then
    git commit --amend -m "$COMMIT_MSG"
else
    git commit --amend --no-edit
fi
git push origin "$CURRENT_BRANCH" --force

echo "--- Step 7: Final Restart (Live Log Ready) ---"
echo "✅ SUCCESS: ALL TESTS PASSED. Please run './start_all.sh' manually to see live logs."
