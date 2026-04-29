#!/bin/bash

# 🍳 FShare Data Cooker (Processor) Starter
# ----------------------------------------

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COOKER_DIR="$PROJECT_ROOT/duinch-crawler/cooker"
VENV_DIR="$COOKER_DIR/venv"
# Load Environment Variables from Root
ROOT_ENV="$PROJECT_ROOT/.env"
if [ -f "$ROOT_ENV" ]; then
    echo "--- Loading configuration from $ROOT_ENV ---"
    set -a; source "$ROOT_ENV"; set +a
fi
LIMIT=${1:-100}

# Luôn cd vào đúng thư mục cooker
cd "$COOKER_DIR" || { echo "Error: Could not cd to $COOKER_DIR"; exit 1; }

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

# Tự động giao hàng về HQ
bash "$PROJECT_ROOT/duinch-crawler/deliver.sh"

deactivate
