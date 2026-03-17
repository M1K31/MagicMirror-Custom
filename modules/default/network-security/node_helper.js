const NodeHelper = require("node_helper");
const Log = require("logger");

let EcosystemClient;
try {
	({ EcosystemClient } = require("../../../js/ecosystem-client"));
} catch {
	EcosystemClient = null;
}

module.exports = NodeHelper.create({
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.config = null;
		this._ecoClient = null;
		this._pollTimer = null;
	},

	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "NETSEC_INIT":
				this.initialize(payload);
				break;
			case "NETSEC_REFRESH":
				this.fetchData();
				break;
		}
	},

	initialize: async function (config) {
		this.config = config;

		// Try ecosystem discovery first, fall back to config host
		let resolvedHost = config.loganalysisHost;
		if (EcosystemClient && !this._ecoClient) {
			try {
				this._ecoClient = new EcosystemClient({
					serviceName: "magicmirror_netsec",
					servicePort: 8080,
				});
				await this._ecoClient.start();
				const peer = await this._ecoClient.discover("asusguard");
				if (peer) {
					resolvedHost = peer.baseUrl;
					Log.info(`[${this.name}] Discovered LogAnalysis via ecosystem: ${resolvedHost}`);
				}
			} catch (e) {
				Log.debug(`[${this.name}] Ecosystem discovery failed: ${e.message}`);
			}
		}
		this.config.host = resolvedHost;

		try {
			await this.fetchData();

			// Subscribe to ecosystem events
			if (this._ecoClient) {
				this._ecoClient.on("security.threat_blocked", async (envelope) => {
					this.sendSocketNotification("NETSEC_THREAT_EVENT", {
						type: "threat_blocked",
						ip: envelope.data.ip,
						reason: envelope.data.reason,
						severity: envelope.data.severity,
						blocked_by: envelope.data.blocked_by,
						timestamp: envelope.timestamp,
						source: "ecosystem",
					});
				});

				this._ecoClient.on("network.anomaly", async (envelope) => {
					this.sendSocketNotification("NETSEC_THREAT_EVENT", {
						type: "network_anomaly",
						anomaly_type: envelope.data.type,
						severity: envelope.data.severity,
						details: envelope.data.details,
						timestamp: envelope.timestamp,
						source: "ecosystem",
					});
				});

				this._ecoClient.on("security.alert", async (envelope) => {
					this.sendSocketNotification("NETSEC_THREAT_EVENT", {
						type: "security_alert",
						ip: envelope.data.ip,
						threat_type: envelope.data.threat_type,
						severity: envelope.data.severity,
						timestamp: envelope.timestamp,
						source: "ecosystem",
					});
				});
			}

			this.sendSocketNotification("NETSEC_CONNECTED", { host: this.config.host });

			// Start polling
			if (config.updateInterval > 0) {
				this._pollTimer = setInterval(() => this.fetchData(), config.updateInterval);
			}
		} catch (error) {
			Log.error(`[${this.name}] Connection error: ${error.message}`);
			this.sendSocketNotification("NETSEC_ERROR", {
				message: `Failed to connect to LogAnalysis: ${error.message}`
			});
		}
	},

	fetchData: async function () {
		await Promise.all([
			this.fetchStatus(),
			this.fetchThreats(),
		]);
	},

	fetchStatus: async function () {
		try {
			const response = await fetch(`${this.config.host}/api/status`);
			if (response.ok) {
				const data = await response.json();
				this.sendSocketNotification("NETSEC_STATUS", data);
			}
		} catch (error) {
			Log.debug(`[${this.name}] Failed to fetch status: ${error.message}`);
		}
	},

	fetchThreats: async function () {
		try {
			const response = await fetch(`${this.config.host}/api/honeypot/events`);
			if (response.ok) {
				const events = await response.json();
				this.sendSocketNotification("NETSEC_EVENTS", { events: events.slice(0, 20) });
			}
		} catch (error) {
			Log.debug(`[${this.name}] Failed to fetch events: ${error.message}`);
		}
	},

	stop: async function () {
		if (this._pollTimer) {
			clearInterval(this._pollTimer);
			this._pollTimer = null;
		}
		if (this._ecoClient) {
			try { await this._ecoClient.stop(); } catch { /* ignore */ }
			this._ecoClient = null;
		}
	}
});
