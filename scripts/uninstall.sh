#!/usr/bin/env bash
# Cross-platform uninstaller for MagicMirror (macOS launchd + Linux systemd).
# FULL removal by default: the service, node_modules, the local config
# (config/config.js), and logs.
#
# config/config.js is your customization (which modules show, their layout). To
# keep it for a later reinstall, use the sibling keep-data script.
#
# Usage:
#   ./scripts/uninstall.sh              # FULL removal (asks to confirm)
#   ./scripts/uninstall.sh --yes        # FULL removal, no prompt (CI/automation)
#   ./scripts/uninstall.sh --dry-run    # print what would happen
#   ./scripts/uninstall-keep-data.sh    # remove service+node_modules, KEEP config.js
set -euo pipefail

DISPLAY="MagicMirror"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS="$(uname -s)"
LABEL="com.smartindustries.magicmirror"

KEEP_DATA=false; DRY=false
NONINTERACTIVE="${MM_NONINTERACTIVE:-${CI:-}}"
for a in "$@"; do
    case "$a" in
        --keep-data)                KEEP_DATA=true ;;
        -y|--yes|--non-interactive) NONINTERACTIVE=1 ;;
        --dry-run)                  DRY=true ;;
        # Back-compat: --purge was the old "also remove node_modules" flag; full
        # removal is now the default, so it is accepted as a no-op.
        --purge)                    : ;;
        -h|--help) grep '^#' "$0" | sed 's/^# \?//'; exit 0 ;;
        *) echo "Unknown option: $a"; exit 1 ;;
    esac
done
run() { if $DRY; then echo "[dry-run] $*"; else eval "$*"; fi; }

if $KEEP_DATA; then
    echo "=> Uninstalling $DISPLAY ($OS) — keeping config/config.js."
else
    echo "=> Uninstalling $DISPLAY ($OS) — FULL removal (deletes config/config.js)."
    if [ -z "$NONINTERACTIVE" ] && ! $DRY; then
        read -rp "Type 'yes' to remove MagicMirror and its config: " confirm
        [ "$confirm" = "yes" ] || { echo "Aborted."; exit 1; }
    fi
fi

# Stop any stray server-only process started outside the service manager.
run "pkill -f \"node.*serveronly\" 2>/dev/null || true"

case "$OS" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    run "launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || launchctl unload \"$PLIST\" 2>/dev/null || true"
    run "rm -f \"$PLIST\""
    echo "=> Removed launchd agent $LABEL"
    ;;
  Linux)
    if [ "$EUID" -ne 0 ]; then echo "Linux uninstall needs sudo: sudo $0"; exit 1; fi
    run "systemctl stop magicmirror.service 2>/dev/null || true"
    run "systemctl disable magicmirror.service 2>/dev/null || true"
    run "rm -f /etc/systemd/system/magicmirror.service"
    run "systemctl daemon-reload"
    echo "=> Removed systemd unit magicmirror.service"
    ;;
  *)
    echo "Unsupported OS: $OS"; exit 1 ;;
esac

run "rm -rf \"$PROJECT_ROOT/node_modules\""
echo "=> Removed node_modules"

if $KEEP_DATA; then
    echo "=> Kept config/config.js."
else
    run "rm -f \"$PROJECT_ROOT/config/config.js\""
    echo "=> Removed config/config.js"
fi
echo "=> Done. Reinstall with: ./scripts/install.sh"
