/**
 * Configuration for the ecosystem client.
 * Mirrors Python ecosystem_client.config.
 */

class EcosystemConfig {
    constructor(opts = {}) {
        this.registryUrl = opts.registryUrl || process.env.ECOSYSTEM_REGISTRY_URL || "http://localhost:8500";
        this.hmacSecret = opts.hmacSecret || process.env.ECOSYSTEM_HMAC_SECRET || "dev-ecosystem-secret-change-in-production";
        this.serviceName = opts.serviceName || process.env.ECOSYSTEM_SERVICE_NAME || null;
        this.servicePort = opts.servicePort || parseInt(process.env.ECOSYSTEM_SERVICE_PORT || "0") || null;
        this.healthEndpoint = opts.healthEndpoint || process.env.ECOSYSTEM_HEALTH_ENDPOINT || "/health";
        this.webhookPath = opts.webhookPath || "/ecosystem/events";
        this.enabled = opts.enabled !== undefined ? opts.enabled : (process.env.ECOSYSTEM_ENABLED || "true").toLowerCase() !== "false";
        this.discoveryInterval = opts.discoveryInterval || parseInt(process.env.ECOSYSTEM_DISCOVERY_INTERVAL || "60");
        this.requestTimeout = opts.requestTimeout || 5000;
        this.eventRetryAttempts = opts.eventRetryAttempts || 3;
        this.eventRetryDelay = opts.eventRetryDelay || 5000;
        this.peers = opts.peers || this._parsePeersEnv();
    }

    _parsePeersEnv() {
        const peersStr = process.env.ECOSYSTEM_PEERS || "";
        if (!peersStr) return {};
        const peers = {};
        for (const pair of peersStr.split(",")) {
            const [name, url] = pair.trim().split("=");
            if (name && url) peers[name.trim()] = url.trim();
        }
        return peers;
    }
}

module.exports = { EcosystemConfig };
