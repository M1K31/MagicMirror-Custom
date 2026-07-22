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

Full detail + the model-sync plan:
`appEcosystem/docs/superpowers/plans/2026-07-21-follow-ups-and-model-sync.md`

- [ ] **systemd `Environment=PATH=` unexercised** — the launchd `node: command not
  found` fix was mirrored into the systemd unit but has never run on Linux.
- [ ] Binds `127.0.0.1` unless `ECO_LAN`/`MM_ADDRESS` is set (documented in README).
