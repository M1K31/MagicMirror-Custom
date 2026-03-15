const { EcosystemConfig } = require("./config");
const { DiscoveryManager, DiscoveryMode } = require("./discovery");
const { EventPublisher, EventSubscriber } = require("./events");
const { Peer } = require("./peer");
const os = require("os");

class EcosystemClient {
    constructor(opts = {}) {
        this.config = new EcosystemConfig(opts);
        this.config.serviceName = opts.serviceName || this.config.serviceName;
        this.config.servicePort = opts.servicePort || this.config.servicePort;
        this.config.healthEndpoint = opts.healthEndpoint || this.config.healthEndpoint;

        this._serviceName = this.config.serviceName;
        this._servicePort = this.config.servicePort;
        this._healthEndpoint = this.config.healthEndpoint;
        this._subscriptions = opts.subscriptions || [];

        this._discovery = new DiscoveryManager(this.config);
        this._publisher = new EventPublisher(this.config, DiscoveryMode.STANDALONE, this._serviceName);
        this._subscriber = new EventSubscriber(this.config.hmacSecret);
        this._peers = {};
        this._peerObjects = {};
        this._started = false;
        this._refreshInterval = null;
    }

    get mode() { return this._discovery.mode; }

    async start() {
        if (this._started) return;
        const mode = await this._discovery.detectMode();
        this._publisher.mode = mode;

        if (mode === DiscoveryMode.REGISTRY) {
            const host = this._getLocalIp();
            const webhookUrl = `http://${host}:${this._servicePort}${this.config.webhookPath}`;
            await this._discovery.registerSelf(
                this._serviceName, host, this._servicePort,
                this._healthEndpoint, webhookUrl, this._subscriptions
            );
        }

        await this._refreshPeers();
        this._started = true;

        this._refreshInterval = setInterval(() => this._refreshPeers().catch(() => {}), this.config.discoveryInterval * 1000);
    }

    async stop() {
        if (this._refreshInterval) clearInterval(this._refreshInterval);
        if (this._discovery.mode === DiscoveryMode.REGISTRY) {
            await this._discovery.deregisterSelf(this._serviceName);
        }
        this._started = false;
    }

    async discover(serviceName) {
        if (this._peerObjects[serviceName] && !this._peerObjects[serviceName].isDegraded) {
            return this._peerObjects[serviceName];
        }
        const info = this._peers[serviceName];
        if (info && info.base_url) {
            const peer = new Peer(serviceName, info.base_url, this.config.hmacSecret, this.config.requestTimeout);
            this._peerObjects[serviceName] = peer;
            return peer;
        }
        return null;
    }

    async publish(eventType, data) {
        return this._publisher.publish(eventType, data);
    }

    on(eventPattern, handler) {
        this._subscriber.on(eventPattern, handler);
        if (!this._subscriptions.includes(eventPattern)) this._subscriptions.push(eventPattern);
    }

    async handleWebhook(envelope) {
        await this._subscriber.dispatch(envelope);
    }

    async _refreshPeers() {
        this._peers = await this._discovery.getPeers();
    }

    _getLocalIp() {
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === "IPv4" && !net.internal) return net.address;
            }
        }
        return "127.0.0.1";
    }
}

module.exports = { EcosystemClient, DiscoveryMode };
