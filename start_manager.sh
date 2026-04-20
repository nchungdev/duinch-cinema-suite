#!/bin/bash

# 🎮 Pipeline Manager Starter
# ---------------------------

# Lấy đường dẫn tuyệt đối của project root
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MANAGER_DIR="$PROJECT_ROOT/manager"
VENV_DIR="$MANAGER_DIR/venv"

# Luôn cd vào đúng thư mục manager
cd "$MANAGER_DIR" || { echo "Error: Could not cd to $MANAGER_DIR"; exit 1; }

if [ ! -d "$VENV_DIR" ]; then
    echo "[*] Creating Manager Virtual Environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
echo "[*] Updating manager dependencies..."
python3 -m pip install -q -r requirements.txt

# Chạy Manager với PYTHONPATH là project root để import miner/cooker
PYTHONPATH="$PROJECT_ROOT" python3 main.py "$@"
deactivate
