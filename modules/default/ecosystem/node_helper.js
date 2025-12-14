/**
 * Ecosystem Module - Node Helper
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Handles backend operations for ecosystem integration:
 * - Network discovery of companion apps
 * - Cross-app API communication
 * - User and integration synchronization
 * - Notification relay
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const os = require("os");
const fs = require("fs").promises;
const path = require("path");

module.exports = NodeHelper.create({
	/**
	 * Start the node helper
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper starting...`);

		this.configPath = path.join(__dirname, "..", "..", "..", "config");
		this.ecosystemPath = path.join(this.configPath, "ecosystem.json");
		this.connectedApps = {};
		this.discoveredApps = {};

		// Load saved ecosystem state
		this.loadEcosystemState();
	},

	/**
	 * Load ecosystem state from file
	 */
	loadEcosystemState: async function () {
		try {
			const data = await fs.readFile(this.ecosystemPath, "utf8");
			const state = JSON.parse(data);
			this.connectedApps = state.connectedApps || {};
			Log.info(`[${this.name}] Loaded ecosystem state: ${Object.keys(this.connectedApps).length} apps`);
		} catch {
			// File doesn't exist yet
			this.connectedApps = {};
		}
	},

	/**
	 * Save ecosystem state to file
	 */
	saveEcosystemState: async function () {
		try {
			await fs.writeFile(this.ecosystemPath, JSON.stringify({
				connectedApps: this.connectedApps,
				lastUpdated: new Date().toISOString()
			}, null, 2));
		} catch (error) {
			Log.error(`[${this.name}] Failed to save ecosystem state: ${error.message}`);
		}
	},

	/**
	 * Handle socket notifications from frontend
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "ECOSYSTEM_DISCOVER":
				this.discoverApps(payload.apps, payload.timeout);
				break;

			case "ECOSYSTEM_CONNECT":
				this.connectToApp(payload.appId, payload.host, payload.apiPrefix);
				break;

			case "ECOSYSTEM_SYNC_USERS":
				this.syncUsers(payload.appId, payload.direction);
				break;

			case "ECOSYSTEM_SYNC_INTEGRATIONS":
				this.syncIntegrations(payload.appId, payload.direction);
				break;

			case "ECOSYSTEM_RELAY_NOTIFICATION":
				this.relayNotification(payload.notification, payload.targets, payload.methods);
				break;

			case "ECOSYSTEM_GET_STATUS":
				this.sendStatus();
				break;
		}
	},

	/**
	 * Get local network addresses
	 */
	getLocalNetworkInfo: function () {
		const interfaces = os.networkInterfaces();
		const networks = [];

		for (const [name, addrs] of Object.entries(interfaces)) {
			for (const addr of addrs) {
				if (addr.family === "IPv4" && !addr.internal) {
					// Extract network prefix (e.g., 192.168.1)
					const parts = addr.address.split(".");
					networks.push({
						interface: name,
						address: addr.address,
						prefix: `${parts[0]}.${parts[1]}.${parts[2]}`
					});
				}
			}
		}

		return networks;
	},

	/**
	 * Discover companion apps on the network
	 */
	discoverApps: async function (appConfigs, timeout = 5000) {
		const networks = this.getLocalNetworkInfo();
		const discovered = {};

		Log.info(`[${this.name}] Starting discovery on ${networks.length} network(s)...`);

		for (const [appId, appConfig] of Object.entries(appConfigs)) {
			// Try common discovery methods
			const found = await this.findApp(appId, appConfig, networks, timeout);
			if (found) {
				discovered[appId] = found;
			}
		}

		// Also check saved connections
		for (const [appId, appInfo] of Object.entries(this.connectedApps)) {
			if (!discovered[appId]) {
				// Check if still reachable
				const reachable = await this.checkAppReachable(appInfo.host, appInfo.apiPrefix);
				if (reachable) {
					discovered[appId] = appInfo;
				}
			}
		}

		this.discoveredApps = discovered;
		this.sendSocketNotification("ECOSYSTEM_APPS_FOUND", { apps: discovered });
	},

	/**
	 * Find a specific app on the network
	 */
	findApp: async function (appId, appConfig, networks, timeout) {
		// Method 1: Check localhost first
		const localhostResult = await this.checkAppReachable(
			`http://localhost:${appConfig.defaultPort}`,
			appConfig.apiPrefix,
			timeout
		);
		if (localhostResult) {
			return {
				...appConfig,
				host: `http://localhost:${appConfig.defaultPort}`,
				discoveredAt: new Date().toISOString()
			};
		}

		// Method 2: Check common local addresses
		for (const network of networks) {
			// Check the host's own address
			const hostResult = await this.checkAppReachable(
				`http://${network.address}:${appConfig.defaultPort}`,
				appConfig.apiPrefix,
				timeout
			);
			if (hostResult) {
				return {
					...appConfig,
					host: `http://${network.address}:${appConfig.defaultPort}`,
					discoveredAt: new Date().toISOString()
				};
			}
		}

		// Method 3: mDNS/Bonjour (if available)
		// This would use the mdns or bonjour npm packages
		// For now, we rely on explicit configuration

		return null;
	},

	/**
	 * Check if an app is reachable
	 */
	checkAppReachable: async function (host, apiPrefix, timeout = 3000) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			const response = await fetch(`${host}${apiPrefix}/`, {
				signal: controller.signal,
				headers: { Accept: "application/json" }
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json().catch(() => ({}));
				return {
					version: data.version,
					capabilities: data.capabilities || {},
					name: data.name || data.app_name
				};
			}
		} catch {
			// Not reachable
		}
		return null;
	},

	/**
	 * Connect to a companion app
	 */
	connectToApp: async function (appId, host, apiPrefix) {
		try {
			// Get app info and capabilities
			const info = await this.checkAppReachable(host, apiPrefix);
			if (!info) {
				throw new Error("App not reachable");
			}

			// Try to establish a connection token exchange
			const connectionResult = await this.exchangeTokens(host, apiPrefix);

			this.connectedApps[appId] = {
				host: host,
				apiPrefix: apiPrefix,
				...info,
				token: connectionResult?.token,
				connectedAt: new Date().toISOString()
			};

			await this.saveEcosystemState();

			this.sendSocketNotification("ECOSYSTEM_APP_CONNECTED", {
				appId: appId,
				...this.connectedApps[appId]
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to connect to ${appId}: ${error.message}`);
			this.sendSocketNotification("ECOSYSTEM_ERROR", {
				message: `Failed to connect to ${appId}: ${error.message}`
			});
		}
	},

	/**
	 * Exchange authentication tokens with companion app
	 */
	exchangeTokens: async function (host, apiPrefix) {
		try {
			// Read our API token
			const tokenPath = path.join(this.configPath, ".api_token");
			const tokenData = JSON.parse(await fs.readFile(tokenPath, "utf8"));

			// Request connection from companion app
			const response = await fetch(`${host}${apiPrefix}/ecosystem/connect`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					app: "magicmirror",
					version: "3.0.0",
					host: tokenData.host,
					token: tokenData.token,
					capabilities: ["notifications", "users", "integrations"]
				})
			});

			if (response.ok) {
				return await response.json();
			}
		} catch (error) {
			Log.warn(`[${this.name}] Token exchange failed: ${error.message}`);
		}
		return null;
	},

	/**
	 * Sync users with a companion app
	 */
	syncUsers: async function (appId, direction) {
		const app = this.connectedApps[appId];
		if (!app) {
			this.sendSocketNotification("ECOSYSTEM_ERROR", {
				message: `App ${appId} not connected`
			});
			return;
		}

		try {
			// Get our users
			const ourUsers = await this.getLocalUsers();

			// Get remote users
			const remoteUsers = await this.getRemoteUsers(app);

			let syncedCount = 0;

			if (direction === "bidirectional" || direction === "pull") {
				// Import users from remote app
				for (const user of remoteUsers) {
					if (!ourUsers.find((u) => u.email === user.email || u.username === user.username)) {
						await this.createLocalUser(user);
						syncedCount++;
					}
				}
			}

			if (direction === "bidirectional" || direction === "push") {
				// Export our users to remote app
				for (const user of ourUsers) {
					if (!remoteUsers.find((u) => u.email === user.email || u.username === user.username)) {
						await this.createRemoteUser(app, user);
						syncedCount++;
					}
				}
			}

			this.sendSocketNotification("ECOSYSTEM_USERS_SYNCED", {
				app: app.name || appId,
				count: syncedCount
			});
		} catch (error) {
			Log.error(`[${this.name}] User sync failed: ${error.message}`);
			this.sendSocketNotification("ECOSYSTEM_ERROR", {
				message: `User sync failed: ${error.message}`
			});
		}
	},

	/**
	 * Get local users
	 */
	getLocalUsers: async function () {
		try {
			const usersPath = path.join(this.configPath, "users.json");
			const data = await fs.readFile(usersPath, "utf8");
			return JSON.parse(data).users || [];
		} catch {
			return [];
		}
	},

	/**
	 * Get users from remote app
	 */
	getRemoteUsers: async function (app) {
		try {
			const headers = { "Content-Type": "application/json" };
			if (app.token) {
				headers["Authorization"] = `Bearer ${app.token}`;
			}

			const response = await fetch(`${app.host}${app.apiPrefix}/users/`, { headers });
			if (response.ok) {
				const data = await response.json();
				return data.users || [];
			}
		} catch (error) {
			Log.warn(`[${this.name}] Failed to get remote users: ${error.message}`);
		}
		return [];
	},

	/**
	 * Create a local user from remote data
	 */
	createLocalUser: async function (userData) {
		try {
			const usersPath = path.join(this.configPath, "users.json");
			let users = [];

			try {
				const data = await fs.readFile(usersPath, "utf8");
				users = JSON.parse(data).users || [];
			} catch {
				// File doesn't exist
			}

			users.push({
				...userData,
				syncedFrom: userData.source || "ecosystem",
				syncedAt: new Date().toISOString()
			});

			await fs.writeFile(usersPath, JSON.stringify({ users }, null, 2));
			return true;
		} catch (error) {
			Log.error(`[${this.name}] Failed to create local user: ${error.message}`);
			return false;
		}
	},

	/**
	 * Create a user on remote app
	 */
	createRemoteUser: async function (app, userData) {
		try {
			const headers = { "Content-Type": "application/json" };
			if (app.token) {
				headers["Authorization"] = `Bearer ${app.token}`;
			}

			const response = await fetch(`${app.host}${app.apiPrefix}/users/`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					...userData,
					syncedFrom: "magicmirror"
				})
			});

			return response.ok;
		} catch (error) {
			Log.warn(`[${this.name}] Failed to create remote user: ${error.message}`);
			return false;
		}
	},

	/**
	 * Sync integrations with a companion app
	 */
	syncIntegrations: async function (appId, direction) {
		const app = this.connectedApps[appId];
		if (!app) {
			this.sendSocketNotification("ECOSYSTEM_ERROR", {
				message: `App ${appId} not connected`
			});
			return;
		}

		try {
			// Get our integrations
			const secretsPath = path.join(this.configPath, "secrets.json");
			let ourIntegrations = {};
			try {
				ourIntegrations = JSON.parse(await fs.readFile(secretsPath, "utf8"));
			} catch {
				// No secrets file
			}

			// Get remote integrations
			const headers = { "Content-Type": "application/json" };
			if (app.token) {
				headers["Authorization"] = `Bearer ${app.token}`;
			}

			let remoteIntegrations = {};
			try {
				const response = await fetch(`${app.host}${app.apiPrefix}/integrations/`, { headers });
				if (response.ok) {
					remoteIntegrations = await response.json();
				}
			} catch {
				// Can't get remote integrations
			}

			// Merge integrations
			const merged = {};
			const syncableServices = ["homeassistant", "homekit", "googlenest", "spotify", "openweathermap"];

			for (const service of syncableServices) {
				if (direction === "bidirectional" || direction === "pull") {
					if (remoteIntegrations[service] && !ourIntegrations[service]) {
						merged[service] = remoteIntegrations[service];
					}
				}
				if (ourIntegrations[service]) {
					merged[service] = ourIntegrations[service];
				}
			}

			// Save merged integrations locally
			await fs.writeFile(secretsPath, JSON.stringify(merged, null, 2));

			// Push to remote if needed
			if (direction === "bidirectional" || direction === "push") {
				try {
					await fetch(`${app.host}${app.apiPrefix}/integrations/sync`, {
						method: "POST",
						headers,
						body: JSON.stringify(merged)
					});
				} catch {
					// Remote sync may not be supported
				}
			}

			this.sendSocketNotification("ECOSYSTEM_INTEGRATIONS_SYNCED", {
				app: app.name || appId,
				services: Object.keys(merged)
			});
		} catch (error) {
			Log.error(`[${this.name}] Integration sync failed: ${error.message}`);
			this.sendSocketNotification("ECOSYSTEM_ERROR", {
				message: `Integration sync failed: ${error.message}`
			});
		}
	},

	/**
	 * Relay notification to companion apps
	 */
	relayNotification: async function (notification, targets, methods) {
		for (const appId of targets) {
			const app = this.connectedApps[appId];
			if (!app) continue;

			// Check if OpenEye relay is enabled
			if (appId === "openeye" && methods?.openeye?.enabled) {
				await this.relayToOpenEye(app, notification);
			}
		}
	},

	/**
	 * Relay notification specifically to OpenEye
	 */
	relayToOpenEye: async function (app, notification) {
		try {
			const headers = { "Content-Type": "application/json" };
			if (app.token) {
				headers["Authorization"] = `Bearer ${app.token}`;
			}

			await fetch(`${app.host}${app.apiPrefix}/notifications/`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					type: notification.type,
					title: notification.title,
					message: notification.message,
					source: "magicmirror",
					priority: notification.urgent ? "high" : "normal",
					timestamp: new Date().toISOString()
				})
			});

			Log.info(`[${this.name}] Notification relayed to OpenEye`);
		} catch (error) {
			Log.warn(`[${this.name}] Failed to relay to OpenEye: ${error.message}`);
		}
	},

	/**
	 * Send current status
	 */
	sendStatus: function () {
		this.sendSocketNotification("ECOSYSTEM_SYNC_STATUS", {
			discovered: Object.keys(this.discoveredApps).length,
			connected: Object.keys(this.connectedApps).length,
			apps: this.connectedApps
		});
	}
});
