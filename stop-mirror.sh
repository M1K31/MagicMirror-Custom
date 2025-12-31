#!/bin/bash
# MagicMirror Stop Script
# Gracefully stops MagicMirror server

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Stopping MagicMirror...${NC}"

# Find MagicMirror processes (match any node process running serveronly)
PIDS=$(pgrep -f "node.*serveronly" 2>/dev/null)

if [ -z "$PIDS" ]; then
    echo -e "${YELLOW}MagicMirror is not running.${NC}"
    exit 0
fi

# Graceful shutdown with SIGTERM
for PID in $PIDS; do
    echo "Stopping process $PID..."
    kill -TERM $PID 2>/dev/null
done

# Wait for graceful shutdown (max 5 seconds)
TIMEOUT=5
while [ $TIMEOUT -gt 0 ]; do
    if ! pgrep -f "node.*serveronly" > /dev/null; then
        echo -e "${GREEN}MagicMirror stopped gracefully.${NC}"
        exit 0
    fi
    sleep 1
    TIMEOUT=$((TIMEOUT - 1))
done

# Force kill if still running
echo -e "${YELLOW}Force killing remaining processes...${NC}"
pkill -9 -f "node.*serveronly" 2>/dev/null

sleep 1
if pgrep -f "node.*serveronly" > /dev/null; then
    echo -e "${RED}Failed to stop MagicMirror. Manual intervention required.${NC}"
    exit 1
else
    echo -e "${GREEN}MagicMirror stopped.${NC}"
fi
