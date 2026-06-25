/* Shared-secret resolution — JS mirror of Python ecosystem_auth.tokens.
 *
 * All ecosystem apps read one file-backed secret (~/.config/ecosystem/secret.env)
 * so a single `ecosystem secret import` (or the in-app setup panel) provisions
 * every service on the host — MagicMirror included. Resolution order:
 *     explicit override -> ECOSYSTEM_HMAC_SECRET env -> secret file
 * Fail-closed: there is NO default. If none is found, the empty string is
 * returned (peers requiring a real secret reject unsigned requests), rather than
 * trusting the known development default.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_DEV_SECRET = "dev-ecosystem-secret-change-in-production";

function secretFilePath() {
    return (
        process.env.ECOSYSTEM_SECRET_FILE ||
        path.join(os.homedir(), ".config", "ecosystem", "secret.env")
    );
}

function readSecretFile() {
    try {
        const p = secretFilePath();
        if (!fs.existsSync(p)) return null;
        for (let line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
            line = line.trim();
            if (!line || line.startsWith("#")) continue;
            if (line.startsWith("export ")) line = line.slice("export ".length);
            if (line.startsWith("ECOSYSTEM_HMAC_SECRET=")) {
                const val = line.slice("ECOSYSTEM_HMAC_SECRET=".length).trim()
                    .replace(/^["']|["']$/g, "");
                return val || null;
            }
        }
    } catch (e) {
        return null;
    }
    return null;
}

/**
 * Resolve the shared secret fail-closed. Never returns the dev default; returns
 * "" when nothing is configured so callers/peers fail safely.
 */
function resolveSecret(override) {
    const secret =
        override || process.env.ECOSYSTEM_HMAC_SECRET || readSecretFile() || "";
    if (secret === DEFAULT_DEV_SECRET) return "";
    return secret;
}

module.exports = { DEFAULT_DEV_SECRET, secretFilePath, readSecretFile, resolveSecret };
