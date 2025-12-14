#!/bin/bash
#
# MagicMirror Stop Script
# Gracefully stops the MagicMirror server
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MM_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$MM_DIR/.mm.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FORCE=false
TIMEOUT=10

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE=true
            shift
            ;;
        --timeout|-t)
            TIMEOUT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --force, -f      Force kill if graceful shutdown fails"
            echo "  --timeout, -t N  Wait N seconds before force kill (default: 10)"
            echo "  --help, -h       Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${YELLOW}🛑 Stopping MagicMirror...${NC}"

# Function to stop a process gracefully
stop_process() {
    local pid=$1
    local name=$2
    
    if ! ps -p "$pid" > /dev/null 2>&1; then
        return 0
    fi
    
    echo "  Sending SIGTERM to $name (PID: $pid)..."
    kill -TERM "$pid" 2>/dev/null
    
    # Wait for graceful shutdown
    local waited=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $waited -lt $TIMEOUT ]; do
        sleep 1
        waited=$((waited + 1))
        echo -n "."
    done
    echo ""
    
    if ps -p "$pid" > /dev/null 2>&1; then
        if [ "$FORCE" = true ]; then
            echo -e "${YELLOW}  Process didn't stop, forcing...${NC}"
            kill -9 "$pid" 2>/dev/null
            sleep 1
        else
            echo -e "${RED}  Process didn't stop within ${TIMEOUT}s${NC}"
            echo "  Use --force to kill it"
            return 1
        fi
    fi
    
    return 0
}

STOPPED=false

# Method 1: Use PID file
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        if stop_process "$PID" "MagicMirror"; then
            echo -e "${GREEN}✓ MagicMirror stopped${NC}"
            STOPPED=true
        fi
    else
        echo "  PID file exists but process not running"
    fi
    rm -f "$PID_FILE"
fi

# Method 2: Find by process name (fallback)
if [ "$STOPPED" = false ]; then
    PIDS=$(pgrep -f "serveronly" 2>/dev/null)
    if [ -n "$PIDS" ]; then
        for PID in $PIDS; do
            if stop_process "$PID" "MagicMirror server"; then
                STOPPED=true
            fi
        done
    fi
    
    # Also check for Electron process
    ELECTRON_PIDS=$(pgrep -f "electron.*magicmirror" 2>/dev/null)
    if [ -n "$ELECTRON_PIDS" ]; then
        for PID in $ELECTRON_PIDS; do
            if stop_process "$PID" "MagicMirror Electron"; then
                STOPPED=true
            fi
        done
    fi
fi

if [ "$STOPPED" = true ]; then
    echo -e "${GREEN}✓ All MagicMirror processes stopped${NC}"
else
    echo -e "${YELLOW}⚠ No running MagicMirror processes found${NC}"
fi
