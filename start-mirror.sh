#!/bin/bash
# MagicMirror Start Script
# Starts the MagicMirror server-only mode (no Electron)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting MagicMirror...${NC}"

# Check if already running
if pgrep -f "node.*serveronly" > /dev/null; then
    echo -e "${YELLOW}MagicMirror is already running.${NC}"
    echo "Use ./stop-mirror.sh to stop it first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${RED}Error: Node.js 22+ required. Current: $(node -v 2>/dev/null || echo 'not installed')${NC}"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install --no-audit --no-fund --no-update-notifier
fi

# Validate config
echo "Validating config..."
if ! npm run config:check 2>/dev/null; then
    echo -e "${RED}Config validation failed. Check config/config.js${NC}"
    exit 1
fi

# Start server with memory optimization flags
echo -e "${GREEN}Starting server on http://localhost:8080${NC}"
# --expose-gc: Allows garbage collection hints
# --max-old-space-size=512: Limits heap for earlier GC
nohup node --expose-gc --max-old-space-size=512 ./serveronly > logs/magicmirror.log 2>&1 &
PID=$!

# Wait and verify
sleep 2
if ps -p $PID > /dev/null; then
    echo -e "${GREEN}MagicMirror started successfully (PID: $PID)${NC}"
    echo "Logs: $SCRIPT_DIR/logs/magicmirror.log"
    echo "View: http://localhost:8080"
else
    echo -e "${RED}Failed to start MagicMirror. Check logs/magicmirror.log${NC}"
    exit 1
fi
