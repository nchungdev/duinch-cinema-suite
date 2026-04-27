#!/bin/bash

# ⛏️ FShare Data Miner (Crawler) Starter
# -------------------------------------

# Lấy đường dẫn tuyệt đối đến thư mục gốc của project (nơi chứa script này)
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MINER_DIR="$PROJECT_ROOT/duinch-crawler/miner"
VENV_DIR="$MINER_DIR/venv"
BACKEND_ENV="$PROJECT_ROOT/duinch-cinema/backend/.env"
MINER_ENV="$MINER_DIR/.env"
PAGES=${1:-1}

# Luôn cd vào đúng thư mục miner
cd "$MINER_DIR" || { echo "Error: Could not cd to $MINER_DIR"; exit 1; }

if [ ! -f "$MINER_ENV" ] && [ -f "$BACKEND_ENV" ]; then
    cp "$BACKEND_ENV" "$MINER_ENV"
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "[*] Creating Virtual Environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "[*] Updating dependencies..."
python3 -m pip install -q --upgrade pip
python3 -m pip install -q -r requirements.txt

echo "[*] Running Miner..."
PYTHONPATH="$PROJECT_ROOT" python3 -u main.py --pages "$PAGES"
deactivate
