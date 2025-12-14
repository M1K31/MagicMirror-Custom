/**
 * Network Module for MagicMirror
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Monitors network devices, speed, and connectivity:
 * - Device discovery (ARP scanning)
 * - Known vs unknown device tracking
 * - Internet speed tests
 * - Network status notifications
 * - Bandwidth monitoring
 *
 * Follows Apple HIG principles adapted for mirror display:
 * - Clear device status indicators
 * - Subtle notifications for network issues
 * - Organized device lists
 */

/* global Log, Module */

Module.register("network", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Network scanning options
		scanInterval: 60000, // Scan every 60 seconds
		networkInterface: "auto", // Auto-detect or specify (e.g., "eth0", "wlan0")
		networkCIDR: "auto", // Auto-detect or specify (e.g., "192.168.1.0/24")

		// Speed test options
		speedTestEnabled: true,
		speedTestInterval: 3600000, // Every hour
		speedTestServer: "auto", // Auto-select or specify server ID
		minDownloadSpeed: 10, // Mbps - alert if below
		minUploadSpeed: 5, // Mbps - alert if below

		// Connectivity check
		connectivityCheckEnabled: true,
		connectivityCheckInterval: 30000, // Every 30 seconds
		connectivityHosts: [
			"8.8.8.8", // Google DNS
			"1.1.1.1", // Cloudflare DNS
			"208.67.222.222" // OpenDNS
		],

		// Display options
		showUnknownDevices: true,
		showKnownDevices: true,
		showOfflineDevices: false,
		showSpeedTest: true,
		showConnectivityStatus: true,
		maxDevicesDisplay: 10,
		compactMode: false,

		// Notifications
		notifyOnNewDevice: true,
		notifyOnNetworkDown: true,
		notifyOnSlowSpeed: true,

		// Device icons by type
		deviceIcons: {
			router: "fa-wifi",
			computer: "fa-desktop",
			laptop: "fa-laptop",
			phone: "fa-mobile-screen",
			tablet: "fa-tablet-screen-button",
			tv: "fa-tv",
			speaker: "fa-volume-high",
			camera: "fa-video",
			iot: "fa-microchip",
			printer: "fa-print",
			gaming: "fa-gamepad",
			unknown: "fa-circle-question"
		},

		// Known devices configuration
		// Users can mark devices as known with custom names and types
		knownDevices: [
			// { mac: "00:11:22:33:44:55", name: "My Phone", type: "phone", owner: "Dad" }
		]
	},

	/**
	 * Required scripts
	 * @returns {string[]} Array of script paths
	 */
	getScripts: function () {
		return [];
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("network.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting network monitoring module`);

		// State
		this.devices = [];
		this.knownDevicesMap = new Map();
		this.speedTestResult = null;
		this.isOnline = true;
		this.lastScan = null;
		this.lastSpeedTest = null;
		this.error = null;

		// Build known devices map from config
		this.config.knownDevices.forEach((device) => {
			this.knownDevicesMap.set(device.mac.toLowerCase(), device);
		});

		// Request initial data
		this.sendSocketNotification("NETWORK_INIT", {
			networkInterface: this.config.networkInterface,
			networkCIDR: this.config.networkCIDR,
			scanInterval: this.config.scanInterval,
			speedTestInterval: this.config.speedTestInterval,
			connectivityCheckInterval: this.config.connectivityCheckInterval,
			connectivityHosts: this.config.connectivityHosts,
			speedTestServer: this.config.speedTestServer
		});
	},

	/**
	 * Handle socket notifications from node_helper
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "NETWORK_DEVICES":
				this.processDevices(payload.devices);
				this.lastScan = new Date();
				this.error = null;
				this.updateDom(300);
				break;

			case "NETWORK_SPEED_TEST":
				this.speedTestResult = payload;
				this.lastSpeedTest = new Date();
				this.checkSpeedThresholds(payload);
				this.updateDom(300);
				break;

			case "NETWORK_STATUS":
				const wasOnline = this.isOnline;
				this.isOnline = payload.online;
				if (wasOnline && !this.isOnline && this.config.notifyOnNetworkDown) {
					this.sendNotification("SHOW_ALERT", {
						type: "notification",
						title: "Network Offline",
						message: "Internet connection lost",
						timer: 10000
					});
				} else if (!wasOnline && this.isOnline) {
					this.sendNotification("SHOW_ALERT", {
						type: "notification",
						title: "Network Online",
						message: "Internet connection restored",
						timer: 5000
					});
				}
				this.updateDom(300);
				break;

			case "NETWORK_NEW_DEVICE":
				if (this.config.notifyOnNewDevice) {
					const device = payload.device;
					const isKnown = this.knownDevicesMap.has(device.mac.toLowerCase());
					if (!isKnown) {
						this.sendNotification("SHOW_ALERT", {
							type: "notification",
							title: "New Device Detected",
							message: `${device.hostname || device.ip} (${device.mac})`,
							timer: 10000
						});
					}
				}
				break;

			case "NETWORK_ERROR":
				this.error = payload.message;
				this.updateDom(300);
				break;
		}
	},

	/**
	 * Process discovered devices
	 * @param {object[]} devices - Array of discovered devices
	 */
	processDevices: function (devices) {
		this.devices = devices.map((device) => {
			const macLower = device.mac.toLowerCase();
			const knownDevice = this.knownDevicesMap.get(macLower);

			return {
				...device,
				isKnown: !!knownDevice,
				customName: knownDevice?.name || null,
				customType: knownDevice?.type || this.guessDeviceType(device),
				owner: knownDevice?.owner || null
			};
		});
	},

	/**
	 * Guess device type from vendor/hostname
	 * @param {object} device - Device object
	 * @returns {string} Guessed device type
	 */
	guessDeviceType: function (device) {
		const vendor = (device.vendor || "").toLowerCase();
		const hostname = (device.hostname || "").toLowerCase();

		// Router/Gateway detection
		if (device.isGateway) return "router";

		// Common vendor patterns
		if (vendor.includes("apple")) {
			if (hostname.includes("iphone")) return "phone";
			if (hostname.includes("ipad")) return "tablet";
			if (hostname.includes("macbook")) return "laptop";
			if (hostname.includes("appletv")) return "tv";
			return "computer";
		}

		if (vendor.includes("samsung")) {
			if (hostname.includes("galaxy")) return "phone";
			if (hostname.includes("tv") || hostname.includes("smart")) return "tv";
			return "phone";
		}

		if (vendor.includes("google")) {
			if (hostname.includes("home") || hostname.includes("nest")) return "speaker";
			if (hostname.includes("chromecast")) return "tv";
			return "iot";
		}

		if (vendor.includes("amazon")) {
			if (hostname.includes("echo") || hostname.includes("alexa")) return "speaker";
			if (hostname.includes("fire")) return "tv";
			return "iot";
		}

		if (vendor.includes("ring") || vendor.includes("wyze") || vendor.includes("arlo")) {
			return "camera";
		}

		if (vendor.includes("hp") || vendor.includes("epson") || vendor.includes("canon") || vendor.includes("brother")) {
			return "printer";
		}

		if (vendor.includes("sony") || vendor.includes("microsoft") || vendor.includes("nintendo")) {
			return "gaming";
		}

		if (vendor.includes("intel") || vendor.includes("dell") || vendor.includes("lenovo") || vendor.includes("asus")) {
			return "computer";
		}

		// Hostname patterns
		if (hostname.includes("phone") || hostname.includes("android")) return "phone";
		if (hostname.includes("laptop") || hostname.includes("notebook")) return "laptop";
		if (hostname.includes("desktop") || hostname.includes("pc")) return "computer";
		if (hostname.includes("tv") || hostname.includes("roku")) return "tv";
		if (hostname.includes("printer")) return "printer";
		if (hostname.includes("camera") || hostname.includes("cam")) return "camera";

		return "unknown";
	},

	/**
	 * Check if speed is below thresholds
	 * @param {object} result - Speed test result
	 */
	checkSpeedThresholds: function (result) {
		if (!this.config.notifyOnSlowSpeed) return;

		const issues = [];

		if (result.download && result.download < this.config.minDownloadSpeed) {
			issues.push(`Download: ${result.download.toFixed(1)} Mbps (expected: ${this.config.minDownloadSpeed}+)`);
		}

		if (result.upload && result.upload < this.config.minUploadSpeed) {
			issues.push(`Upload: ${result.upload.toFixed(1)} Mbps (expected: ${this.config.minUploadSpeed}+)`);
		}

		if (issues.length > 0) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "Slow Network Speed",
				message: issues.join(", "),
				timer: 15000
			});
		}
	},

	/**
	 * Mark a device as known
	 * @param {string} mac - MAC address
	 * @param {string} name - Custom name
	 * @param {string} type - Device type
	 * @param {string} owner - Owner name
	 */
	markDeviceAsKnown: function (mac, name, type = "unknown", owner = null) {
		const device = {
			mac: mac.toLowerCase(),
			name: name,
			type: type,
			owner: owner
		};

		this.knownDevicesMap.set(device.mac, device);

		// Persist to config
		this.sendSocketNotification("NETWORK_SAVE_KNOWN_DEVICE", device);

		// Update device list
		const deviceIndex = this.devices.findIndex((d) => d.mac.toLowerCase() === device.mac);
		if (deviceIndex !== -1) {
			this.devices[deviceIndex].isKnown = true;
			this.devices[deviceIndex].customName = name;
			this.devices[deviceIndex].customType = type;
			this.devices[deviceIndex].owner = owner;
		}

		this.updateDom(300);
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `network-module${this.config.compactMode ? " compact" : ""}`;

		// Helper to create icon elements safely
		const createIcon = (iconClass) => {
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			return icon;
		};

		// Error state
		if (this.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "network-error";
			errorDiv.appendChild(createIcon("fa-exclamation-triangle"));
			const errorSpan = document.createElement("span");
			errorSpan.textContent = this.error;
			errorDiv.appendChild(errorSpan);
			wrapper.appendChild(errorDiv);
			return wrapper;
		}

		// Connectivity status
		if (this.config.showConnectivityStatus) {
			const statusDiv = document.createElement("div");
			statusDiv.className = `network-status ${this.isOnline ? "online" : "offline"}`;

			const statusIcon = createIcon(this.isOnline ? "fa-wifi" : "fa-wifi-slash");
			statusDiv.appendChild(statusIcon);

			const statusText = document.createElement("span");
			statusText.textContent = this.isOnline ? "Online" : "Offline";
			statusDiv.appendChild(statusText);

			wrapper.appendChild(statusDiv);
		}

		// Speed test results
		if (this.config.showSpeedTest && this.speedTestResult) {
			wrapper.appendChild(this.renderSpeedTest());
		}

		// Device sections
		if (this.devices.length > 0) {
			const knownDevices = this.devices.filter((d) => d.isKnown && (this.config.showOfflineDevices || d.online));
			const unknownDevices = this.devices.filter((d) => !d.isKnown && (this.config.showOfflineDevices || d.online));

			if (this.config.showKnownDevices && knownDevices.length > 0) {
				wrapper.appendChild(this.renderDeviceSection("Known Devices", knownDevices, "known"));
			}

			if (this.config.showUnknownDevices && unknownDevices.length > 0) {
				wrapper.appendChild(this.renderDeviceSection("Unknown Devices", unknownDevices, "unknown"));
			}
		} else {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "network-empty";
			emptyDiv.appendChild(createIcon("fa-network-wired"));
			const emptySpan = document.createElement("span");
			emptySpan.textContent = "Scanning network...";
			emptyDiv.appendChild(emptySpan);
			wrapper.appendChild(emptyDiv);
		}

		return wrapper;
	},

	/**
	 * Render speed test section
	 * @returns {HTMLElement} Speed test element
	 */
	renderSpeedTest: function () {
		const section = document.createElement("div");
		section.className = "speed-test-section";

		const header = document.createElement("div");
		header.className = "section-header";
		header.textContent = "Internet Speed";
		section.appendChild(header);

		const results = document.createElement("div");
		results.className = "speed-results";

		// Download
		const downloadDiv = document.createElement("div");
		downloadDiv.className = "speed-item download";

		const downloadIcon = document.createElement("i");
		downloadIcon.className = "fa fa-arrow-down";
		downloadDiv.appendChild(downloadIcon);

		const downloadValue = document.createElement("span");
		downloadValue.className = "speed-value";
		downloadValue.textContent = this.speedTestResult.download
			? `${this.speedTestResult.download.toFixed(1)} Mbps`
			: "N/A";
		downloadDiv.appendChild(downloadValue);

		const downloadLabel = document.createElement("span");
		downloadLabel.className = "speed-label";
		downloadLabel.textContent = "Download";
		downloadDiv.appendChild(downloadLabel);

		results.appendChild(downloadDiv);

		// Upload
		const uploadDiv = document.createElement("div");
		uploadDiv.className = "speed-item upload";

		const uploadIcon = document.createElement("i");
		uploadIcon.className = "fa fa-arrow-up";
		uploadDiv.appendChild(uploadIcon);

		const uploadValue = document.createElement("span");
		uploadValue.className = "speed-value";
		uploadValue.textContent = this.speedTestResult.upload
			? `${this.speedTestResult.upload.toFixed(1)} Mbps`
			: "N/A";
		uploadDiv.appendChild(uploadValue);

		const uploadLabel = document.createElement("span");
		uploadLabel.className = "speed-label";
		uploadLabel.textContent = "Upload";
		uploadDiv.appendChild(uploadLabel);

		results.appendChild(uploadDiv);

		// Ping
		const pingDiv = document.createElement("div");
		pingDiv.className = "speed-item ping";

		const pingIcon = document.createElement("i");
		pingIcon.className = "fa fa-clock";
		pingDiv.appendChild(pingIcon);

		const pingValue = document.createElement("span");
		pingValue.className = "speed-value";
		pingValue.textContent = this.speedTestResult.ping
			? `${this.speedTestResult.ping.toFixed(0)} ms`
			: "N/A";
		pingDiv.appendChild(pingValue);

		const pingLabel = document.createElement("span");
		pingLabel.className = "speed-label";
		pingLabel.textContent = "Ping";
		pingDiv.appendChild(pingLabel);

		results.appendChild(pingDiv);

		section.appendChild(results);

		return section;
	},

	/**
	 * Render device section
	 * @param {string} title - Section title
	 * @param {object[]} devices - Devices to display
	 * @param {string} className - CSS class
	 * @returns {HTMLElement} Device section element
	 */
	renderDeviceSection: function (title, devices, className) {
		const section = document.createElement("div");
		section.className = `device-section ${className}`;

		const header = document.createElement("div");
		header.className = "section-header";

		const headerText = document.createElement("span");
		headerText.textContent = title;
		header.appendChild(headerText);

		const countSpan = document.createElement("span");
		countSpan.className = "device-count";
		countSpan.textContent = devices.length;
		header.appendChild(countSpan);

		section.appendChild(header);

		const list = document.createElement("div");
		list.className = "device-list";

		const displayDevices = devices.slice(0, this.config.maxDevicesDisplay);
		displayDevices.forEach((device) => {
			list.appendChild(this.renderDevice(device));
		});

		if (devices.length > this.config.maxDevicesDisplay) {
			const moreDiv = document.createElement("div");
			moreDiv.className = "more-devices";
			moreDiv.textContent = `+${devices.length - this.config.maxDevicesDisplay} more`;
			list.appendChild(moreDiv);
		}

		section.appendChild(list);

		return section;
	},

	/**
	 * Render single device
	 * @param {object} device - Device object
	 * @returns {HTMLElement} Device element
	 */
	renderDevice: function (device) {
		const el = document.createElement("div");
		el.className = `device-item ${device.online !== false ? "online" : "offline"}`;
		el.dataset.mac = device.mac;

		// Icon
		const iconClass = this.config.deviceIcons[device.customType] || this.config.deviceIcons.unknown;
		const iconDiv = document.createElement("div");
		iconDiv.className = "device-icon";
		const icon = document.createElement("i");
		icon.className = `fa ${iconClass}`;
		iconDiv.appendChild(icon);
		el.appendChild(iconDiv);

		// Info
		const infoDiv = document.createElement("div");
		infoDiv.className = "device-info";

		const nameDiv = document.createElement("div");
		nameDiv.className = "device-name";
		nameDiv.textContent = device.customName || device.hostname || device.ip;
		infoDiv.appendChild(nameDiv);

		const detailsDiv = document.createElement("div");
		detailsDiv.className = "device-details dimmed xsmall";

		if (device.owner) {
			const ownerSpan = document.createElement("span");
			ownerSpan.className = "device-owner";
			ownerSpan.textContent = device.owner;
			detailsDiv.appendChild(ownerSpan);
			detailsDiv.appendChild(document.createTextNode(" • "));
		}

		const ipSpan = document.createElement("span");
		ipSpan.textContent = device.ip;
		detailsDiv.appendChild(ipSpan);

		if (device.vendor && !device.isKnown) {
			detailsDiv.appendChild(document.createTextNode(" • "));
			const vendorSpan = document.createElement("span");
			vendorSpan.textContent = device.vendor;
			detailsDiv.appendChild(vendorSpan);
		}

		infoDiv.appendChild(detailsDiv);
		el.appendChild(infoDiv);

		// Status indicator
		const statusDiv = document.createElement("div");
		statusDiv.className = `device-status ${device.online !== false ? "online" : "offline"}`;
		el.appendChild(statusDiv);

		// Touch handler for marking as known
		if (this.config.mode === "touch" && !device.isKnown) {
			el.addEventListener("click", () => {
				const name = prompt("Enter device name:", device.hostname || device.ip);
				if (name) {
					this.markDeviceAsKnown(device.mac, name, device.customType);
				}
			});
			el.style.cursor = "pointer";
		}

		return el;
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "NETWORK_SCAN_NOW":
				this.sendSocketNotification("NETWORK_SCAN_NOW");
				break;

			case "NETWORK_SPEED_TEST_NOW":
				this.sendSocketNotification("NETWORK_SPEED_TEST_NOW");
				break;

			case "NETWORK_MARK_KNOWN":
				if (payload && payload.mac && payload.name) {
					this.markDeviceAsKnown(payload.mac, payload.name, payload.type, payload.owner);
				}
				break;
		}
	}
});
