#!/usr/bin/env bash
# Cross-platform installer for MagicMirror (server-only mode).
#   macOS  -> launchd user agent (com.smartindustries.magicmirror)
#   Linux  -> systemd system service (magicmirror.service, needs sudo)
set -euo pipefail

DISPLAY="MagicMirror"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS="$(uname -s)"
LABEL="com.smartindustries.magicmirror"
PORT="${MM_PORT:-8080}"

echo "=> Installing $DISPLAY ($OS)..."

NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "Node.js not found (need Node 22+). Install it and re-run."; exit 1; }

cd "$PROJECT_ROOT"
echo "=> Installing npm dependencies..."
npm install --no-audit --no-fund --no-update-notifier

# A fresh checkout — or a full uninstall — leaves no config/config.js, and
# MagicMirror refuses to boot without one ("No config file present!"). Seed it
# from the ecosystem-aware sample (honors ECO_LAN for 0.0.0.0 + open whitelist).
if [ ! -f "$PROJECT_ROOT/config/config.js" ]; then
    cp "$PROJECT_ROOT/config/config.js.sample" "$PROJECT_ROOT/config/config.js"
    echo "=> Created config/config.js from config.js.sample"
fi

NODE_ARGS=(--expose-gc --max-old-space-size=512 ./serveronly)

case "$OS" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    LOGDIR="$HOME/Library/Logs/$DISPLAY"; mkdir -p "$LOGDIR" "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string>
    <string>--expose-gc</string><string>--max-old-space-size=512</string>
    <string>$PROJECT_ROOT/serveronly</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_ROOT</string>
  <key>EnvironmentVariables</key><dict>
    <key>MM_PORT</key><string>$PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOGDIR/stdout.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/stderr.log</string>
</dict></plist>
PLIST_EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "=> $DISPLAY installed and loaded (launchd: $LABEL, port $PORT)"
    echo "   Logs: $LOGDIR/{stdout,stderr}.log"
    ;;
  Linux)
    if [ "$EUID" -ne 0 ]; then echo "Linux install needs sudo: sudo $0"; exit 1; fi
    USER_NAME="${SUDO_USER:-$USER}"
    UNIT="/etc/systemd/system/magicmirror.service"
    cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=$DISPLAY (server-only)
After=network.target
[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$PROJECT_ROOT
Environment=MM_PORT=$PORT
ExecStart=$NODE_BIN --expose-gc --max-old-space-size=512 $PROJECT_ROOT/serveronly
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
UNIT_EOF
    systemctl daemon-reload
    systemctl enable magicmirror.service
    echo "=> $DISPLAY installed (systemd, port $PORT). Start: sudo systemctl start magicmirror"
    ;;
  *)
    echo "Unsupported OS: $OS"; exit 1 ;;
esac
echo "=> Done."
