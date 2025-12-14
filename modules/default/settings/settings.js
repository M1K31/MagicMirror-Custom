/**
 * Settings Module for MagicMirror
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Provides a UI for configuring modules and services:
 * - Service connections (OpenEye, Home Assistant, Spotify, etc.)
 * - Module enable/disable
 * - API key management
 * - OAuth authentication flows
 *
 * @see https://github.com/M1K31/MagicMirror-Custom
 */

/* global Log, Module, MM */

Module.register("settings", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Show settings icon
		showIcon: true,
		// Icon position: "top-right", "top-left", "bottom-right", "bottom-left"
		iconPosition: "top-right",
		// Require touch/click to open (vs always visible)
		iconOnly: true,
		// Auto-hide settings panel after inactivity (ms), 0 = never
		autoHide: 30000,
		// Available service integrations
		services: {
			openeye: {
				name: "OpenEye Security",
				icon: "fa-shield-halved",
				enabled: true,
				fields: ["host", "token"],
				description: "AI-powered home surveillance"
			},
			homeassistant: {
				name: "Home Assistant",
				icon: "fa-house-signal",
				enabled: true,
				fields: ["host", "token"],
				description: "Smart home control"
			},
			spotify: {
				name: "Spotify",
				icon: "fa-spotify",
				enabled: true,
				oauth: true,
				description: "Music playback and control"
			},
			googlecalendar: {
				name: "Google Calendar",
				icon: "fa-google",
				enabled: true,
				oauth: true,
				description: "Calendar events sync"
			},
			openweathermap: {
				name: "OpenWeatherMap",
				icon: "fa-cloud-sun",
				enabled: true,
				fields: ["apiKey", "location"],
				description: "Weather data provider"
			}
		}
	},

	/**
	 * Required styles
	 */
	getStyles: function () {
		return [this.file("settings.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Settings module started`);

		this.panelVisible = false;
		this.currentSection = "services";
		this.serviceConfigs = {};
		this.modules = [];
		this.autoHideTimer = null;
		this.systemInfo = {};

		// Request current configuration from node_helper
		this.sendSocketNotification("SETTINGS_GET_CONFIG", {});
		this.sendSocketNotification("SETTINGS_GET_MODULES", {});
		this.sendSocketNotification("SETTINGS_GET_SYSTEM_INFO", {});
	},

	/**
	 * Handle notifications from node_helper
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "SETTINGS_CONFIG":
				this.serviceConfigs = payload.services || {};
				if (this.panelVisible) {
					this.updateDom();
				}
				break;

			case "SETTINGS_MODULES":
				this.modules = payload.modules || [];
				if (this.panelVisible) {
					this.updateDom();
				}
				break;

			case "SETTINGS_SAVED":
				this.showNotification("Settings saved successfully", "success");
				break;

			case "SETTINGS_ERROR":
				this.showNotification(payload.message, "error");
				break;

			case "SETTINGS_OAUTH_URL":
				// Open OAuth URL in new window/tab
				window.open(payload.url, "_blank", "width=600,height=700");
				break;

			case "SETTINGS_OAUTH_SUCCESS":
				this.showNotification(`${payload.service} connected successfully`, "success");
				this.sendSocketNotification("SETTINGS_GET_CONFIG", {});
				break;

			case "SETTINGS_TEST_RESULT":
				if (payload.success) {
					this.showNotification(`${payload.service}: Connection successful`, "success");
				} else {
					this.showNotification(`${payload.service}: ${payload.error}`, "error");
				}
				break;

			case "SETTINGS_SYSTEM_INFO":
				this.systemInfo = payload;
				// Update system info in UI if visible
				if (this.panelVisible && this.currentSection === "about") {
					this.updateSystemInfoDisplay();
				}
				break;
		}
	},

	/**
	 * Generate the DOM
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "settings-module";

		// Settings icon/button
		if (this.config.showIcon) {
			const icon = this.createSettingsIcon();
			wrapper.appendChild(icon);
		}

		// Settings panel (hidden by default)
		if (this.panelVisible) {
			const panel = this.createSettingsPanel();
			wrapper.appendChild(panel);
		}

		return wrapper;
	},

	/**
	 * Create settings icon button
	 */
	createSettingsIcon: function () {
		const icon = document.createElement("div");
		icon.className = `settings-icon ${this.config.iconPosition}`;
		icon.innerHTML = '<i class="fas fa-gear"></i>';
		icon.addEventListener("click", () => this.togglePanel());
		return icon;
	},

	/**
	 * Create the settings panel
	 */
	createSettingsPanel: function () {
		const panel = document.createElement("div");
		panel.className = "settings-panel";

		// Header
		const header = document.createElement("div");
		header.className = "settings-header";
		header.innerHTML = `
			<h2><i class="fas fa-gear"></i> Settings</h2>
			<button class="close-btn" id="settings-close"><i class="fas fa-times"></i></button>
		`;
		panel.appendChild(header);

		// Navigation tabs
		const nav = document.createElement("div");
		nav.className = "settings-nav";
		nav.innerHTML = `
			<button class="nav-btn ${this.currentSection === "services" ? "active" : ""}" data-section="services">
				<i class="fas fa-plug"></i> Services
			</button>
			<button class="nav-btn ${this.currentSection === "modules" ? "active" : ""}" data-section="modules">
				<i class="fas fa-cubes"></i> Modules
			</button>
			<button class="nav-btn ${this.currentSection === "display" ? "active" : ""}" data-section="display">
				<i class="fas fa-display"></i> Display
			</button>
			<button class="nav-btn ${this.currentSection === "about" ? "active" : ""}" data-section="about">
				<i class="fas fa-info-circle"></i> About
			</button>
		`;
		panel.appendChild(nav);

		// Content area
		const content = document.createElement("div");
		content.className = "settings-content";

		switch (this.currentSection) {
			case "services":
				content.appendChild(this.createServicesSection());
				break;
			case "modules":
				content.appendChild(this.createModulesSection());
				break;
			case "display":
				content.appendChild(this.createDisplaySection());
				break;
			case "about":
				content.appendChild(this.createAboutSection());
				break;
		}

		panel.appendChild(content);

		// Add event listeners after DOM is created
		setTimeout(() => {
			this.attachPanelListeners();
		}, 0);

		return panel;
	},

	/**
	 * Create services configuration section
	 */
	createServicesSection: function () {
		const section = document.createElement("div");
		section.className = "services-section";

		for (const [key, service] of Object.entries(this.config.services)) {
			if (!service.enabled) continue;

			const card = document.createElement("div");
			card.className = "service-card";
			card.dataset.service = key;

			const config = this.serviceConfigs[key] || {};
			const isConnected = config.connected || false;

			card.innerHTML = `
				<div class="service-header">
					<i class="fas ${service.icon}"></i>
					<span class="service-name">${service.name}</span>
					<span class="service-status ${isConnected ? "connected" : "disconnected"}">
						${isConnected ? "Connected" : "Not Connected"}
					</span>
				</div>
				<p class="service-description">${service.description}</p>
				<div class="service-config" id="config-${key}">
					${this.createServiceFields(key, service, config)}
				</div>
				<div class="service-actions">
					${service.oauth
		? `<button class="btn btn-primary oauth-btn" data-service="${key}">
								<i class="fas fa-link"></i> Connect
							 </button>`
		: `<button class="btn btn-primary save-btn" data-service="${key}">
								<i class="fas fa-save"></i> Save
							 </button>`
}
					<button class="btn btn-secondary test-btn" data-service="${key}">
						<i class="fas fa-vial"></i> Test
					</button>
				</div>
			`;

			section.appendChild(card);
		}

		return section;
	},

	/**
	 * Create input fields for a service
	 */
	createServiceFields: function (key, service, config) {
		if (!service.fields) return "";

		return service.fields
			.map((field) => {
				const value = config[field] || "";
				const isSecret = field.toLowerCase().includes("token") || field.toLowerCase().includes("key") || field.toLowerCase().includes("password");

				return `
				<div class="form-group">
					<label for="${key}-${field}">${this.formatFieldName(field)}</label>
					<input type="${isSecret ? "password" : "text"}" 
						   id="${key}-${field}" 
						   name="${field}"
						   value="${value}"
						   placeholder="Enter ${this.formatFieldName(field).toLowerCase()}"
						   autocomplete="off">
				</div>
			`;
			})
			.join("");
	},

	/**
	 * Create modules enable/disable section
	 */
	createModulesSection: function () {
		const section = document.createElement("div");
		section.className = "modules-section";

		// Get all available modules
		const availableModules = [
			{ id: "clock", name: "Clock", icon: "fa-clock", description: "Digital/analog clock display" },
			{ id: "calendar", name: "Calendar", icon: "fa-calendar", description: "Calendar events" },
			{ id: "weather", name: "Weather", icon: "fa-cloud-sun", description: "Current weather and forecast" },
			{ id: "newsfeed", name: "News Feed", icon: "fa-newspaper", description: "RSS news ticker" },
			{ id: "compliments", name: "Compliments", icon: "fa-heart", description: "Random compliments" },
			{ id: "network", name: "Network", icon: "fa-network-wired", description: "Network monitoring" },
			{ id: "security", name: "Security", icon: "fa-shield-halved", description: "OpenEye cameras" },
			{ id: "music", name: "Music", icon: "fa-music", description: "Now playing" },
			{ id: "smarthome", name: "Smart Home", icon: "fa-house-signal", description: "Device control" },
			{ id: "fitness", name: "Fitness", icon: "fa-heart-pulse", description: "Health tracking" },
			{ id: "transit", name: "Transit", icon: "fa-bus", description: "Public transit" },
			{ id: "packages", name: "Packages", icon: "fa-box", description: "Delivery tracking" }
		];

		for (const mod of availableModules) {
			const isEnabled = this.modules.some((m) => m.name === mod.id);

			const card = document.createElement("div");
			card.className = `module-card ${isEnabled ? "enabled" : "disabled"}`;
			card.innerHTML = `
				<div class="module-info">
					<i class="fas ${mod.icon}"></i>
					<div>
						<span class="module-name">${mod.name}</span>
						<span class="module-desc">${mod.description}</span>
					</div>
				</div>
				<label class="toggle-switch">
					<input type="checkbox" ${isEnabled ? "checked" : ""} data-module="${mod.id}">
					<span class="toggle-slider"></span>
				</label>
			`;

			section.appendChild(card);
		}

		section.innerHTML += `
			<div class="section-note">
				<i class="fas fa-info-circle"></i>
				Module changes require a page refresh to take effect.
			</div>
		`;

		return section;
	},

	/**
	 * Create display settings section
	 */
	createDisplaySection: function () {
		const section = document.createElement("div");
		section.className = "display-section";

		section.innerHTML = `
			<div class="form-group">
				<label for="display-brightness">Brightness</label>
				<input type="range" id="display-brightness" min="20" max="100" value="100">
				<span id="brightness-value">100%</span>
			</div>
			
			<div class="form-group">
				<label for="display-zoom">Zoom Level</label>
				<input type="range" id="display-zoom" min="50" max="150" value="100">
				<span id="zoom-value">100%</span>
			</div>
			
			<div class="form-group">
				<label>Color Scheme</label>
				<div class="color-options">
					<button class="color-btn active" data-scheme="dark">Dark</button>
					<button class="color-btn" data-scheme="light">Light</button>
					<button class="color-btn" data-scheme="auto">Auto</button>
				</div>
			</div>
			
			<div class="form-group">
				<label for="display-language">Language</label>
				<select id="display-language">
					<option value="en">English</option>
					<option value="de">Deutsch</option>
					<option value="fr">Français</option>
					<option value="es">Español</option>
					<option value="nl">Nederlands</option>
				</select>
			</div>
			
			<button class="btn btn-primary" id="save-display">
				<i class="fas fa-save"></i> Save Display Settings
			</button>
		`;

		return section;
	},

	/**
	 * Create about section
	 */
	createAboutSection: function () {
		const section = document.createElement("div");
		section.className = "about-section";

		const apiToken = this.systemInfo.apiToken || "Loading...";
		const apiHost = this.systemInfo.apiHost || "localhost:8080";
		const apiPrefix = this.systemInfo.apiPrefix || "/api/v1";
		const tokenMasked = apiToken !== "Loading..." ? apiToken.substring(0, 8) + "..." + apiToken.substring(apiToken.length - 4) : apiToken;

		section.innerHTML = `
			<div class="about-header">
				<h3>MagicMirror² Custom</h3>
				<p class="version">Version 2.32.0</p>
			</div>
			
			<div class="companion-app-section">
				<h4><i class="fas fa-mobile-screen-button"></i> Companion App Setup</h4>
				<p class="companion-desc">Use these credentials to connect the iOS or Android companion app.</p>
				
				<div class="api-credentials">
					<div class="credential-row">
						<label>Server Address:</label>
						<div class="credential-value">
							<code id="api-host">${apiHost}</code>
							<button class="copy-btn" data-copy="${apiHost}" title="Copy to clipboard">
								<i class="fas fa-copy"></i>
							</button>
						</div>
					</div>
					
					<div class="credential-row">
						<label>API Token:</label>
						<div class="credential-value">
							<code id="api-token-display">${tokenMasked}</code>
							<button class="toggle-token-btn" id="toggle-token" title="Show/hide full token">
								<i class="fas fa-eye"></i>
							</button>
							<button class="copy-btn" id="copy-token" data-copy="${apiToken}" title="Copy to clipboard">
								<i class="fas fa-copy"></i>
							</button>
						</div>
					</div>
					
					<div class="credential-row">
						<label>API Endpoint:</label>
						<div class="credential-value">
							<code id="api-endpoint">http://${apiHost}${apiPrefix}</code>
							<button class="copy-btn" data-copy="http://${apiHost}${apiPrefix}" title="Copy to clipboard">
								<i class="fas fa-copy"></i>
							</button>
						</div>
					</div>
				</div>
				
				<div class="qr-section" id="qr-container">
					<p class="qr-label">Scan to connect:</p>
					<div class="qr-code" id="qr-code"></div>
				</div>
			</div>
			
			<div class="about-links">
				<a href="https://github.com/M1K31/MagicMirror-Custom" target="_blank">
					<i class="fab fa-github"></i> GitHub Repository
				</a>
				<a href="https://github.com/M1K31/OpenEye-OpenCV_Home_Security" target="_blank">
					<i class="fas fa-shield-halved"></i> OpenEye Project
				</a>
				<a href="https://docs.magicmirror.builders" target="_blank">
					<i class="fas fa-book"></i> Documentation
				</a>
			</div>
			
			<div class="about-ecosystem">
				<h4>Smart Home Ecosystem</h4>
				<p>This MagicMirror fork is designed to work with OpenEye for a complete 
				   smart home security and monitoring solution.</p>
			</div>
			
			<div class="system-info">
				<h4>System Information</h4>
				<div class="info-grid">
					<span>Platform:</span><span id="sys-platform">${this.systemInfo.platform || "-"}</span>
					<span>Node.js:</span><span id="sys-node">${this.systemInfo.node || "-"}</span>
					<span>Uptime:</span><span id="sys-uptime">${this.systemInfo.uptime || "-"}</span>
					<span>Memory:</span><span id="sys-memory">${this.systemInfo.memory || "-"}</span>
				</div>
			</div>
		`;

		// Generate QR code after DOM is ready
		if (apiToken !== "Loading...") {
			setTimeout(() => this.generateQRCode(apiHost, apiToken, apiPrefix), 100);
		}

		return section;
	},

	/**
	 * Update system info display when data arrives
	 */
	updateSystemInfoDisplay: function () {
		const platform = document.getElementById("sys-platform");
		const node = document.getElementById("sys-node");
		const uptime = document.getElementById("sys-uptime");
		const memory = document.getElementById("sys-memory");

		if (platform) platform.textContent = this.systemInfo.platform || "-";
		if (node) node.textContent = this.systemInfo.node || "-";
		if (uptime) uptime.textContent = this.systemInfo.uptime || "-";
		if (memory) memory.textContent = this.systemInfo.memory || "-";

		// Update API credentials
		const apiHost = this.systemInfo.apiHost || "localhost:8080";
		const apiToken = this.systemInfo.apiToken;
		const apiPrefix = this.systemInfo.apiPrefix || "/api/v1";

		if (apiToken) {
			const tokenMasked = apiToken.substring(0, 8) + "..." + apiToken.substring(apiToken.length - 4);
			const tokenDisplay = document.getElementById("api-token-display");
			const copyBtn = document.getElementById("copy-token");
			const hostEl = document.getElementById("api-host");
			const endpointEl = document.getElementById("api-endpoint");

			if (tokenDisplay) tokenDisplay.textContent = tokenMasked;
			if (copyBtn) copyBtn.dataset.copy = apiToken;
			if (hostEl) hostEl.textContent = apiHost;
			if (endpointEl) endpointEl.textContent = `http://${apiHost}${apiPrefix}`;

			// Generate QR code
			this.generateQRCode(apiHost, apiToken, apiPrefix);
		}
	},

	/**
	 * Generate QR code for companion app connection
	 */
	generateQRCode: function (host, token, prefix) {
		const container = document.getElementById("qr-code");
		if (!container) return;

		// Connection data as JSON for QR code
		const connectionData = JSON.stringify({
			host: host,
			token: token,
			prefix: prefix
		});

		// Simple QR code using an SVG-based approach (no external library)
		// For a real implementation, you'd use a QR library
		container.innerHTML = `
			<div class="qr-placeholder">
				<i class="fas fa-qrcode"></i>
				<p>Scan with companion app</p>
				<small>or copy credentials above</small>
			</div>
		`;

		// Store data for copy functionality
		container.dataset.qrData = connectionData;
	},

	/**
	 * Attach event listeners to panel elements
	 */
	attachPanelListeners: function () {
		// Close button
		const closeBtn = document.getElementById("settings-close");
		if (closeBtn) {
			closeBtn.addEventListener("click", () => this.togglePanel());
		}

		// Navigation tabs
		document.querySelectorAll(".settings-nav .nav-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				this.currentSection = e.currentTarget.dataset.section;
				this.updateDom();
				this.resetAutoHide();
			});
		});

		// Save buttons
		document.querySelectorAll(".save-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const service = e.currentTarget.dataset.service;
				this.saveServiceConfig(service);
			});
		});

		// OAuth buttons
		document.querySelectorAll(".oauth-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const service = e.currentTarget.dataset.service;
				this.initiateOAuth(service);
			});
		});

		// Test buttons
		document.querySelectorAll(".test-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const service = e.currentTarget.dataset.service;
				this.testConnection(service);
			});
		});

		// Module toggles
		document.querySelectorAll(".module-card input[type='checkbox']").forEach((toggle) => {
			toggle.addEventListener("change", (e) => {
				const moduleName = e.target.dataset.module;
				const enabled = e.target.checked;
				this.toggleModule(moduleName, enabled);
			});
		});

		// Display settings
		const brightnessSlider = document.getElementById("display-brightness");
		if (brightnessSlider) {
			brightnessSlider.addEventListener("input", (e) => {
				document.getElementById("brightness-value").textContent = `${e.target.value}%`;
				document.body.style.filter = `brightness(${e.target.value / 100})`;
			});
		}

		const zoomSlider = document.getElementById("display-zoom");
		if (zoomSlider) {
			zoomSlider.addEventListener("input", (e) => {
				document.getElementById("zoom-value").textContent = `${e.target.value}%`;
				document.body.style.zoom = `${e.target.value}%`;
			});
		}

		// Copy buttons for API credentials
		document.querySelectorAll(".copy-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const textToCopy = e.currentTarget.dataset.copy;
				if (textToCopy && textToCopy !== "Loading...") {
					this.copyToClipboard(textToCopy);
				}
			});
		});

		// Toggle token visibility
		const toggleTokenBtn = document.getElementById("toggle-token");
		if (toggleTokenBtn) {
			toggleTokenBtn.addEventListener("click", () => {
				const tokenDisplay = document.getElementById("api-token-display");
				const apiToken = this.systemInfo.apiToken;
				if (tokenDisplay && apiToken) {
					const isHidden = tokenDisplay.dataset.hidden !== "false";
					if (isHidden) {
						tokenDisplay.textContent = apiToken;
						tokenDisplay.dataset.hidden = "false";
						toggleTokenBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
					} else {
						const tokenMasked = apiToken.substring(0, 8) + "..." + apiToken.substring(apiToken.length - 4);
						tokenDisplay.textContent = tokenMasked;
						tokenDisplay.dataset.hidden = "true";
						toggleTokenBtn.innerHTML = '<i class="fas fa-eye"></i>';
					}
				}
			});
		}
	},

	/**
	 * Copy text to clipboard
	 */
	copyToClipboard: async function (text) {
		try {
			await navigator.clipboard.writeText(text);
			this.showNotification("Copied to clipboard", "success");
		} catch (err) {
			// Fallback for older browsers
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
			this.showNotification("Copied to clipboard", "success");
		}
	},

	/**
	 * Toggle settings panel visibility
	 */
	togglePanel: function () {
		this.panelVisible = !this.panelVisible;
		this.updateDom();

		if (this.panelVisible) {
			this.resetAutoHide();
		} else {
			this.clearAutoHide();
		}
	},

	/**
	 * Reset auto-hide timer
	 */
	resetAutoHide: function () {
		this.clearAutoHide();
		if (this.config.autoHide > 0) {
			this.autoHideTimer = setTimeout(() => {
				this.panelVisible = false;
				this.updateDom();
			}, this.config.autoHide);
		}
	},

	/**
	 * Clear auto-hide timer
	 */
	clearAutoHide: function () {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer);
			this.autoHideTimer = null;
		}
	},

	/**
	 * Save service configuration
	 */
	saveServiceConfig: function (service) {
		const configDiv = document.getElementById(`config-${service}`);
		if (!configDiv) return;

		const inputs = configDiv.querySelectorAll("input");
		const config = {};

		inputs.forEach((input) => {
			config[input.name] = input.value;
		});

		this.sendSocketNotification("SETTINGS_SAVE_SERVICE", {
			service: service,
			config: config
		});
	},

	/**
	 * Initiate OAuth flow
	 */
	initiateOAuth: function (service) {
		this.sendSocketNotification("SETTINGS_OAUTH_START", {
			service: service
		});
	},

	/**
	 * Test service connection
	 */
	testConnection: function (service) {
		const configDiv = document.getElementById(`config-${service}`);
		const inputs = configDiv ? configDiv.querySelectorAll("input") : [];
		const config = {};

		inputs.forEach((input) => {
			config[input.name] = input.value;
		});

		this.sendSocketNotification("SETTINGS_TEST_CONNECTION", {
			service: service,
			config: config
		});
	},

	/**
	 * Toggle module enabled state
	 */
	toggleModule: function (moduleName, enabled) {
		this.sendSocketNotification("SETTINGS_TOGGLE_MODULE", {
			module: moduleName,
			enabled: enabled
		});
	},

	/**
	 * Show notification toast
	 */
	showNotification: function (message, type = "info") {
		this.sendNotification("SHOW_ALERT", {
			type: type === "error" ? "notification" : "notification",
			title: type === "error" ? "Error" : "Success",
			message: message,
			timer: 3000
		});
	},

	/**
	 * Format field name for display
	 */
	formatFieldName: function (field) {
		return field
			.replace(/([A-Z])/g, " $1")
			.replace(/^./, (str) => str.toUpperCase())
			.replace("Api", "API")
			.replace("Url", "URL");
	}
});
