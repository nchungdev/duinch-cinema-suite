#!/bin/bash

# 📦 The Courier: Ship cooked data to Dashboard HQ
# -----------------------------------------------

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COOKED_DB="$PROJECT_ROOT/crawler/cooker/data/cooker.db"
HQ_DB="$PROJECT_ROOT/dashboard/backend/data/indexed_fshare.db"

echo "[COURIER] 🚚 Shipping data to HQ..."

if [ -f "$COOKED_DB" ]; then
    # Copy cooked links to HQ
    mkdir -p "$(dirname "$HQ_DB")"
    cp "$COOKED_DB" "$HQ_DB"
    echo "[COURIER] ✅ Data delivered to $HQ_DB"
else
    echo "[COURIER] ❌ Error: Cooked database not found!"
fi
