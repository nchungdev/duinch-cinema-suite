#!/bin/bash

# 🍳 FShare Data Cooker (Processor) Starter
# ----------------------------------------

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COOKER_DIR="$PROJECT_ROOT/duinch-crawler/cooker"
VENV_DIR="$COOKER_DIR/venv"
BACKEND_ENV="$PROJECT_ROOT/duinch-cinema/backend/.env"
COOKER_ENV="$COOKER_DIR/.env"
LIMIT=${1:-100}

# Luôn cd vào đúng thư mục cooker
cd "$COOKER_DIR" || { echo "Error: Could not cd to $COOKER_DIR"; exit 1; }

if [ ! -f "$COOKER_ENV" ] && [ -f "$BACKEND_ENV" ]; then
    cp "$BACKEND_ENV" "$COOKER_ENV"
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "[*] Creating Virtual Environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "[*] Updating dependencies..."
python3 -m pip install -q --upgrade pip
python3 -m pip install -q -r requirements.txt

echo "[*] Running Cooker..."
PYTHONPATH="$PROJECT_ROOT" python3 -u main.py --limit "$LIMIT"

deactivate
