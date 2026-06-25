/* Deployment-topology resolution — JS port of the ecosystem's topology helper.
 *
 *   local (default) — bind + advertise on loopback (127.0.0.1). Single host.
 *   lan             — bind on all interfaces, advertise this host's LAN IP so
 *                     peers/registry can reach it.
 *
 * The bind host (where a server listens) and advertise host (how peers reach it)
 * must agree, or health checks fail — that mismatch is what made MagicMirror
 * register as a LAN IP while only listening on IPv6 ::1. Select with
 * ECOSYSTEM_MODE=local|lan; individual values can always be overridden.
 */
const os = require("os");

const LOCAL = "local";
const LAN = "lan";
const LOOPBACK = "127.0.0.1";
const ALL_INTERFACES = "0.0.0.0";

function getMode() {
    const mode = String(process.env.ECOSYSTEM_MODE || LOCAL).trim().toLowerCase();
    return mode === LAN ? LAN : LOCAL;
}

function isLan() {
    return getMode() === LAN;
}

function detectLanIp() {
    const override = (process.env.ECOSYSTEM_ADVERTISE_HOST || "").trim();
    if (override) return override;
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === "IPv4" && !net.internal && net.address) {
                return net.address;
            }
        }
    }
    return LOOPBACK;
}

function bindHost() {
    const override = (process.env.ECOSYSTEM_BIND_HOST || "").trim();
    if (override) return override;
    return isLan() ? ALL_INTERFACES : LOOPBACK;
}

function advertiseHost() {
    const override = (process.env.ECOSYSTEM_ADVERTISE_HOST || "").trim();
    if (override) return override;
    return isLan() ? detectLanIp() : LOOPBACK;
}

function isLoopback(host) {
    const h = String(host || "").trim().toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "ip6-localhost"].includes(h);
}

module.exports = {
    LOCAL,
    LAN,
    getMode,
    isLan,
    detectLanIp,
    bindHost,
    advertiseHost,
    isLoopback,
};
