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

# package.json requires node >= 22.14. Distro packages are routinely older
# (Debian bookworm ships 18, Alpine 3.20 ships 20) and MagicMirror does NOT fail
# cleanly on an old node — it starts, garbles its logs, and never binds the
# port. Enforce the minimum here rather than let that happen. Use MM_MIN_NODE to
# override if you know better.
MM_MIN_NODE="${MM_MIN_NODE:-22}"
NODE_MAJOR="$("$NODE_BIN" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt "$MM_MIN_NODE" ]; then
    echo "Node $("$NODE_BIN" -v) is too old — MagicMirror needs Node ${MM_MIN_NODE}+ (package.json: >=22.14.0)."
    echo "Distro packages are often older than this; install a current Node from:"
    echo "  https://nodejs.org  or  https://github.com/nodesource/distributions  (or nvm)"
    exit 1
fi

# MagicMirror's own postinstall runs `git clean -df fonts vendor`, so `npm
# install` exits 127 without git — and minimal images (debian-slim, alpine) do
# not ship it. Check up front instead of failing mid-install with npm's opaque
# 127, which also leaves config.js unseeded.
command -v git >/dev/null 2>&1 || {
    echo "git not found — MagicMirror's npm postinstall needs it. Install it and re-run:"
    echo "  Debian/Ubuntu: sudo apt-get install -y git"
    echo "  Alpine:        apk add git"
    echo "  macOS:         xcode-select --install"
    exit 1
}

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
    <!-- launchd starts with a minimal PATH that omits the Node install dir, so
         any module shelling out (update checks, git helpers) fails with
         "/bin/sh: node: command not found". The main process is unaffected
         because it is launched by absolute path, but the log fills with errors.
         Put Node's own directory first so child processes resolve it. -->
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
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
    if [ "${EUID:-$(id -u)}" -ne 0 ]; then echo "Linux install needs sudo: sudo $0"; exit 1; fi
    # $USER is unset in a bare `sudo`/root shell, and `set -u` would abort here.
    USER_NAME="${SUDO_USER:-${USER:-$(id -un)}}"
    UNIT="/etc/systemd/system/magicmirror.service"
    # Not every Linux runs systemd (Alpine uses OpenRC; containers/WSL1 have it
    # installed but not as PID 1). npm deps and config.js are already in place,
    # so degrade to instructions instead of failing on a missing service manager.
    if ! command -v systemctl >/dev/null 2>&1 && [ ! -d /etc/systemd/system ]; then
        echo "=> No systemd here — skipping service unit. Start $DISPLAY with:"
        echo "     cd $PROJECT_ROOT && $NODE_BIN --expose-gc --max-old-space-size=512 ./serveronly"
        echo "=> Done."
        exit 0
    fi
    mkdir -p /etc/systemd/system
    cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=$DISPLAY (server-only)
After=network.target
[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$PROJECT_ROOT
# systemd starts with a minimal PATH that omits the Node install dir, so any
# module shelling out (update checks, git helpers) fails with "node: command
# not found" — same issue as the launchd EnvironmentVariables PATH above.
Environment=PATH=$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin
Environment=MM_PORT=$PORT
ExecStart=$NODE_BIN --expose-gc --max-old-space-size=512 $PROJECT_ROOT/serveronly
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
UNIT_EOF
    if systemctl daemon-reload 2>/dev/null && systemctl enable magicmirror.service 2>/dev/null; then
        echo "=> $DISPLAY installed (systemd, port $PORT). Start: sudo systemctl start magicmirror"
    else
        # systemd present but not PID 1 (containers, WSL1, chroots).
        echo "=> Unit written to $UNIT, but systemd is not running here. Start with:"
        echo "     cd $PROJECT_ROOT && $NODE_BIN --expose-gc --max-old-space-size=512 ./serveronly"
    fi
    ;;
  *)
    echo "Unsupported OS: $OS"; exit 1 ;;
esac
echo "=> Done."
