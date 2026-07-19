#!/usr/bin/env bash
# Uninstall MagicMirror but KEEP config/config.js (your module layout).
# Removes the service and node_modules only, so a later ./scripts/install.sh
# restores your display exactly as configured.
#
# For a complete wipe (including config.js) use ./scripts/uninstall.sh
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/uninstall.sh" --keep-data "$@"
