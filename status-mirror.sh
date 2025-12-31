#!/bin/bash
# MagicMirror Status Script
# Shows current status and resource usage

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== MagicMirror Status ===${NC}"

# Check if running (match any node process running serveronly)
PIDS=$(pgrep -f "node.*serveronly" 2>/dev/null)

if [ -z "$PIDS" ]; then
    echo -e "Status: ${RED}STOPPED${NC}"
    exit 0
fi

echo -e "Status: ${GREEN}RUNNING${NC}"
echo ""

# Show process details
echo -e "${BLUE}Process Info:${NC}"
for PID in $PIDS; do
    ps -p $PID -o pid,ppid,%cpu,%mem,etime,command 2>/dev/null | tail -1
done
echo ""

# CPU/Memory summary
echo -e "${BLUE}Resource Usage:${NC}"
for PID in $PIDS; do
    CPU=$(ps -p $PID -o %cpu= 2>/dev/null | tr -d ' ')
    MEM=$(ps -p $PID -o %mem= 2>/dev/null | tr -d ' ')
    RSS=$(ps -p $PID -o rss= 2>/dev/null | tr -d ' ')
    RSS_MB=$((RSS / 1024))
    echo "  PID $PID: CPU=${CPU}% MEM=${MEM}% (${RSS_MB}MB)"
done
echo ""

# Check HTTP response
echo -e "${BLUE}HTTP Status:${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "  http://localhost:8080 - ${GREEN}OK (200)${NC}"
else
    echo -e "  http://localhost:8080 - ${RED}Error ($HTTP_CODE)${NC}"
fi
echo ""

# Recent log entries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/logs/magicmirror.log"
if [ -f "$LOG_FILE" ]; then
    echo -e "${BLUE}Recent Logs (last 10 lines):${NC}"
    tail -10 "$LOG_FILE" 2>/dev/null
fi
