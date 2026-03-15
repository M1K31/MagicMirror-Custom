const { signPayload, verifySignature } = require("../../auth/js/src/tokens");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

class EventPublisher {
    constructor(config, mode, serviceName) {
        this.config = config;
        this.mode = mode;
        this.serviceName = serviceName;
        this._peerWebhooks = {};
    }

    setPeerWebhooks(webhooks) { this._peerWebhooks = webhooks; }

    async publish(eventType, data) {
        if (this.mode === "standalone") {
            return { delivered: 0, failed: 0, mode: "standalone" };
        }
        const envelope = this._buildEnvelope(eventType, data);
        const matching = this._getMatchingPeers(eventType);
        let delivered = 0;
        for (const [name, info] of Object.entries(matching)) {
            try {
                await this._deliverToPeer(envelope, info.webhook_url);
                delivered++;
            } catch { /* failed delivery */ }
        }
        return { delivered, failed: Object.keys(matching).length - delivered, subscribers: Object.keys(matching) };
    }

    _buildEnvelope(eventType, data) {
        const envelope = {
            id: crypto.randomUUID(),
            type: eventType,
            source: this.serviceName,
            timestamp: Date.now() / 1000,
            data,
        };
        const signable = { id: envelope.id, type: envelope.type, source: envelope.source, timestamp: envelope.timestamp, data: envelope.data };
        envelope.signature = signPayload(signable, this.config.hmacSecret);
        return envelope;
    }

    _getMatchingPeers(eventType) {
        const matching = {};
        for (const [name, info] of Object.entries(this._peerWebhooks)) {
            for (const pattern of (info.subscriptions || [])) {
                if (pattern === "*" || (pattern.endsWith(".*") && eventType.startsWith(pattern.slice(0, -2) + ".")) || pattern === eventType) {
                    matching[name] = info;
                    break;
                }
            }
        }
        return matching;
    }

    async _deliverToPeer(envelope, webhookUrl) {
        const body = JSON.stringify(envelope);
        return new Promise((resolve, reject) => {
            const parsed = new URL(webhookUrl);
            const lib = parsed.protocol === "https:" ? https : http;
            const req = lib.request({
                hostname: parsed.hostname, port: parsed.port, path: parsed.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(body),
                    "X-Ecosystem-Signature": envelope.signature,
                    "X-Ecosystem-Event": envelope.type,
                    "X-Ecosystem-Source": envelope.source,
                },
                timeout: this.config.requestTimeout,
            }, (res) => {
                res.resume();
                res.on("end", () => res.statusCode < 400 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`)));
            });
            req.on("error", reject);
            req.write(body);
            req.end();
        });
    }
}

class EventSubscriber {
    constructor(hmacSecret) {
        this._hmacSecret = hmacSecret;
        this._handlers = {};
    }

    on(eventPattern, handler) {
        if (!this._handlers[eventPattern]) this._handlers[eventPattern] = [];
        this._handlers[eventPattern].push(handler);
    }

    async dispatch(envelope) {
        const signable = { id: envelope.id, type: envelope.type, source: envelope.source, timestamp: envelope.timestamp, data: envelope.data };
        if (!verifySignature(signable, envelope.signature || "", this._hmacSecret)) return;

        for (const [pattern, handlers] of Object.entries(this._handlers)) {
            if (this._matches(envelope.type, pattern)) {
                for (const handler of handlers) {
                    try { await handler(envelope); } catch (e) { console.error(`Handler error: ${e}`); }
                }
            }
        }
    }

    _matches(eventType, pattern) {
        if (pattern === "*") return true;
        if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -2) + ".");
        return eventType === pattern;
    }

    get subscriptions() { return Object.keys(this._handlers); }
}

module.exports = { EventPublisher, EventSubscriber };
