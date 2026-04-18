#!/bin/bash

# --- CONFIGURATION ---
PROJECT_ROOT=$(pwd)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG_DIR="$PROJECT_ROOT/logs"
DATA_DIR="$PROJECT_ROOT/data"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_PATH="$PROJECT_ROOT/venv"

# Colors for better UI
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== CinemaPro Dashboard Orchestrator ===${NC}"

# --- 1. PREPARE DIRECTORIES ---
echo -e "${YELLOW}--- 1. Preparing Directories ---${NC}"
mkdir -p "$LOG_DIR"
mkdir -p "$DATA_DIR/cache" "$DATA_DIR/user" "$DATA_DIR/secrets" "$DATA_DIR/cache/tmdb-images"
echo -e "${GREEN}   [OK] Logs and Data folders ready${NC}"

# --- 2. CHECK ENVIRONMENT (.env) ---
echo -e "${YELLOW}--- 2. Checking Environment ---${NC}"
ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    touch "$ENV_FILE"
    echo -e "${YELLOW}   [Env] Created new .env file${NC}"
fi

ensure_env() {
    local key=$1
    local val=$2
    if ! grep -q "^$key=" "$ENV_FILE"; then
        echo "$key=$val" >> "$ENV_FILE"
        echo -e "${GREEN}   [Env] Added default $key${NC}"
    fi
}

ensure_env "STORAGE_PATH" "/storage"
ensure_env "JD_INTERNAL_PATH" "/downloads"
ensure_env "TMDB_CACHE_TTL" "86400"
ensure_env "DISCOVERY_CACHE_TTL" "3600"
ensure_env "THUVIENCINE_CACHE_TTL" "86400"
ensure_env "TIMFSHARE_CACHE_TTL" "28800"
ensure_env "FSHARE_SEARCH_TTL" "28800"
ensure_env "FSHARE_NAME_TTL" "604800"
ensure_env "FSHARE_FOLDER_TTL" "86400"
ensure_env "IMAGE_CACHE_TTL" "3600"
ensure_env "REDIS_URL" "redis://localhost:6379"

# --- 3. BACKEND SETUP (Python Venv) ---
echo -e "${YELLOW}--- 3. Backend Setup ---${NC}"
if [ ! -d "$VENV_PATH" ]; then
    echo -e "${BLUE}   [Venv] Creating virtual environment...${NC}"
    python3 -m venv "$VENV_PATH"
fi

echo -e "${BLUE}   [Venv] Installing/Updating dependencies...${NC}"
"$VENV_PATH/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
echo -e "${GREEN}   [OK] Backend dependencies satisfied${NC}"

# --- 4. FRONTEND SETUP (Node Modules) ---
echo -e "${YELLOW}--- 4. Frontend Setup ---${NC}"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${BLUE}   [NPM] Installing frontend dependencies (this may take a minute)...${NC}"
    cd "$FRONTEND_DIR" && npm install --silent
    cd "$PROJECT_ROOT"
fi
echo -e "${GREEN}   [OK] Frontend dependencies satisfied${NC}"

# --- 5. REDIS CHECK ---
echo -e "${YELLOW}--- 5. Service Dependencies ---${NC}"
if ! command -v redis-cli &> /dev/null; then
    echo -e "${RED}   [ERR] redis-cli not found. Please install redis (e.g. brew install redis)${NC}"
elif ! redis-cli ping > /dev/null 2>&1; then
    echo -e "${YELLOW}   [Redis] Redis is not running. Attempting to start via brew...${NC}"
    if command -v brew &> /dev/null; then
        brew services start redis > /dev/null 2>&1
        # Chờ một chút để Redis khởi động hoàn toàn
        for i in {1..5}; do
            if redis-cli ping > /dev/null 2>&1; then
                break
            fi
            sleep 1
        done
    fi
    
    if ! redis-cli ping > /dev/null 2>&1; then
        echo -e "${RED}   [WARN] Could not start Redis. Fallback to File Cache.${NC}"
    else
        REDIS_VER=$(redis-cli info server | grep redis_version | cut -d: -f2 | tr -d '\r')
        echo -e "${GREEN}   [OK] Redis $REDIS_VER started successfully${NC}"
    fi
else
    REDIS_VER=$(redis-cli info server | grep redis_version | cut -d: -f2 | tr -d '\r')
    echo -e "${GREEN}   [OK] Redis $REDIS_VER is active${NC}"
fi

# --- 6. CHECK WEBTORRENT CLI ---
echo -e "${YELLOW}--- 6. Webtorrent Dependencies ---${NC}"
if ! command -v webtorrent &> /dev/null; then
    echo -e "${YELLOW}   [NPM] webtorrent is not installed globally. Attempting to install...${NC}"
    if command -v npm &> /dev/null; then
        npm install -g webtorrent-cli > /dev/null 2>&1
        if command -v webtorrent &> /dev/null; then
            echo -e "${GREEN}   [OK] webtorrent-cli installed successfully${NC}"
        else
            echo -e "${RED}   [WARN] Failed to install webtorrent-cli globally. Peer discovery may fail. Please run 'npm install -g webtorrent-cli' manually.${NC}"
        fi
    else
        echo -e "${RED}   [ERR] NPM not found. Cannot install webtorrent-cli. Please install it manually.${NC}"
    fi
else
    echo -e "${GREEN}   [OK] webtorrent-cli is active${NC}"
fi

# --- 7. START SERVICES ---
echo -e "${YELLOW}--- 7. Starting Services ---${NC}"

# Cleanup existing
echo -e "${BLUE}   [System] Cleaning up ports 8086 and 5173...${NC}"
lsof -ti:8086,5173 | xargs kill -9 2>/dev/null || true

# Start Backend
cd "$BACKEND_DIR"
nohup "$VENV_PATH/bin/python" run.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}   [OK] Backend started (PID: $BACKEND_PID)${NC}"

# Start Frontend
cd "$FRONTEND_DIR"
nohup npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}   [OK] Frontend started (PID: $FRONTEND_PID)${NC}"

echo -e "${BLUE}=========================================${NC}"
echo -e "${GREEN}ALL SERVICES ARE RUNNING!${NC}"
echo -e "Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "Backend:  ${BLUE}http://localhost:8086${NC}"
echo -e "Logs:     ${NC}tail -f logs/backend.log${NC}"
echo -e "${BLUE}=========================================${NC}"
