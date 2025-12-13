#!/bin/bash
#
# MagicMirror Status Script
# Check the status of MagicMirror server
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MM_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$MM_DIR/.mm.pid"
LOG_FILE="$MM_DIR/logs/mm.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🪞 MagicMirror Status${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check PID file
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "Status:    ${GREEN}● Running${NC}"
        echo "PID:       $PID"
        
        # Get process info
        UPTIME=$(ps -o etime= -p "$PID" 2>/dev/null | xargs)
        MEM=$(ps -o rss= -p "$PID" 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
        CPU=$(ps -o %cpu= -p "$PID" 2>/dev/null | xargs)
        
        echo "Uptime:    $UPTIME"
        echo "Memory:    $MEM"
        echo "CPU:       ${CPU}%"
    else
        echo -e "Status:    ${RED}● Stopped${NC} (stale PID file)"
        rm -f "$PID_FILE"
    fi
else
    # Check for running processes without PID file
    PIDS=$(pgrep -f "node.*serveronly" 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo -e "Status:    ${YELLOW}● Running (untracked)${NC}"
        echo "PIDs:      $PIDS"
    else
        echo -e "Status:    ${RED}● Stopped${NC}"
    fi
fi

echo ""
echo -e "${CYAN}Network${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if port 8080 is in use
if command -v ss > /dev/null 2>&1; then
    PORT_INFO=$(ss -tlnp 2>/dev/null | grep ":8080")
elif command -v netstat > /dev/null 2>&1; then
    PORT_INFO=$(netstat -tlnp 2>/dev/null | grep ":8080")
else
    PORT_INFO=""
fi

if [ -n "$PORT_INFO" ]; then
    echo -e "Port 8080: ${GREEN}● Listening${NC}"
    echo "URL:       http://localhost:8080"
else
    echo -e "Port 8080: ${RED}● Not listening${NC}"
fi

echo ""
echo -e "${CYAN}Logs${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$LOG_FILE" ]; then
    LOG_SIZE=$(du -h "$LOG_FILE" 2>/dev/null | cut -f1)
    LOG_MODIFIED=$(stat -c %y "$LOG_FILE" 2>/dev/null | cut -d. -f1)
    echo "Log file:  $LOG_FILE"
    echo "Size:      $LOG_SIZE"
    echo "Modified:  $LOG_MODIFIED"
    echo ""
    echo "Last 5 lines:"
    echo "─────────────"
    tail -5 "$LOG_FILE" 2>/dev/null | sed 's/^/  /'
else
    echo "Log file:  Not found"
fi

echo ""
echo -e "${CYAN}Environment${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$MM_DIR/.env" ]; then
    echo -e ".env file: ${GREEN}● Found${NC}"
    # Count non-comment, non-empty lines
    ENV_VARS=$(grep -c "^[^#].*=" "$MM_DIR/.env" 2>/dev/null || echo 0)
    echo "Variables: $ENV_VARS configured"
else
    echo -e ".env file: ${YELLOW}○ Not found${NC}"
fi

# Check for OpenEye
if [ -n "$OPENEYE_HOST" ]; then
    echo -e "OpenEye:   Configured ($OPENEYE_HOST)"
else
    echo -e "OpenEye:   Not configured"
fi
