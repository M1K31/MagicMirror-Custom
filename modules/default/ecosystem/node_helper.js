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

let EcosystemClient;
let HubClient;
try {
	({ EcosystemClient, HubClient } = require("@smartindustriesllc/ecosystem-client"));
} catch {
	try {
		const siblingPkg = path.resolve(__dirname, "..", "..", "..", "..", "appEcosystem", "ecosystem_client_js");
		({ EcosystemClient, HubClient } = require(siblingPkg));
	} catch {
		EcosystemClient = null;
		HubClient = null;
	}
}

function buildMagicMirrorCapabilities() {
	return [
		{
			capability: "display.show_alert",
			version: 1,
			description: "Render a glanceable Apple HIG ambient alert card on the MagicMirror wall display.",
			action_class: "observe",
			required_grant: "display:show_alert",
			timeout_seconds: 15,
			cancellable: true,
			idempotent: true,
			offline_behavior: "run_local"
		},
		{
			capability: "notify.deliver.magicmirror_mobile",
			version: 1,
			description: "Federated alert feed for SwiftUI iOS and Jetpack Compose Android MagicMirrorRemote companion apps.",
			action_class: "observe",
			required_grant: "notify:deliver",
			timeout_seconds: 15,
			cancellable: false,
			idempotent: true,
			offline_behavior: "queue_until_online"
		},
		{
			capability: "ecosystem.freeze",
			version: 1,
			description: "Emergency wall-display freeze request halting mutating automations across the ecosystem.",
			action_class: "contain",
			required_grant: "freeze.request",
			timeout_seconds: 10,
			cancellable: false,
			idempotent: true,
			offline_behavior: "freeze_local_and_queue_notice"
		}
	];
}

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
		this._hubClient = null;
		this._localFrozen = false;
		this._localFreezeInfo = null;
		this._freezeSeq = 0;              // monotonic; bumped on each freeze request
		this._freezeRestoreDone = false; // set once the persisted freeze is loaded
		this._freezeWriteChain = Promise.resolve();
		this.freezeStatePath = path.join(this.configPath, "ecosystem-freeze.json");

		if (HubClient) {
			try {
				this._hubClient = new HubClient("magicmirror", {
					role: process.env.ECOSYSTEM_HUB_ROLE || "join",
					capabilities: buildMagicMirrorCapabilities()
				});
				this._hubClient.start().then((mode) => {
					Log.info(`[${this.name}] HubClient active in ${mode} mode`);
				}).catch((err) => {
					Log.debug(`[${this.name}] HubClient standalone fallback: ${err.message}`);
				});
			} catch (err) {
				Log.warn(`[${this.name}] Could not initialize HubClient: ${err.message}`);
			}
		}

		// Load saved ecosystem state
		this.loadEcosystemState();
		// Restore a standalone freeze that was active before a restart (hub down),
		// so a safety Freeze is not silently dropped by a process restart. Policy
		// polls and freeze requests wait on this promise, so neither can run
		// against a half-loaded state.
		this._freezeRestorePromise = this._restoreFreezeState();
	},

	_persistFreezeState: async function () {
		// Serialize writes through a chain so a freeze and a later clear cannot
		// interleave, and write atomically (temp + rename) so a crash mid-write
		// cannot leave a truncated/invalid file that a later restart misreads.
		const run = async () => {
			try {
				if (this._localFrozen) {
					const tmp = `${this.freezeStatePath}.tmp`;
					await fs.writeFile(tmp, JSON.stringify({ frozen: true, info: this._localFreezeInfo, seq: this._freezeSeq, hub_acked: Boolean(this._freezeHubAcked) }, null, 2));
					await fs.rename(tmp, this.freezeStatePath);
				} else {
					await fs.unlink(this.freezeStatePath).catch(() => {});
				}
			} catch (err) {
				Log.debug(`[${this.name}] Could not persist freeze state: ${err.message}`);
			}
		};
		this._freezeWriteChain = (this._freezeWriteChain || Promise.resolve()).then(run, run);
		return this._freezeWriteChain;
	},

	_restoreFreezeState: async function () {
		try {
			const saved = JSON.parse(await fs.readFile(this.freezeStatePath, "utf8"));
			// Apply the saved record only to a helper that has no freeze of its
			// own yet. A freeze requested in this process is newer than anything
			// on disk and must keep its own reason, timestamp and sequence.
			if (saved && saved.frozen && (this._freezeSeq || 0) === 0 && !this._localFrozen) {
				this._localFrozen = true;
				this._localFreezeInfo = saved.info || null;
				// Never 0: a restored freeze must count as "a freeze exists" for
				// the stale-poll guard, even if the file carried no sequence.
				this._freezeSeq = Math.max(typeof saved.seq === "number" ? saved.seq : 0, 1);
				// A record written before this field existed was never confirmed.
				this._freezeHubAcked = saved.hub_acked === true;
				Log.warn(`[${this.name}] Restored standalone Freeze from persisted state`);
			}
		} catch {
			// No persisted freeze state — normal.
		} finally {
			// Mark restore complete so an early policy poll does not clear a freeze
			// before it has been loaded from disk.
			this._freezeRestoreDone = true;
		}
	},

	stop: async function () {
		if (this._hubClient) {
			try {
				await this._hubClient.stop();
			} catch {
				// Best-effort withdrawal
			}
		}
		// Let a freeze that was just requested reach disk before the process
		// exits; otherwise a restart comes back unfrozen.
		await (this._freezeWriteChain || Promise.resolve());
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

			case "ECOSYSTEM_PUBLISH_NOTIFICATION":
				this.publishHubNotification(payload);
				break;

			case "ECOSYSTEM_FETCH_NOTIFICATIONS":
				this.fetchHubNotifications(payload || {});
				break;

			case "ECOSYSTEM_RESOLVE_CAPABILITY":
				this.resolveHubCapability(payload?.capability);
				break;

			case "ECOSYSTEM_GET_STATUS":
				this.sendStatus();
				break;

			// Both return their promise so a caller can wait for the state to be
			// persisted and reported; each handles its own errors.
			case "ECOSYSTEM_GET_POLICY_STATE":
				return this.fetchPolicyState();

			case "ECOSYSTEM_REQUEST_FREEZE":
				return this.requestFreeze(payload);

			// Strict privilege guard: unauthenticated wall display CANNOT resume, approve, deny, or disable restrictions
			case "ECOSYSTEM_POLICY_RESUME":
			case "ECOSYSTEM_POLICY_RESTRICTIONS_OFF":
			case "ECOSYSTEM_APPROVE":
			case "ECOSYSTEM_DENY":
				Log.warn(`[${this.name}] Security rejection: ${notification} forbidden on unauthenticated wall display`);
				this.sendSocketNotification("ECOSYSTEM_POLICY_FORBIDDEN", {
					action: notification,
					reason: "Privileged policy operations (resume, approve, deny, restrictions off) are forbidden from unauthenticated wall display"
				});
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

		// Method 0: Ecosystem client discovery (preferred)
		if (EcosystemClient) {
			try {
				if (!this._ecoClient) {
					this._ecoClient = new EcosystemClient({
						serviceName: "magicmirror",
						servicePort: parseInt(process.env.MM_PORT || "8080"),
						healthEndpoint: "/api/v1/health",
					});
					await this._ecoClient.start();
				}
				for (const [appId, appConfig] of Object.entries(appConfigs)) {
					const peer = await this._ecoClient.discover(appId);
					if (peer) {
						discovered[appId] = {
							...appConfig,
							host: peer.baseUrl,
							apiPrefix: appConfig.apiPrefix || "/api",
							discoveredAt: new Date().toISOString(),
							discoveryMethod: "ecosystem",
						};
						Log.info(`[${this.name}] Found ${appId} via ecosystem client: ${peer.baseUrl}`);
					}
				}
				if (Object.keys(discovered).length > 0) {
					// Skip manual scanning if ecosystem found apps
					this.discoveredApps = discovered;
					this.sendSocketNotification("ECOSYSTEM_APPS_FOUND", { apps: discovered });
					return;
				}
			} catch (e) {
				Log.debug(`[${this.name}] Ecosystem client discovery failed: ${e.message}`);
			}
		}

		// Fall through to legacy discovery methods
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
		// Method 0: Use explicit host if configured (skip discovery)
		if (appConfig.host) {
			const explicitResult = await this.checkAppReachable(
				appConfig.host,
				appConfig.apiPrefix,
				timeout
			);
			if (explicitResult) {
				return {
					...appConfig,
					host: appConfig.host,
					discoveredAt: new Date().toISOString(),
					discoveryMethod: "explicit"
				};
			}
			Log.warn(`[${this.name}] Explicit host ${appConfig.host} not reachable`);
		}

		// Build list of ports to scan
		const portsToScan = [appConfig.defaultPort];
		if (appConfig.alternativePorts) {
			portsToScan.push(...appConfig.alternativePorts);
		}

		// Method 1: Check localhost first (all ports)
		for (const port of portsToScan) {
			const localhostResult = await this.checkAppReachable(
				`http://localhost:${port}`,
				appConfig.apiPrefix,
				timeout
			);
			if (localhostResult) {
				return {
					...appConfig,
					host: `http://localhost:${port}`,
					discoveredAt: new Date().toISOString(),
					discoveryMethod: "localhost"
				};
			}
		}

		// Method 2: Check common local addresses (all ports)
		for (const network of networks) {
			for (const port of portsToScan) {
				const hostResult = await this.checkAppReachable(
					`http://${network.address}:${port}`,
					appConfig.apiPrefix,
					timeout
				);
				if (hostResult) {
					return {
						...appConfig,
						host: `http://${network.address}:${port}`,
						discoveredAt: new Date().toISOString(),
						discoveryMethod: "network-scan"
					};
				}
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

		// View-only boundary: the wall display may pull integration settings but
		// must not push them into another app. Reject push/bidirectional so a
		// mutation cannot originate from the unauthenticated display.
		if (direction === "push" || direction === "bidirectional") {
			Log.warn(`[${this.name}] Security rejection: integration '${direction}' forbidden on view-only wall display`);
			this.sendSocketNotification("ECOSYSTEM_POLICY_FORBIDDEN", {
				action: "ECOSYSTEM_SYNC_INTEGRATIONS",
				reason: "Writing integration settings to another app is forbidden from the view-only wall display; only 'pull' is permitted"
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
		// Publish to the shared hub feed only when hub delivery is explicitly
		// requested. Previously any relay (even one meant only for OpenEye, or
		// with no targets) also broadcast its title/message to the hub.
		const hubRequested = methods?.hub?.enabled === true
			|| (Array.isArray(targets) && (targets.includes("hub") || targets.includes("ecosystem")));
		if (this._hubClient && notification && hubRequested) {
			try {
				const sev = notification.urgent ? "high" : (notification.severity || "medium");
				const type = String(notification.type || "notify.system").startsWith("notify.")
					? notification.type
					: "notify.system";
				await this._hubClient.notify(
					type,
					sev,
					notification.title || "MagicMirror Alert",
					notification.message || "",
					{
						dedupeKey: notification.dedupeKey || `magicmirror:${type}:${notification.title || "alert"}`
					}
				);
			} catch (err) {
				Log.debug(`[${this.name}] Hub notification publish skipped: ${err.message}`);
			}
		}

		for (const appId of targets || []) {
			const app = this.connectedApps[appId];
			if (!app) continue;

			// Check if OpenEye relay is enabled
			if (appId === "openeye" && methods?.openeye?.enabled) {
				await this.relayToOpenEye(app, notification);
			}
		}
	},

	publishHubNotification: async function (payload = {}) {
		if (!this._hubClient) {
			this.sendSocketNotification("ECOSYSTEM_NOTIFICATION_PUBLISHED", { status: "unavailable" });
			return;
		}
		try {
			const result = await this._hubClient.notify(
				payload.type || "notify.system",
				payload.severity || "medium",
				payload.title || "MagicMirror Alert",
				payload.body || "",
				{
					dedupeKey: payload.dedupeKey,
					privacy: payload.privacy || "redacted",
					ttl: payload.ttl || "24h",
					deepLink: payload.deepLink || null
				}
			);
			this.sendSocketNotification("ECOSYSTEM_NOTIFICATION_PUBLISHED", result);
		} catch (error) {
			this.sendSocketNotification("ECOSYSTEM_ERROR", {
				message: `Hub notification publish failed: ${error.message}`
			});
		}
	},

	fetchHubNotifications: async function (opts = {}) {
		if (!this._hubClient) {
			this.sendSocketNotification("ECOSYSTEM_NOTIFICATIONS_FEED", { notifications: [] });
			return;
		}
		const notifications = await this._hubClient.fetchRecentNotifications({
			limit: opts.limit || 25,
			minSeverity: opts.minSeverity
		});
		this.sendSocketNotification("ECOSYSTEM_NOTIFICATIONS_FEED", { notifications });
	},

	resolveHubCapability: async function (capabilityName) {
		if (!capabilityName || !this._hubClient) {
			this.sendSocketNotification("ECOSYSTEM_CAPABILITY_RESOLVED", {
				capability: capabilityName || "",
				available: false,
				providers: [],
				unavailable_reason: "HubClient is not initialized"
			});
			return;
		}
		const resolution = await this._hubClient.resolveCapability(capabilityName);
		this.sendSocketNotification("ECOSYSTEM_CAPABILITY_RESOLVED", resolution);
	},

	/**
	 * Policy state as this display knows it when the hub cannot be asked (or its
	 * answer must not be used).
	 * @returns {object} standalone policy state
	 */
	_localFallbackState: function () {
		const state = {
			policy_version: 1,
			mode: this._localFrozen ? "freeze" : "normal",
			authority: "standalone_local",
			frozen: Boolean(this._localFrozen),
			freeze_info: this._localFreezeInfo || null,
			active_override: null,
			overrides: [],
			enrolled_devices_count: 1,
			auto_scan_grants_count: 0
		};
		if (this._localFrozen) {
			// Tell the bar whether the mesh confirmed this freeze. `false` renders
			// as "FROZEN (LOCAL ONLY)" with a Retry Freeze control instead of
			// claiming that automations everywhere are halted.
			state.freeze_confirmed = Boolean(this._freezeHubAcked);
		}
		return state;
	},

	/**
	 * Send the current local freeze to the hub. Only a hub answer that is itself
	 * frozen counts as acknowledgement. Never changes the freeze's own details
	 * (reason, channel, since), so a re-delivery after an outage or a restart
	 * carries what the operator originally asked for.
	 * @returns {Promise<object|null>} the hub's frozen state, or null if not acknowledged
	 */
	_deliverFreezeToHub: async function () {
		if (!this._hubClient || typeof this._hubClient.requestFreeze !== "function" || !this._localFreezeInfo) {
			return null;
		}
		// An acknowledgement belongs to the freeze it was requested for. If a
		// newer freeze replaced that one while the hub was answering, the answer
		// says nothing about the newer freeze and must not mark it acknowledged.
		const seq = this._freezeSeq || 0;
		try {
			const state = await this._hubClient.requestFreeze(this._localFreezeInfo.reason, this._localFreezeInfo.channel);
			if (state && state.frozen === true && this._localFrozen && (this._freezeSeq || 0) === seq) {
				this._freezeHubAcked = true;
				await this._persistFreezeState();
				return state;
			}
		} catch (err) {
			Log.debug(`[${this.name}] Hub freeze broadcast error: ${err.message}`);
		}
		return null;
	},

	fetchPolicyState: async function () {
		await (this._freezeRestorePromise || Promise.resolve());
		if (this._hubClient && typeof this._hubClient.getPolicyState === "function") {
			// Capture the freeze sequence before the (awaited) poll so a stale
			// response cannot clear a freeze that was requested while it was in flight.
			const seqAtPoll = this._freezeSeq || 0;
			let state = null;
			try {
				state = await this._hubClient.getPolicyState();
			} catch (err) {
				Log.debug(`[${this.name}] Hub policy fetch error: ${err.message}`);
			}
			if (state) {
				if (!this._localFrozen) {
					this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", state);
					return;
				}
				const stale = (this._freezeSeq || 0) !== seqAtPoll;
				if (state.frozen && !stale) {
					// The hub is frozen too: that is the acknowledgement — for
					// the freeze this poll started with, not a newer one.
					if (!this._freezeHubAcked) {
						this._freezeHubAcked = true;
						await this._persistFreezeState();
					}
					this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", state);
					return;
				}
				if (stale) {
					// A newer freeze was requested while this poll was in flight:
					// whatever the hub said is about the old one. Show our own.
					this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", this._localFallbackState());
					return;
				}
				// The hub says "not frozen" while this display holds a freeze.
				if (!this._freezeHubAcked) {
					// The hub never confirmed receiving it — it cannot overrule a
					// freeze it has not heard of. Deliver it (again) instead.
					const delivered = await this._deliverFreezeToHub();
					this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", delivered || this._localFallbackState());
					return;
				}
				// Acknowledged earlier and since lifted at the hub, which is the
				// authority once it has acknowledged. This is the ONLY place a
				// local freeze is cleared.
				this._localFrozen = false;
				this._localFreezeInfo = null;
				this._freezeHubAcked = false;
				await this._persistFreezeState();
				this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", state);
				return;
			}
		}

		this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", this._localFallbackState());
	},

	requestFreeze: async function (payload) {
		await (this._freezeRestorePromise || Promise.resolve());
		if (!this._localFrozen) {
			const reason = payload?.reason || "Emergency wall display freeze";
			const channel = payload?.channel || "magicmirror_display";
			this._freezeSeq = (this._freezeSeq || 0) + 1;
			this._localFrozen = true;
			this._freezeHubAcked = false;
			this._localFreezeInfo = {
				initiated_by: "magicmirror_display",
				channel: channel,
				reason: reason,
				since: new Date().toISOString()
			};
			// Persist BEFORE telling the display it is frozen: a restart (or power
			// loss) right after the operator sees "frozen" must come back frozen.
			await this._persistFreezeState();
		}
		else if (this._freezeHubAcked) {
			// Already frozen and acknowledged, and the operator asks again. This
			// request has not reached the hub yet: drop the old acknowledgement
			// (durably) so a hub that was resumed in the meantime cannot clear the
			// freeze until it has acknowledged THIS request.
			this._freezeHubAcked = false;
			await this._persistFreezeState();
		}
		// Already frozen (a "Retry Freeze" tap, or a tap after a restart restored
		// the freeze): the freeze keeps its original reason, time and sequence —
		// only the delivery to the hub is repeated.

		const delivered = await this._deliverFreezeToHub();
		this.sendSocketNotification("ECOSYSTEM_POLICY_STATE", delivered || this._localFallbackState());
	},

	/**
	 * Relay notification specifically to OpenEye
	 */
	relayToOpenEye: async function (app, notification) {
		// Prefer ecosystem peer for relay
		if (this._ecoClient) {
			try {
				const peer = await this._ecoClient.discover("openeye");
				if (peer) {
					const result = await peer.post("/api/notifications/", {
						type: notification.type,
						title: notification.title,
						message: notification.message,
						source: "magicmirror",
						priority: notification.urgent ? "high" : "normal",
						timestamp: new Date().toISOString(),
					});
					if (result !== null) {
						Log.info(`[${this.name}] Notification relayed to OpenEye via ecosystem`);
						return;
					}
					// Fall through to legacy method if peer request failed
				}
			} catch {
				// Fall through to legacy method
			}
		}

		// Legacy relay method
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
			apps: this.connectedApps,
			hub: this._hubClient
				? {
					joined: this._hubClient.isJoined,
					registryUrl: this._hubClient.registryUrl
				}
				: null
		});
	}
});

module.exports.buildMagicMirrorCapabilities = buildMagicMirrorCapabilities;
