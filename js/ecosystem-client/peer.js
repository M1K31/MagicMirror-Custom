const http = require("http");
const https = require("https");
const { createEcosystemToken } = require("../../auth/js/src/tokens");

class Peer {
    constructor(name, baseUrl, hmacSecret, timeout = 5000) {
        this.name = name;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this._hmacSecret = hmacSecret;
        this._timeout = timeout;
        this._degraded = false;
    }

    get isDegraded() { return this._degraded; }
    markDegraded() { this._degraded = true; }
    markHealthy() { this._degraded = false; }

    async get(path) { return this._request("GET", path); }
    async post(path, body) { return this._request("POST", path, body); }

    async _request(method, path, body = null) {
        const url = `${this.baseUrl}${path}`;
        const token = createEcosystemToken(this._hmacSecret, this.name);
        const headers = {
            "Authorization": `Bearer ${JSON.stringify(token)}`,
            "X-Ecosystem-Source": this.name,
        };
        if (body) headers["Content-Type"] = "application/json";

        try {
            const result = await this._httpRequest(method, url, headers, body);
            this.markHealthy();
            return result;
        } catch (e) {
            this.markDegraded();
            return null;
        }
    }

    _httpRequest(method, url, headers, body) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const lib = parsed.protocol === "https:" ? https : http;
            const bodyStr = body ? JSON.stringify(body) : null;
            if (bodyStr) headers["Content-Length"] = Buffer.byteLength(bodyStr);

            const req = lib.request({
                hostname: parsed.hostname, port: parsed.port,
                path: parsed.pathname + parsed.search,
                method, headers, timeout: this._timeout,
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
            if (bodyStr) req.write(bodyStr);
            req.end();
        });
    }
}

module.exports = { Peer };
