/**
 * Package Tracking Module for MagicMirror
 *
 * Tracks package deliveries from multiple carriers:
 * - AfterShip (multi-carrier aggregator)
 * - USPS
 * - FedEx
 * - UPS
 * - DHL
 *
 * Follows Apple HIG principles adapted for mirror display:
 * - Clear delivery status
 * - Progress visualization
 * - Estimated delivery dates
 * - Auto-hide delivered packages
 */

/* global Log, Module */

Module.register("packages", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Provider configuration
		provider: "aftership",

		// AfterShip configuration (recommended - supports 900+ carriers)
		aftership: {
			apiKey: ""
		},

		// Direct carrier API configurations
		usps: {
			userId: ""
		},

		fedex: {
			apiKey: "",
			secretKey: "",
			accountNumber: ""
		},

		ups: {
			accessKey: "",
			userId: "",
			password: ""
		},

		// Manual tracking numbers (for providers without API)
		packages: [],

		// Display options
		maxPackages: 5,
		showDelivered: true,
		deliveredDays: 2, // Days to show delivered packages
		showCarrierLogo: true,
		showProgress: true,
		compactMode: false,

		// Update interval (ms)
		updateInterval: 300000, // 5 minutes

		// Status colors
		statusColors: {
			pending: "#888888",
			in_transit: "#64b4ff",
			out_for_delivery: "#ffd700",
			delivered: "#00c896",
			exception: "#ff6464",
			expired: "#666666"
		},

		// Carrier icons
		carrierIcons: {
			usps: "fa-truck",
			fedex: "fa-truck-fast",
			ups: "fa-truck-moving",
			dhl: "fa-truck-plane",
			amazon: "fa-box",
			default: "fa-box"
		}
	},

	/**
	 * Required scripts
	 * @returns {string[]} Array of script paths
	 */
	getScripts: function () {
		return [this.file("../../shared/utils.js")];
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("packages.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting module with provider: ${this.config.provider}`);

		this.packages = [];
		this.error = null;
		this.lastUpdate = null;

		// Request initial data
		this.sendSocketNotification("PACKAGES_INIT", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			packages: this.config.packages
		});

		// Schedule updates
		this.scheduleUpdate();
	},

	/**
	 * Get provider-specific configuration
	 * @returns {object} Provider configuration
	 */
	getProviderConfig: function () {
		switch (this.config.provider) {
			case "aftership":
				return this.config.aftership;
			case "usps":
				return this.config.usps;
			case "fedex":
				return this.config.fedex;
			case "ups":
				return this.config.ups;
			default:
				return {};
		}
	},

	/**
	 * Schedule periodic updates
	 */
	scheduleUpdate: function () {
		setInterval(() => {
			this.sendSocketNotification("PACKAGES_REFRESH", {
				provider: this.config.provider,
				config: this.getProviderConfig()
			});
		}, this.config.updateInterval);
	},

	/**
	 * Handle socket notifications from node_helper
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "PACKAGES_DATA":
				this.processPackages(payload.packages);
				this.lastUpdate = new Date();
				this.error = null;
				this.updateDom(300);
				break;

			case "PACKAGES_ERROR":
				this.error = payload.error;
				this.updateDom();
				break;
		}
	},

	/**
	 * Process packages from provider
	 * @param {object[]} packages - Array of package objects
	 */
	processPackages: function (packages) {
		this.packages = packages
			.map((pkg) => this.normalizePackage(pkg))
			.filter((pkg) => this.shouldShowPackage(pkg))
			.sort((a, b) => this.sortPackages(a, b))
			.slice(0, this.config.maxPackages);
	},

	/**
	 * Normalize package data across providers
	 * @param {object} pkg - Raw package from provider
	 * @returns {object} Normalized package
	 */
	normalizePackage: function (pkg) {
		return {
			id: pkg.id || pkg.tracking_number,
			trackingNumber: pkg.tracking_number || pkg.trackingNumber,
			carrier: (pkg.carrier || pkg.slug || "unknown").toLowerCase(),
			carrierName: pkg.carrier_name || this.formatCarrierName(pkg.carrier || pkg.slug),
			title: pkg.title || pkg.description || `Package ${pkg.tracking_number?.slice(-6) || ""}`,
			status: this.normalizeStatus(pkg.tag || pkg.status),
			statusText: pkg.subtag_message || pkg.status_text || this.getStatusText(pkg.tag || pkg.status),
			estimatedDelivery: pkg.expected_delivery || pkg.estimated_delivery,
			deliveredAt: pkg.delivery_time || pkg.delivered_at,
			lastUpdate: pkg.last_updated_at || pkg.updated_at || new Date().toISOString(),
			checkpoints: pkg.checkpoints || [],
			progress: this.calculateProgress(pkg)
		};
	},

	/**
	 * Normalize status across providers
	 * @param {string} status - Raw status
	 * @returns {string} Normalized status
	 */
	normalizeStatus: function (status) {
		if (!status) return "pending";

		const statusLower = status.toLowerCase();

		// AfterShip status tags
		const statusMap = {
			pending: "pending",
			infotransit: "pending",
			inforeceived: "pending",
			intransit: "in_transit",
			in_transit: "in_transit",
			outfordelivery: "out_for_delivery",
			out_for_delivery: "out_for_delivery",
			delivered: "delivered",
			availableforpickup: "delivered",
			exception: "exception",
			attemptfail: "exception",
			expired: "expired"
		};

		return statusMap[statusLower.replace(/[_\s]/g, "")] || "pending";
	},

	/**
	 * Get human-readable status text
	 * @param {string} status - Status code
	 * @returns {string} Status text
	 */
	getStatusText: function (status) {
		const texts = {
			pending: "Awaiting shipment",
			in_transit: "In transit",
			out_for_delivery: "Out for delivery",
			delivered: "Delivered",
			exception: "Delivery exception",
			expired: "Expired"
		};
		return texts[status] || "Unknown";
	},

	/**
	 * Format carrier name for display
	 * @param {string} carrier - Carrier slug
	 * @returns {string} Formatted carrier name
	 */
	formatCarrierName: function (carrier) {
		if (!carrier) return "Unknown";

		const names = {
			usps: "USPS",
			fedex: "FedEx",
			ups: "UPS",
			dhl: "DHL",
			"dhl-express": "DHL Express",
			amazon: "Amazon",
			ontrac: "OnTrac",
			lasership: "LaserShip"
		};

		return names[carrier.toLowerCase()] || carrier.charAt(0).toUpperCase() + carrier.slice(1);
	},

	/**
	 * Calculate delivery progress percentage
	 * @param {object} pkg - Package object
	 * @returns {number} Progress percentage (0-100)
	 */
	calculateProgress: function (pkg) {
		const status = this.normalizeStatus(pkg.tag || pkg.status);

		const progressMap = {
			pending: 10,
			in_transit: 50,
			out_for_delivery: 85,
			delivered: 100,
			exception: 50,
			expired: 0
		};

		return progressMap[status] || 0;
	},

	/**
	 * Determine if package should be shown
	 * @param {object} pkg - Package object
	 * @returns {boolean} Should show
	 */
	shouldShowPackage: function (pkg) {
		if (pkg.status !== "delivered") {
			return true;
		}

		if (!this.config.showDelivered) {
			return false;
		}

		// Check if delivered within configured days
		if (pkg.deliveredAt) {
			const deliveredDate = new Date(pkg.deliveredAt);
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - this.config.deliveredDays);
			return deliveredDate > cutoffDate;
		}

		return true;
	},

	/**
	 * Sort packages by status priority
	 * @param {object} a - First package
	 * @param {object} b - Second package
	 * @returns {number} Sort order
	 */
	sortPackages: function (a, b) {
		const priority = {
			out_for_delivery: 0,
			in_transit: 1,
			pending: 2,
			exception: 3,
			delivered: 4,
			expired: 5
		};

		const priorityDiff = (priority[a.status] || 99) - (priority[b.status] || 99);
		if (priorityDiff !== 0) return priorityDiff;

		// Secondary sort by estimated delivery
		if (a.estimatedDelivery && b.estimatedDelivery) {
			return new Date(a.estimatedDelivery) - new Date(b.estimatedDelivery);
		}

		return 0;
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `packages-module${this.config.compactMode ? " compact" : ""}`;

		// Helper to create icon elements safely
		const createIcon = (iconClass) => {
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			return icon;
		};

		// Error state
		if (this.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "packages-error";
			errorDiv.appendChild(createIcon("fa-exclamation-triangle"));
			const errorSpan = document.createElement("span");
			errorSpan.textContent = this.error;
			errorDiv.appendChild(errorSpan);
			wrapper.appendChild(errorDiv);
			return wrapper;
		}

		// Empty state
		if (this.packages.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "packages-empty";
			emptyDiv.appendChild(createIcon("fa-box-open"));
			const emptySpan = document.createElement("span");
			emptySpan.textContent = "No packages to track";
			emptyDiv.appendChild(emptySpan);
			wrapper.appendChild(emptyDiv);
			return wrapper;
		}

		// Package list
		const list = document.createElement("div");
		list.className = "packages-list";

		for (const pkg of this.packages) {
			list.appendChild(this.renderPackage(pkg));
		}

		wrapper.appendChild(list);
		return wrapper;
	},

	/**
	 * Render a single package
	 * @param {object} pkg - Package object
	 * @returns {HTMLElement} Package element
	 */
	renderPackage: function (pkg) {
		const el = document.createElement("div");
		el.className = `package-item ${pkg.status}`;
		el.style.setProperty("--status-color", this.config.statusColors[pkg.status]);

		// Helper to create icon elements safely
		const createIcon = (iconClass) => {
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			return icon;
		};

		// Icon
		const iconClass = this.config.carrierIcons[pkg.carrier] || this.config.carrierIcons.default;
		const icon = document.createElement("div");
		icon.className = "package-icon";
		icon.appendChild(createIcon(iconClass));

		// Info
		const info = document.createElement("div");
		info.className = "package-info";

		const title = document.createElement("div");
		title.className = "package-title";
		title.textContent = pkg.title;

		const status = document.createElement("div");
		status.className = "package-status";
		const statusIndicator = document.createElement("span");
		statusIndicator.className = "status-indicator";
		status.appendChild(statusIndicator);
		const statusText = document.createElement("span");
		statusText.textContent = pkg.statusText;
		status.appendChild(statusText);

		const carrier = document.createElement("div");
		carrier.className = "package-carrier";
		carrier.textContent = pkg.carrierName;

		info.appendChild(title);
		info.appendChild(status);
		if (!this.config.compactMode) {
			info.appendChild(carrier);
		}

		// Delivery info
		const delivery = document.createElement("div");
		delivery.className = "package-delivery";

		if (pkg.status === "delivered" && pkg.deliveredAt) {
			delivery.appendChild(createIcon("fa-check-circle"));
			const dateSpan = document.createElement("span");
			dateSpan.textContent = this.formatDeliveryDate(pkg.deliveredAt);
			delivery.appendChild(dateSpan);
		} else if (pkg.estimatedDelivery) {
			delivery.appendChild(createIcon("fa-calendar"));
			const dateSpan = document.createElement("span");
			dateSpan.textContent = this.formatDeliveryDate(pkg.estimatedDelivery);
			delivery.appendChild(dateSpan);
		}

		el.appendChild(icon);
		el.appendChild(info);
		el.appendChild(delivery);

		// Progress bar
		if (this.config.showProgress && pkg.status !== "delivered") {
			el.appendChild(this.renderProgress(pkg));
		}

		return el;
	},

	/**
	 * Render progress bar
	 * @param {object} pkg - Package object
	 * @returns {HTMLElement} Progress bar element
	 */
	renderProgress: function (pkg) {
		const progress = document.createElement("div");
		progress.className = "package-progress";

		const fill = document.createElement("div");
		fill.className = "progress-fill";
		fill.style.width = `${pkg.progress}%`;

		progress.appendChild(fill);
		return progress;
	},

	/**
	 * Format delivery date for display
	 * @param {string} dateStr - ISO date string
	 * @returns {string} Formatted date
	 */
	formatDeliveryDate: function (dateStr) {
		const date = new Date(dateStr);
		const now = new Date();
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);

		// Check if today
		if (date.toDateString() === now.toDateString()) {
			return "Today";
		}

		// Check if tomorrow
		if (date.toDateString() === tomorrow.toDateString()) {
			return "Tomorrow";
		}

		// Check if in past (delivered)
		if (date < now) {
			const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));
			if (days === 0) {
				return "Today";
			} else if (days === 1) {
				return "Yesterday";
			}
			return `${days} days ago`;
		}

		// Future date
		const days = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
		if (days <= 7) {
			return date.toLocaleDateString("en-US", { weekday: "short" });
		}

		return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	},

	/**
	 * Add a new package to track
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug (optional)
	 * @param {string} title - Package title (optional)
	 */
	addPackage: function (trackingNumber, carrier = null, title = null) {
		this.sendSocketNotification("PACKAGES_ADD", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			trackingNumber: trackingNumber,
			carrier: carrier,
			title: title
		});
	},

	/**
	 * Remove a package from tracking
	 * @param {string} trackingNumber - Tracking number
	 */
	removePackage: function (trackingNumber) {
		this.sendSocketNotification("PACKAGES_REMOVE", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			trackingNumber: trackingNumber
		});
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "PACKAGES_ADD":
				this.addPackage(payload.trackingNumber, payload.carrier, payload.title);
				break;
			case "PACKAGES_REMOVE":
				this.removePackage(payload.trackingNumber);
				break;
			case "PACKAGES_REFRESH":
				this.sendSocketNotification("PACKAGES_REFRESH", {
					provider: this.config.provider,
					config: this.getProviderConfig()
				});
				break;
		}
	}
});
