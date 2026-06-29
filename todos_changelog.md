# MagicMirror³ (Ecosystem Fork) — TODO / Changelog Tracker

Tracks this fork's ecosystem-specific work. Upstream MagicMirror history is in
[CHANGELOG.md](CHANGELOG.md).

## Open work

### Ecosystem modules
- [ ] **Rename `modules/MMM-AsusGuard-SIEM` → `MMM-AegisSIEM`** to match the
  AsusGuard→AegisSIEM rename (avoids the ASUS® trademark in a module name). Currently
  untracked WIP.
- [ ] Decide tracked-vs-ignored for the untracked fork additions
  (`ECOSYSTEM_GUIDE.md`, `modules/MMM-AsusGuard-SIEM/`, `modules/MMM-CyberHarness/`).

### Upstream FIXMEs (inherited)
- [ ] `js/app.js:40` — hotfix pull request marker.
- [ ] `js/check_config.js:21` — move config-passing logic into core (refactor; flagged
  as breaking tests if moved naively).

### From the broader ecosystem backlog
- [ ] Calendar: Facebook-birthday fetch issue (`calendarfetcherutils.js`).
- [ ] Security dashboard: show a specific camera in fullscreen (`security.js`).
- [ ] Weather: unit conversion for precipitation (hardcoded `mm`) (`weatherflow.js`).

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
