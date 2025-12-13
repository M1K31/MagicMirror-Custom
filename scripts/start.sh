#!/bin/bash
#
# MagicMirror Start Script
# Starts the MagicMirror server with proper process management
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MM_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$MM_DIR/.mm.pid"
LOG_FILE="$MM_DIR/logs/mm.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create logs directory if it doesn't exist
mkdir -p "$MM_DIR/logs"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ MagicMirror is already running (PID: $PID)${NC}"
        echo "  Use './scripts/stop.sh' to stop it first"
        exit 1
    else
        # Stale PID file
        rm -f "$PID_FILE"
    fi
fi

# Load environment variables if .env exists
if [ -f "$MM_DIR/.env" ]; then
    echo -e "${GREEN}✓ Loading environment variables from .env${NC}"
    set -a
    source "$MM_DIR/.env"
    set +a
fi

cd "$MM_DIR"

# Parse arguments
MODE="server"
BACKGROUND=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            MODE="dev"
            shift
            ;;
        --electron)
            MODE="electron"
            shift
            ;;
        --background|-b)
            BACKGROUND=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dev        Start in development mode with DevTools"
            echo "  --electron   Start with Electron wrapper"
            echo "  --background Run in background (daemon mode)"
            echo "  -b           Shorthand for --background"
            echo "  --help, -h   Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}🪞 Starting MagicMirror...${NC}"
echo "  Mode: $MODE"
echo "  Directory: $MM_DIR"

if [ "$BACKGROUND" = true ]; then
    echo "  Running in background..."
    
    if [ "$MODE" = "dev" ]; then
        nohup npm run start:dev > "$LOG_FILE" 2>&1 &
    elif [ "$MODE" = "electron" ]; then
        nohup npm start > "$LOG_FILE" 2>&1 &
    else
        nohup npm run server > "$LOG_FILE" 2>&1 &
    fi
    
    PID=$!
    echo "$PID" > "$PID_FILE"
    
    # Wait a moment and check if it started
    sleep 2
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ MagicMirror started (PID: $PID)${NC}"
        echo "  Logs: $LOG_FILE"
        echo "  URL: http://localhost:8080"
    else
        echo -e "${RED}✗ Failed to start MagicMirror${NC}"
        echo "  Check logs: $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
else
    # Run in foreground
    if [ "$MODE" = "dev" ]; then
        npm run start:dev
    elif [ "$MODE" = "electron" ]; then
        npm start
    else
        npm run server
    fi
fi
