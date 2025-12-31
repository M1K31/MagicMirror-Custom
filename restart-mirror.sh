#!/bin/bash
# MagicMirror Restart Script
# Stops and starts MagicMirror

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Restarting MagicMirror..."
./stop-mirror.sh
sleep 2
./start-mirror.sh
