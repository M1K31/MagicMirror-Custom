/**
 * Ecosystem Module
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Manages cross-app ecosystem integration:
 * - Auto-discovery of companion apps (OpenEye, etc.)
 * - Unified notification delivery
 * - Shared user management
 * - Integration synchronization
 */

Module.register("ecosystem", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Discovery settings
		enableDiscovery: true,
		discoveryInterval: 60000, // Check every minute
		discoveryTimeout: 5000,

		// Known companion apps
		// Ports can be customized per-deployment via config.js
		apps: {
			openeye: {
				name: "OpenEye Security",
				icon: "fa-eye",
				defaultPort: 8000,  // Default OpenEye port
				alternativePorts: [5000, 8080, 3000],  // Additional ports to scan
				apiPrefix: "/api",
				description: "AI-powered home surveillance",
				// Optional: Set explicit host to skip discovery
				// host: "http://192.168.1.50:8000"
			},
			homebridge: {
				name: "Homebridge",
				icon: "fa-home",
				defaultPort: 8581,
				alternativePorts: [8080],
				apiPrefix: "/api",
				description: "HomeKit bridge"
			}
		},

		// Notification settings
		notifications: {
			enabled: true,
			// Delivery methods
			methods: {
				openeye: { enabled: false, priority: 1 },
				push: { enabled: false, priority: 2 },
				email: { enabled: false, priority: 3 },
				sms: { enabled: false, priority: 4 }
			},
			// Notification types to relay
			types: {
				motion: true,
				face: true,
				doorbell: true,
				alarm: true,
				weather: false,
				calendar: false
			},
			// Deduplication window (ms)
			dedupeWindow: 30000,
			// Quiet hours
			quietHours: {
				enabled: false,
				start: "22:00",
				end: "07:00"
			}
		},

		// Sync settings
		syncUsers: true,
		syncIntegrations: true,
		syncAutomations: false,

		// Phase 3 Policy Governance
		policy: {
			pollInterval: 10000
		}
	},

	/**
	 * Internal state
	 */
	discoveredApps: {},
	connectedApps: {},
	notificationHistory: [],
	syncStatus: {},
	policyState: null,

	/**
	 * Required styles
	 */
	getStyles: function () {
		return [this.file("ecosystem.css"), this.file("ecosystem-theme.css")];
	},

	/**
	 * Required scripts
	 */
	getScripts: function () {
		return [this.file("ecosystem-ui-controls.js")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting ecosystem module...`);

		// Request initial discovery
		this.sendSocketNotification("ECOSYSTEM_DISCOVER", {
			apps: this.config.apps,
			timeout: this.config.discoveryTimeout
		});

		// Request initial policy state and poll
		this.sendSocketNotification("ECOSYSTEM_GET_POLICY_STATE");
		setInterval(() => {
			this.sendSocketNotification("ECOSYSTEM_GET_POLICY_STATE");
		}, this.config.policy?.pollInterval || 10000);

		// Set up periodic discovery
		if (this.config.enableDiscovery) {
			setInterval(() => {
				this.sendSocketNotification("ECOSYSTEM_DISCOVER", {
					apps: this.config.apps,
					timeout: this.config.discoveryTimeout
				});
			}, this.config.discoveryInterval);
		}
	},

	/**
	 * Handle socket notifications
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "ECOSYSTEM_APPS_FOUND":
				this.handleAppsFound(payload.apps);
				break;

			case "ECOSYSTEM_APP_CONNECTED":
				this.handleAppConnected(payload);
				break;

			case "ECOSYSTEM_SYNC_STATUS":
				this.syncStatus = payload;
				this.updateDom();
				break;

			case "ECOSYSTEM_NOTIFICATION":
				this.handleIncomingNotification(payload);
				break;

			case "ECOSYSTEM_USERS_SYNCED":
				this.showNotification(`Synced ${payload.count} users with ${payload.app}`, "success");
				break;

			case "ECOSYSTEM_INTEGRATIONS_SYNCED":
				this.showNotification(`Synced integrations with ${payload.app}`, "success");
				break;

			case "ECOSYSTEM_POLICY_STATE": {
				// Drop an out-of-order (stale) snapshot from the SAME authority, but
				// fail safe: always accept a frozen state, always accept a state from
				// a different authority (hub vs standalone_local — their version
				// numbers are not comparable), and accept when a version is missing.
				// This prevents a lower-versioned standalone freeze from being
				// discarded just because the hub had reported a higher version.
				const incoming = Number(payload?.policy_version);
				const current = Number(this.policyState?.policy_version);
				const sameAuthority = this.policyState && payload?.authority === this.policyState?.authority;
				const accept =
					!this.policyState ||
					Boolean(payload?.frozen) ||
					!sameAuthority ||
					Number.isNaN(incoming) || Number.isNaN(current) ||
					incoming >= current;
				if (accept) {
					this.policyState = payload;
					this.updatePolicyBarDom();
				}
				break;
			}

			case "ECOSYSTEM_POLICY_FORBIDDEN":
				this.showNotification(`Security Rejection: ${payload.reason || "Action not permitted on wall display"}`, "error");
				break;

			case "ECOSYSTEM_ERROR":
				this.showNotification(payload.message, "error");
				break;
		}
	},

	/**
	 * Handle discovered apps
	 */
	handleAppsFound: function (apps) {
		const newApps = {};
		let hasNewApp = false;

		for (const [appId, appInfo] of Object.entries(apps)) {
			newApps[appId] = appInfo;

			// Check if this is a newly discovered app
			if (!this.discoveredApps[appId]) {
				hasNewApp = true;
				Log.info(`[${this.name}] Discovered: ${appInfo.name} at ${appInfo.host}`);
			}
		}

		this.discoveredApps = newApps;

		// Show notification for new apps
		if (hasNewApp) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "App Discovered",
				message: "A companion app was found on your network. Open Settings to configure.",
				timer: 5000
			});
		}

		this.updateDom();
	},

	/**
	 * Handle app connection
	 */
	handleAppConnected: function (payload) {
		this.connectedApps[payload.appId] = {
			...payload,
			connectedAt: new Date().toISOString()
		};

		// Auto-sync if enabled
		if (this.config.syncUsers && payload.capabilities?.users) {
			this.sendSocketNotification("ECOSYSTEM_SYNC_USERS", {
				appId: payload.appId,
				direction: "bidirectional"
			});
		}

		if (this.config.syncIntegrations && payload.capabilities?.integrations) {
			this.sendSocketNotification("ECOSYSTEM_SYNC_INTEGRATIONS", {
				appId: payload.appId,
				direction: "bidirectional"
			});
		}

		this.updateDom();
	},

	/**
	 * Handle incoming notification from companion app
	 */
	handleIncomingNotification: function (payload) {
		// Check if notification type is enabled
		if (!this.config.notifications.types[payload.type]) {
			return;
		}

		// Check quiet hours
		if (this.isQuietHours()) {
			Log.info(`[${this.name}] Notification suppressed (quiet hours)`);
			return;
		}

		// Check for duplicates
		const isDuplicate = this.notificationHistory.some((n) =>
			n.type === payload.type &&
			n.source === payload.source &&
			Date.now() - n.timestamp < this.config.notifications.dedupeWindow
		);

		if (isDuplicate) {
			Log.info(`[${this.name}] Duplicate notification suppressed`);
			return;
		}

		// Add to history
		this.notificationHistory.push({
			...payload,
			timestamp: Date.now()
		});

		// Clean old history
		this.notificationHistory = this.notificationHistory.filter((n) =>
			Date.now() - n.timestamp < 300000 // Keep last 5 minutes
		);

		// Display notification
		this.displayNotification(payload);
	},

	/**
	 * Check if currently in quiet hours
	 */
	isQuietHours: function () {
		if (!this.config.notifications.quietHours.enabled) {
			return false;
		}

		const now = new Date();
		const [startH, startM] = this.config.notifications.quietHours.start.split(":").map(Number);
		const [endH, endM] = this.config.notifications.quietHours.end.split(":").map(Number);

		const currentMinutes = now.getHours() * 60 + now.getMinutes();
		const startMinutes = startH * 60 + startM;
		const endMinutes = endH * 60 + endM;

		if (startMinutes < endMinutes) {
			return currentMinutes >= startMinutes && currentMinutes < endMinutes;
		} else {
			// Quiet hours span midnight
			return currentMinutes >= startMinutes || currentMinutes < endMinutes;
		}
	},

	/**
	 * Display notification on MagicMirror
	 */
	displayNotification: function (payload) {
		const icons = {
			motion: "fa-running",
			face: "fa-user",
			doorbell: "fa-bell",
			alarm: "fa-exclamation-triangle",
			security: "fa-shield-halved"
		};

		this.sendNotification("SHOW_ALERT", {
			type: payload.urgent ? "alert" : "notification",
			title: payload.title || `${payload.type} Alert`,
			message: payload.message,
			imageUrl: payload.imageUrl,
			timer: payload.urgent ? 0 : 8000
		});
	},

	/**
	 * Send notification to companion apps
	 */
	relayNotification: function (notification) {
		this.sendSocketNotification("ECOSYSTEM_RELAY_NOTIFICATION", {
			notification: notification,
			targets: Object.keys(this.connectedApps),
			methods: this.config.notifications.methods
		});
	},

	/**
	 * Connect to a discovered app
	 */
	connectToApp: function (appId) {
		const app = this.discoveredApps[appId];
		if (!app) return;

		this.sendSocketNotification("ECOSYSTEM_CONNECT", {
			appId: appId,
			host: app.host,
			apiPrefix: app.apiPrefix
		});
	},

	/**
	 * Sync users with an app
	 */
	syncUsersWithApp: function (appId, direction = "bidirectional") {
		this.sendSocketNotification("ECOSYSTEM_SYNC_USERS", {
			appId: appId,
			direction: direction
		});
	},

	/**
	 * Sync integrations with an app
	 */
	syncIntegrationsWithApp: function (appId, direction = "bidirectional") {
		this.sendSocketNotification("ECOSYSTEM_SYNC_INTEGRATIONS", {
			appId: appId,
			direction: direction
		});
	},

	/**
	 * Generate DOM
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "ecosystem-module";

		// Ambient Apple HIG Policy & Freeze bar
		const policyContainer = document.createElement("div");
		policyContainer.className = "ecosystem-policy-container";
		policyContainer.style.marginBottom = "0.75rem";
		policyContainer.innerHTML = '<ecosystem-policy-bar view-mode="ambient" confirm-freeze-tap="true"></ecosystem-policy-bar>';
		const policyBar = policyContainer.querySelector("ecosystem-policy-bar");
		// Hold a per-instance reference so updatePolicyBarDom updates THIS module's
		// bar; a global querySelector would update only the first instance's bar.
		this._policyBar = policyBar;
		if (policyBar && this.policyState) {
			policyBar.policyState = this.policyState;
		}
		if (policyBar) {
			policyBar.addEventListener("ecosystem-freeze-request", (ev) => {
				const detail = ev.detail || {};
				this.sendSocketNotification("ECOSYSTEM_REQUEST_FREEZE", {
					reason: detail.reason || "Wall display emergency freeze button tapped",
					channel: "magicmirror_display"
				});
			});
		}
		wrapper.appendChild(policyContainer);

		// This module primarily works in the background
		// Status is shown in settings panel
		if (Object.keys(this.connectedApps).length > 0) {
			const status = document.createElement("div");
			status.className = "ecosystem-status";
			status.innerHTML = `
				<i class="fas fa-link"></i>
				<span>${Object.keys(this.connectedApps).length} apps connected</span>
			`;
			wrapper.appendChild(status);
		}

		return wrapper;
	},

	/**
	 * Update policy bar DOM when policy state updates
	 */
	updatePolicyBarDom: function () {
		// Use the cached bar only while it is still attached to the page; after a
		// module re-render the old reference is detached (stale), so look the bar
		// up inside THIS module's own wrapper (document id === this.identifier).
		let policyBar = (this._policyBar && this._policyBar.isConnected) ? this._policyBar : null;
		if (!policyBar) {
			const wrapper = this.identifier ? document.getElementById(this.identifier) : null;
			policyBar = wrapper
				? wrapper.querySelector("ecosystem-policy-bar")
				: document.querySelector(".ecosystem-module ecosystem-policy-bar");
			this._policyBar = policyBar;
		}
		if (policyBar && this.policyState) {
			policyBar.policyState = this.policyState;
		}
	},

	/**
	 * Show notification toast
	 */
	showNotification: function (message, type = "info") {
		this.sendNotification("SHOW_ALERT", {
			type: "notification",
			title: type === "error" ? "Ecosystem Error" : "Ecosystem",
			message: message,
			timer: 3000
		});
	},

	/**
	 * Handle notifications from other modules
	 */
	notificationReceived: function (notification, payload, sender) {
		switch (notification) {
			case "ECOSYSTEM_RELAY":
				// Other modules can request notification relay
				this.relayNotification(payload);
				break;

			case "ECOSYSTEM_GET_APPS":
				// Return discovered apps
				this.sendNotification("ECOSYSTEM_APPS", {
					discovered: this.discoveredApps,
					connected: this.connectedApps
				});
				break;
		}
	}
});
