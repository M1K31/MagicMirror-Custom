#!/usr/bin/env bash
# Cross-platform uninstaller for MagicMirror (macOS launchd + Linux systemd).
# Removes the service only; pass --purge to also delete node_modules.
set -euo pipefail

DISPLAY="MagicMirror"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS="$(uname -s)"
LABEL="com.smartindustries.magicmirror"
PURGE="${1:-}"

echo "=> Uninstalling $DISPLAY ($OS)..."

# Stop any stray server-only process started outside the service manager.
pkill -f "node.*serveronly" 2>/dev/null || true

case "$OS" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "=> Removed launchd agent $LABEL"
    ;;
  Linux)
    if [ "$EUID" -ne 0 ]; then echo "Linux uninstall needs sudo: sudo $0"; exit 1; fi
    systemctl stop magicmirror.service 2>/dev/null || true
    systemctl disable magicmirror.service 2>/dev/null || true
    rm -f /etc/systemd/system/magicmirror.service
    systemctl daemon-reload
    echo "=> Removed systemd unit magicmirror.service"
    ;;
  *)
    echo "Unsupported OS: $OS"; exit 1 ;;
esac

if [ "$PURGE" = "--purge" ]; then
    rm -rf "$PROJECT_ROOT/node_modules"
    echo "=> Purged node_modules"
else
    echo "   (node_modules kept; use --purge to remove)"
fi
echo "=> Done."
