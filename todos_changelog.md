# MagicMirror³ (Ecosystem Fork) — TODO / Changelog Tracker

Tracks this fork's ecosystem-specific work. Upstream MagicMirror history is in
[CHANGELOG.md](CHANGELOG.md).

## Open work

### Ecosystem modules
- [ ] Decide tracked-vs-ignored for the untracked fork additions
  (`ECOSYSTEM_GUIDE.md`, `modules/MMM-AegisSIEM/`, `modules/MMM-CyberHarness/`).

### Upstream FIXMEs (inherited)
- [ ] `js/app.js:40` — hotfix pull request marker.
- [ ] `js/check_config.js:21` — move config-passing logic into core (refactor; flagged
  as breaking tests if moved naively).

### From the broader ecosystem backlog
- [ ] Calendar: Facebook-birthday fetch issue (`calendarfetcherutils.js`).
- [ ] Security dashboard: show a specific camera in fullscreen (`security.js`).
- [ ] Weather: unit conversion for precipitation (hardcoded `mm`) (`weatherflow.js`).

## Recent changes (2026-07-01)

- **Renamed `MMM-AsusGuard-SIEM` → `MMM-AegisSIEM`** — completes the AsusGuard→AegisSIEM
  rebrand (drops the ASUS® trademark from the module name). Renamed the dir + `.js`/`.css`
  files, the `Module.register` id, `getStyles`, the `asusguard-siem-wrapper` CSS class, and
  the `asusGuardUrl`→`aegisSiemUrl` config key. Still targets `:8088/api/status`. JS
  syntax-checked. (Untracked WIP module.)

## Recent changes (2026-06-28)

- **Fixed blank-screen regression** — `config/config.js(.sample)` referenced
  `process.env` at top level, which throws in the browser (`ReferenceError: process is
  not defined`) and aborts rendering. Now guarded with `typeof process`. Verified in
  Chrome: clock, calendar, weather, compliments, newsfeed all render.
- **Mode-aware bind** — `address`/`ipWhitelist` follow `ECOSYSTEM_MODE`
  (loopback in `local`, `0.0.0.0` in `lan`); avoids the `localhost`→IPv6-`::1` trap that
  made the registry report MM unhealthy.
- **Topology + heartbeat** — `js/ecosystem-client/topology.js` (mode/bind/advertise);
  the client re-registers on an interval so a DHCP/IP change updates the registry.
- **File-backed, fail-closed shared secret** — `js/ecosystem-client/secret.js` reads
  `~/.config/ecosystem/secret.env`; no dev-default.

## 🔭 Open follow-ups (flagged 2026-07-21)

Ecosystem-wide context is recorded in `appEcosystem/todos_changelog.md`.

- [ ] Binds `127.0.0.1` unless `ECO_LAN`/`MM_ADDRESS` is set (documented in README).

## 🐧 Linux smoke test — 2026-07-22

Ran `scripts/install.sh` in `debian:bookworm-slim`, `alpine:3.20`, and
`node:22-bookworm-slim`. Four fixes across `94688e3` and `9b901ed`. On a Node 22
image the install now completes and the server serves HTTP 200.

1. **`$USER` unbound under `set -u`** in the Linux branch — aborted right after
   the root check.
2. **systemd assumed present.** Alpine (OpenRC) has no `/etc/systemd/system`,
   and containers/WSL1 have systemd installed but not as PID 1. Now skipped or
   degraded to a direct start command.
3. **git undeclared but required.** MagicMirror's own npm postinstall runs
   `git clean -df fonts vendor`, so `npm install` exited 127 without git — which
   neither slim image ships — aborting before config.js was seeded. Preflighted.
4. **Node version not enforced.** package.json needs `>=22.14.0`; the installer
   only checked node *existed* despite its own "need Node 22+" message. Old node
   does not fail cleanly — MagicMirror starts, garbles its logs, and never binds
   the port (seen on Debian's Node 18 and Alpine's Node 20). Now enforced.

### Still open

- [x] **systemd `Environment=PATH=` unit** — written correctly and the no-systemd
  degrade path is proven, but `systemctl start` itself is still unrun (containers
  are not PID-1 systemd). Needs a `systemd:*` `--privileged` image — owner call.
- [ ] **`uninstall.sh`/`uninstall-keep-data.sh` unrun on Linux** — likely share
  the assume-systemd bug class just fixed in install.sh; check when tested.
- **Doc-policy note:** `todos_changelog.md` is tracked here and in
  OpenEye/LogAnalysis/AFS, but gitignored in appEcosystem — one convention is
  wrong under the no-dev-`.md` policy. Owner call.
