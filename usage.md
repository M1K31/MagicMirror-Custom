# MagicMirror³ (Ecosystem Fork) — Usage Guide

This is an ecosystem fork of MagicMirror³ — the visual hub for the Unified Security
& AI Ecosystem. This guide covers running it, the ecosystem-specific config, and the
custom modules. For the full module/config reference see the upstream
[MagicMirror documentation](https://docs.magicmirror.builders/).

---

## 1. Install & run

```bash
./scripts/install.sh        # npm install + writes & loads the launchd/systemd service
./scripts/start.sh          # start the display server
./scripts/stop.sh           # stop it
./scripts/uninstall.sh      # remove the service
```

Server-only (headless, what the ecosystem uses — no Electron window):

```bash
node serveronly             # serves the mirror UI over HTTP on the configured port (8080)
```

Open `http://127.0.0.1:8080` in a browser to view the mirror.

---

## 2. Ecosystem configuration (`config/config.js`)

`config.js` is evaluated in **both** Node (server) and the browser (client), so any
`process.env` access **must** be guarded — an unguarded `process` reference throws in
the browser and renders the mirror **blank**.

Bind/whitelist follow `ECOSYSTEM_MODE`:

```js
const ECO_ENV = (typeof process !== "undefined" && process.env) ? process.env : {};
const ECO_LAN = String(ECO_ENV.ECOSYSTEM_MODE || "local").trim().toLowerCase() === "lan";
let config = {
  address: ECO_ENV.MM_ADDRESS || (ECO_LAN ? "0.0.0.0" : "127.0.0.1"),
  ipWhitelist: ECO_LAN ? [] : ["127.0.0.1", "::ffff:127.0.0.1", "::1"],
  // ...
};
```

- **`local`** (default): binds IPv4 loopback `127.0.0.1`; whitelist limited to loopback.
- **`lan`**: binds `0.0.0.0` and opens the whitelist for the trusted LAN.

> Don't use `address: "localhost"` — on macOS it binds IPv6 `::1` only, which makes the
> registry health-check (on `127.0.0.1`) fail. Use `127.0.0.1` / `0.0.0.0`.

---

## 3. Ecosystem integration

The bundled `js/ecosystem-client/` registers MM with the appEcosystem registry when
present (heartbeat re-registration so a DHCP/IP change is pushed), and degrades to
standalone when absent.

- **Shared secret:** read from `~/.config/ecosystem/secret.env` (file-backed,
  fail-closed). Provision it with the appEcosystem CLI:
  ```bash
  ecosystem secret import <value>     # value from `ecosystem secret show` on the primary device
  ```
- **Mode:** set `ECOSYSTEM_MODE=local|lan` (and optionally `ECOSYSTEM_REGISTRY_URL`,
  `ECOSYSTEM_SERVICE_PORT`) in the environment the server runs under.

---

## 4. Custom (ecosystem) modules

| Module | Purpose |
|--------|---------|
| `modules/MMM-AegisSIEM` | Live threat feed / SIEM panel from AegisSIEM (`:8088/api/status`) |
| `modules/MMM-CyberHarness` | Cyber Claude Harness status / analysis |
| `modules/openeye-events` | Physical-security events from OpenEye |
| `modules/maintenance` | Ecosystem maintenance / health surface |

Enable a module by adding it to the `modules: [...]` array in `config/config.js` with
its `position` and `config` block (see each module's own `README`).

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Blank mirror** (page loads, nothing renders) | Unguarded `process.env` in `config.js` (throws in the browser) | Guard with `typeof process !== "undefined"` (done in the shipped config) |
| Registry shows MM "unhealthy" | `address: "localhost"` binds IPv6 `::1` only | Use `127.0.0.1` (local) / `0.0.0.0` (lan) |
| `favicon.ico 404` | Cosmetic | Harmless |
