#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CACHE_DIR="$PROJECT_ROOT/data/cache"

echo -e "${BLUE}=== Duinch Cinema Cache Manager ===${NC}"

# 1. Clear Redis
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${YELLOW}Clearing Redis database...${NC}"
    redis-cli flushall
    echo -e "${GREEN}   [OK] Redis flushed${NC}"
else
    echo -e "${RED}   [SKIP] Redis not running${NC}"
fi

# 2. Clear File Cache
if [ -d "$CACHE_DIR" ]; then
    echo -e "${YELLOW}Clearing File System cache...${NC}"
    
    # We keep the directory structure but remove .json files
    find "$CACHE_DIR" -name "*.json" -type f -delete
    
    # Optionally clear images too (uncomment if needed)
    # rm -rf "$CACHE_DIR/tmdb-images/*"
    
    echo -e "${GREEN}   [OK] JSON cache files removed${NC}"
else
    echo -e "${RED}   [SKIP] Cache directory not found${NC}"
fi

echo -e "${BLUE}===============================${NC}"
echo -e "${GREEN}CACHE CLEARED SUCCESSFULLY!${NC}"
