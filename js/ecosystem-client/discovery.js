const http = require("http");
const https = require("https");

const DiscoveryMode = {
    REGISTRY: "registry",
    PEER_TO_PEER: "peer_to_peer",
    STANDALONE: "standalone",
};

class DiscoveryManager {
    constructor(config) {
        this.config = config;
        this.mode = DiscoveryMode.STANDALONE;
        this._peers = {};
        this._mdnsPeers = [];
    }

    async detectMode() {
        if (!this.config.enabled) {
            this.mode = DiscoveryMode.STANDALONE;
            return this.mode;
        }

        if (await this._checkRegistry()) {
            this.mode = DiscoveryMode.REGISTRY;
            return this.mode;
        }

        const mdnsPeers = this._checkMdns();
        if (mdnsPeers.length > 0) {
            this._mdnsPeers = mdnsPeers;
            this.mode = DiscoveryMode.PEER_TO_PEER;
            return this.mode;
        }

        if (Object.keys(this.config.peers).length > 0) {
            this.mode = DiscoveryMode.PEER_TO_PEER;
            return this.mode;
        }

        this.mode = DiscoveryMode.STANDALONE;
        return this.mode;
    }

    async getPeers() {
        if (this.mode === DiscoveryMode.REGISTRY) {
            return await this._fetchRegistryServices();
        }
        if (this.mode === DiscoveryMode.PEER_TO_PEER) {
            const peers = {};
            for (const [name, url] of Object.entries(this.config.peers)) {
                peers[name] = { name, base_url: url };
            }
            return peers;
        }
        return {};
    }

    async registerSelf(name, host, port, healthEndpoint, webhookUrl, subscriptions) {
        if (this.mode !== DiscoveryMode.REGISTRY) return false;
        try {
            const payload = JSON.stringify({
                name, host, port,
                health_endpoint: healthEndpoint,
                webhook_url: webhookUrl,
                subscriptions: subscriptions || [],
            });
            await this._post(`${this.config.registryUrl}/register`, payload);
            return true;
        } catch {
            return false;
        }
    }

    async deregisterSelf(name) {
        if (this.mode !== DiscoveryMode.REGISTRY) return false;
        try {
            await this._delete(`${this.config.registryUrl}/deregister/${name}`);
            return true;
        } catch {
            return false;
        }
    }

    async _checkRegistry() {
        try {
            await this._get(`${this.config.registryUrl}/health`);
            return true;
        } catch {
            return false;
        }
    }

    _checkMdns() {
        try {
            const { Bonjour } = require("bonjour-service");
            // Synchronous browse not practical; return empty for now
        } catch { /* not installed */ }
        return [];
    }

    async _fetchRegistryServices() {
        try {
            const data = await this._get(`${this.config.registryUrl}/services`);
            const peers = {};
            for (const svc of data) {
                peers[svc.name] = svc;
            }
            return peers;
        } catch {
            return {};
        }
    }

    _get(url) {
        return new Promise((resolve, reject) => {
            const lib = url.startsWith("https") ? https : http;
            const req = lib.get(url, { timeout: this.config.requestTimeout }, (res) => {
                let body = "";
                res.on("data", (chunk) => body += chunk);
                res.on("end", () => {
                    if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
                    try { resolve(JSON.parse(body)); } catch { resolve(body); }
                });
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        });
    }

    _post(url, body) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const lib = parsed.protocol === "https:" ? https : http;
            const req = lib.request({
                hostname: parsed.hostname, port: parsed.port, path: parsed.pathname,
                method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
                timeout: this.config.requestTimeout,
            }, (res) => {
                let data = "";
                res.on("data", (chunk) => data += chunk);
                res.on("end", () => {
                    if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
                    try { resolve(JSON.parse(data)); } catch { resolve(data); }
                });
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
            req.write(body);
            req.end();
        });
    }

    _delete(url) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const lib = parsed.protocol === "https:" ? https : http;
            const req = lib.request({
                hostname: parsed.hostname, port: parsed.port, path: parsed.pathname,
                method: "DELETE", timeout: this.config.requestTimeout,
            }, (res) => {
                let data = "";
                res.on("data", (chunk) => data += chunk);
                res.on("end", () => resolve(data));
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
            req.end();
        });
    }
}

module.exports = { DiscoveryManager, DiscoveryMode };
