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
				defaultPort: 8200,  // Default OpenEye port (WP7)
				alternativePorts: [5000, 8080, 3000],
				apiPrefix: "/api",
				description: "AI-powered home surveillance"
			},
			ai_for_survival: {
				name: "AI for Survival",
				icon: "fa-shield-alt",
				defaultPort: 8000,  // Default AI-for-Survival port (WP7)
				alternativePorts: [8001],
				apiPrefix: "/api/v1",
				description: "Offline survival & cyber command assistant"
			},
			aegissiem: {
				name: "AegisSIEM",
				icon: "fa-lock",
				defaultPort: 8089,
				alternativePorts: [8088],
				apiPrefix: "/api",
				description: "Home SIEM & automated containment"
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
			minSeverity: "medium",
			pollInterval: 15000,
			maxVisible: 5,
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
	notificationFeed: [],
	unreadByApp: {},
	_seenNotificationKeys: null,
	_alertedCriticalKeys: null,
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
		this._seenNotificationKeys = new Set();
		this._alertedCriticalKeys = new Set();
		this.notificationFeed = [];
		this.unreadByApp = {};

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

		// Poll hub notifications feed (WP7)
		if (this.config.notifications?.enabled !== false) {
			const pollNotifications = () => {
				this.sendSocketNotification("ECOSYSTEM_FETCH_NOTIFICATIONS", {
					limit: 25,
					minSeverity: this.config.notifications?.minSeverity || "medium"
				});
			};
			pollNotifications();
			setInterval(pollNotifications, this.config.notifications?.pollInterval || 15000);
		}

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

			case "ECOSYSTEM_NOTIFICATIONS_FEED":
				this.handleNotificationsFeed(payload);
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
	 * Format source app name into compact Apple HIG badge label (e.g. "AFS", "AegisSIEM", "OpenEye")
	 */
	_formatAppLabel: function (sourceApp) {
		const key = String(sourceApp || "ecosystem").toLowerCase();
		if (key.includes("survival") || key === "afs") return "AFS";
		if (key.includes("aegissiem") || key.includes("cyber")) return "AegisSIEM";
		if (key.includes("openeye")) return "OpenEye";
		if (key.includes("scan")) return "Scan";
		return String(sourceApp || "Ecosystem");
	},

	/**
	 * Handle federated hub notification feed (WP7):
	 * updates per-app unread badges, renders compact feed, and raises SHOW_ALERT for critical items.
	 */
	handleNotificationsFeed: function (payload) {
		const items = Array.isArray(payload?.notifications) ? payload.notifications : [];
		if (!this._seenNotificationKeys) this._seenNotificationKeys = new Set();
		if (!this._alertedCriticalKeys) this._alertedCriticalKeys = new Set();

		const minRankMap = { low: 1, medium: 2, high: 3, critical: 4 };
		const minSeverity = String(this.config.notifications?.minSeverity || "medium").toLowerCase();
		const minRank = minRankMap[minSeverity] || 2;

		const filtered = [];
		for (const item of items) {
			if (!item || typeof item !== "object") continue;
			const sev = String(item.severity || "low").toLowerCase();
			if ((minRankMap[sev] || 1) < minRank) continue;
			filtered.push(item);

			const key = String(item.dedupe_key || item.id || `${item.source_app || ""}:${item.title || ""}`);
			if (!this._seenNotificationKeys.has(key)) {
				this._seenNotificationKeys.add(key);
				const label = this._formatAppLabel(item.source_app || item.source);
				this.unreadByApp[label] = (this.unreadByApp[label] || 0) + 1;
			}
			if (sev === "critical" && !this._alertedCriticalKeys.has(key)) {
				this._alertedCriticalKeys.add(key);
				this.sendNotification("SHOW_ALERT", {
					type: "alert",
					title: item.title || "Critical Ecosystem Alert",
					message: item.body || item.message || "",
					timer: 12000
				});
			}
		}

		this.notificationFeed = filtered.slice(0, this.config.notifications?.maxVisible || 5);
		this.updateDom();
	},

	/**
	 * Clear unread badges when operator views the feed
	 */
	markFeedRead: function () {
		this.unreadByApp = {};
		this.updateDom();
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

		// WP7: Per-app unread badges ("AFS · 2", "AegisSIEM · 1") — cleared when viewed
		const unreadEntries = Object.entries(this.unreadByApp || {}).filter(([, count]) => count > 0);
		if (unreadEntries.length > 0) {
			const badgeRow = document.createElement("div");
			badgeRow.className = "ecosystem-unread-badges";
			badgeRow.style.display = "flex";
			badgeRow.style.flexWrap = "wrap";
			badgeRow.style.gap = "6px";
			badgeRow.style.marginBottom = "0.5rem";
			badgeRow.title = "Tap to clear unread counts";
			badgeRow.addEventListener("click", () => this.markFeedRead());

			for (const [label, count] of unreadEntries) {
				const pill = document.createElement("span");
				pill.className = "ecosystem-unread-pill";
				pill.style.fontSize = "11px";
				pill.style.padding = "2px 8px";
				pill.style.borderRadius = "999px";
				pill.style.background = "rgba(0, 122, 255, 0.22)";
				pill.style.color = "#fff";
				pill.textContent = `${label} · ${count}`;
				badgeRow.appendChild(pill);
			}
			wrapper.appendChild(badgeRow);
		}

		// WP7: Compact federated notifications feed
		if (Array.isArray(this.notificationFeed) && this.notificationFeed.length > 0) {
			const feedBox = document.createElement("div");
			feedBox.className = "ecosystem-notifications-feed";
			feedBox.style.display = "flex";
			feedBox.style.flexDirection = "column";
			feedBox.style.gap = "6px";
			feedBox.style.marginBottom = "0.5rem";

			for (const item of this.notificationFeed) {
				const row = document.createElement("div");
				row.className = `ecosystem-feed-item severity-${String(item.severity || "low").toLowerCase()}`;
				row.style.fontSize = "12px";
				row.style.padding = "6px 8px";
				row.style.borderRadius = "8px";
				row.style.background = "rgba(255, 255, 255, 0.06)";

				const titleEl = document.createElement("div");
				titleEl.style.fontWeight = "600";
				titleEl.textContent = `[${this._formatAppLabel(item.source_app || item.source)}] ${item.title || "Notification"}`;
				row.appendChild(titleEl);

				if (item.body || item.message) {
					const bodyEl = document.createElement("div");
					bodyEl.style.opacity = "0.8";
					bodyEl.style.fontSize = "11px";
					bodyEl.textContent = String(item.body || item.message).slice(0, 120);
					row.appendChild(bodyEl);
				}
				feedBox.appendChild(row);
			}
			wrapper.appendChild(feedBox);
		}

		// Connected apps status
		if (Object.keys(this.connectedApps).length > 0) {
			const status = document.createElement("div");
			status.className = "ecosystem-status";
			const icon = document.createElement("i");
			icon.className = "fas fa-link";
			const span = document.createElement("span");
			span.textContent = `${Object.keys(this.connectedApps).length} apps connected`;
			status.appendChild(icon);
			status.appendChild(span);
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
