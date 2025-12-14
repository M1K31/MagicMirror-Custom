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
		autoHide: 0,  // Disabled - close manually with X or "close settings" voice command
		// Available service integrations
		services: {
			homeassistant: {
				name: "Home Assistant",
				icon: "fa-house-signal",
				enabled: true,
				fields: ["host", "token"],
				description: "Control 2000+ smart home devices",
				category: "smarthome"
			},
			homekit: {
				name: "Apple HomeKit",
				icon: "fa-apple",
				enabled: true,
				fields: [],
				description: "Control HomeKit accessories directly",
				category: "smarthome",
				requiresPairing: true
			},
			googlenest: {
				name: "Google Nest",
				icon: "fa-google",
				enabled: true,
				oauth: true,
				fields: ["projectId"],
				description: "Control Nest thermostats, cameras, doorbells",
				category: "smarthome",
				helpText: "Requires Google Device Access ($5 one-time fee)"
			},
			openeye: {
				name: "OpenEye Security",
				icon: "fa-shield-halved",
				enabled: true,
				fields: ["host", "token"],
				description: "AI-powered home surveillance",
				category: "security"
			},
			googlecalendar: {
				name: "Google Calendar",
				icon: "fa-calendar",
				enabled: true,
				fields: ["icalUrl"],
				description: "Sync your Google Calendar (no API needed)",
				helpText: "Get your calendar's secret iCal URL from Google Calendar settings",
				category: "calendar"
			},
			outlookcalendar: {
				name: "Outlook Calendar",
				icon: "fa-calendar-days",
				enabled: true,
				fields: ["icalUrl"],
				description: "Sync your Outlook/Microsoft calendar",
				helpText: "Get your calendar's ICS link from Outlook settings",
				category: "calendar"
			},
			applecalendar: {
				name: "Apple Calendar",
				icon: "fa-apple",
				enabled: true,
				fields: ["icalUrl"],
				description: "Sync your iCloud calendar",
				helpText: "Share your calendar and copy the public URL",
				category: "calendar"
			},
			spotify: {
				name: "Spotify",
				icon: "fa-spotify",
				enabled: true,
				oauth: true,
				description: "Music playback (requires Spotify Developer account)",
				helpText: "Spotify requires OAuth - create app at developer.spotify.com",
				category: "media"
			},
			openweathermap: {
				name: "OpenWeatherMap",
				icon: "fa-cloud-sun",
				enabled: true,
				fields: ["apiKey", "location"],
				description: "Weather data provider",
				category: "weather"
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
		this.trackedPackages = [];
		this.weatherLocations = [];
		this.newsLocations = [];
		this.newsSources = [];

		// Request current configuration from node_helper
		this.sendSocketNotification("SETTINGS_GET_CONFIG", {});
		this.sendSocketNotification("SETTINGS_GET_MODULES", {});
		this.sendSocketNotification("SETTINGS_GET_SYSTEM_INFO", {});
		this.sendSocketNotification("SETTINGS_GET_PACKAGES", {});
		this.sendSocketNotification("SETTINGS_GET_LOCATIONS", {});
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

			case "HOMEKIT_DEVICES":
				this.updateHomeKitDevicesList(payload.devices);
				break;

			case "HOMEKIT_PAIRED":
				this.showNotification(`Paired with ${payload.deviceName} successfully`, "success");
				// Refresh device list
				this.discoverHomeKitDevices();
				break;

			case "HOMEKIT_UNPAIRED":
				this.showNotification(`Unpaired from ${payload.deviceName}`, "success");
				// Refresh device list
				this.discoverHomeKitDevices();
				break;

			case "HOMEKIT_ERROR":
				this.showNotification(payload.message, "error");
				break;

			case "SETTINGS_PACKAGES":
				this.trackedPackages = payload.packages || [];
				if (this.panelVisible && this.currentSection === "packages") {
					this.updatePackagesList();
				}
				break;

			case "SETTINGS_PACKAGE_ADDED":
				if (payload.success) {
					this.showNotification(`Package added: ${payload.carrier.toUpperCase()}`, "success");
					this.loadPackages();
				} else {
					this.showNotification(payload.error || "Failed to add package", "error");
				}
				break;

			case "SETTINGS_PACKAGE_REMOVED":
				if (payload.success) {
					this.showNotification("Package removed", "success");
					this.loadPackages();
				} else {
					this.showNotification(payload.error || "Failed to remove package", "error");
				}
				break;

			case "SETTINGS_LOCATIONS":
				this.weatherLocations = payload.weather || [];
				this.newsLocations = payload.news || [];
				this.newsSources = payload.sources || [];
				if (this.panelVisible && this.currentSection === "locations") {
					this.updateLocationsList();
				}
				break;

			case "SETTINGS_LOCATION_ADDED":
				if (payload.success) {
					this.showNotification(`Location added: ${payload.location}`, "success");
					this.loadLocations();
				} else {
					this.showNotification(payload.error || "Failed to add location", "error");
				}
				break;

			case "SETTINGS_NEWS_SOURCE_ADDED":
				if (payload.success) {
					this.showNotification(`News source added: ${payload.source}`, "success");
					this.loadLocations();
				} else {
					this.showNotification(payload.error || "Unknown news source", "error");
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
		// Only animate on first open, not when switching tabs
		panel.className = this.isFirstOpen ? "settings-panel animate-in" : "settings-panel";
		this.isFirstOpen = false;

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
			<button class="nav-btn ${this.currentSection === "ecosystem" ? "active" : ""}" data-section="ecosystem">
				<i class="fas fa-network-wired"></i> Ecosystem
			</button>
			<button class="nav-btn ${this.currentSection === "packages" ? "active" : ""}" data-section="packages">
				<i class="fas fa-box"></i> Packages
			</button>
			<button class="nav-btn ${this.currentSection === "locations" ? "active" : ""}" data-section="locations">
				<i class="fas fa-map-marker-alt"></i> Locations
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
			case "ecosystem":
				content.appendChild(this.createEcosystemSection());
				break;
			case "packages":
				content.appendChild(this.createPackagesSection());
				break;
			case "locations":
				content.appendChild(this.createLocationsSection());
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

		// Group services by category
		const categories = {
			smarthome: { name: "Smart Home", icon: "fa-house-signal", services: [] },
			security: { name: "Security", icon: "fa-shield-halved", services: [] },
			calendar: { name: "Calendars", icon: "fa-calendar", services: [] },
			media: { name: "Media", icon: "fa-music", services: [] },
			weather: { name: "Weather", icon: "fa-cloud-sun", services: [] }
		};

		// Sort services into categories
		for (const [key, service] of Object.entries(this.config.services)) {
			if (!service.enabled) continue;
			const cat = service.category || "other";
			if (categories[cat]) {
				categories[cat].services.push({ key, ...service });
			}
		}

		// Render each category
		for (const [catKey, category] of Object.entries(categories)) {
			if (category.services.length === 0) continue;

			const catSection = document.createElement("div");
			catSection.className = "service-category";
			catSection.innerHTML = `<h3 class="category-title"><i class="fas ${category.icon}"></i> ${category.name}</h3>`;

			const cardsContainer = document.createElement("div");
			cardsContainer.className = "service-cards";

			for (const service of category.services) {
				const key = service.key;
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
					<div class="service-help" id="help-${key}">
						${this.getSetupHelpText(key)}
					</div>
					<div class="service-config" id="config-${key}">
						${this.createServiceFields(key, service, config)}
					</div>
					${service.requiresPairing ? this.createHomekitPairingUI(config) : ""}
					<div class="service-actions">
						${this.createServiceButtons(key, service, config)}
					</div>
				`;

				cardsContainer.appendChild(card);
			}

			catSection.appendChild(cardsContainer);
			section.appendChild(catSection);
		}

		// Add voice command hints
		section.appendChild(this.createVoiceHints("services"));

		return section;
	},

	/**
	 * Create voice command hints for a section
	 */
	createVoiceHints: function (sectionType) {
		const hints = {
			services: [
				'"Connect to Home Assistant"',
				'"Set up OpenEye"',
				'"Add calendar"',
				'"Configure weather"'
			],
			ecosystem: [
				'"Discover apps"',
				'"Sync with OpenEye"',
				'"Enable notifications"'
			],
			packages: [
				'"Add package [tracking number]"',
				'"My packages"',
				'"Track delivery"',
				'"Remove package"'
			],
			locations: [
				'"Add location [city name]"',
				'"Weather in [city]"',
				'"Add news from BBC"',
				'"Remove location"'
			],
			modules: [
				'"Enable clock"',
				'"Disable weather"',
				'"Show calendar"',
				'"Hide compliments"'
			],
			display: [
				'"Brightness [0-100]"',
				'"Dim the display"',
				'"Night mode"',
				'"Set theme to dark"'
			],
			about: [
				'"System status"',
				'"Check for updates"',
				'"Restart mirror"'
			]
		};

		const sectionHints = hints[sectionType] || [];

		const container = document.createElement("div");
		container.className = "voice-hints";
		container.innerHTML = `
			<div class="voice-hints-header">
				<i class="fas fa-microphone"></i>
				<span>Voice Commands</span>
			</div>
			<div class="voice-hints-list">
				${sectionHints.map((hint) => `<span class="voice-hint">${hint}</span>`).join("")}
			</div>
		`;

		return container;
	},

	/**
	 * Create service action buttons based on service type
	 */
	createServiceButtons: function (key, service, config) {
		if (service.requiresPairing) {
			// HomeKit-style pairing
			return `
				<button class="btn btn-primary discover-btn" data-service="${key}">
					<i class="fas fa-search"></i> Discover Devices
				</button>
			`;
		} else if (service.oauth) {
			// OAuth services (Spotify, Google Nest)
			if (config.clientId) {
				return `
					<button class="btn btn-primary oauth-btn" data-service="${key}">
						<i class="fas fa-link"></i> Connect Account
					</button>
				`;
			} else {
				return `
					<button class="btn btn-primary save-btn" data-service="${key}">
						<i class="fas fa-save"></i> Save Credentials
					</button>
				`;
			}
		} else {
			// Standard services
			return `
				<button class="btn btn-primary save-btn" data-service="${key}">
					<i class="fas fa-save"></i> Save
				</button>
				<button class="btn btn-secondary test-btn" data-service="${key}">
					<i class="fas fa-vial"></i> Test
				</button>
			`;
		}
	},

	/**
	 * Create HomeKit pairing UI
	 */
	createHomekitPairingUI: function (config) {
		const devices = config.discoveredDevices || [];
		const pairedDevices = config.pairedDevices || [];

		let html = `<div class="homekit-section">`;

		// Show paired devices
		if (pairedDevices.length > 0) {
			html += `
				<div class="paired-devices">
					<h4><i class="fas fa-link"></i> Paired Devices</h4>
					<ul class="device-list">
						${pairedDevices.map((d) => `
							<li class="device-item paired">
								<i class="fas fa-check-circle"></i>
								<span class="device-name">${d.name || d.id}</span>
								<button class="btn btn-sm btn-danger unpair-btn" data-device="${d.id}">
									<i class="fas fa-unlink"></i>
								</button>
							</li>
						`).join("")}
					</ul>
				</div>
			`;
		}

		// Show discovered devices for pairing
		if (devices.length > 0) {
			html += `
				<div class="discovered-devices">
					<h4><i class="fas fa-wifi"></i> Available Devices</h4>
					<ul class="device-list">
						${devices.map((d) => `
							<li class="device-item available" data-device-id="${d.id}">
								<span class="device-name">${d.name || d.id}</span>
								<div class="pairing-input">
									<input type="text" class="pairing-code" placeholder="Enter 8-digit code" maxlength="10" data-device="${d.id}">
									<button class="btn btn-sm btn-primary pair-btn" data-device="${d.id}">
										<i class="fas fa-link"></i> Pair
									</button>
								</div>
							</li>
						`).join("")}
					</ul>
				</div>
			`;
		}

		html += `</div>`;
		return html;
	},

	/**
	 * Create input fields for a service
	 */
	createServiceFields: function (key, service, config) {
		let fields = service.fields || [];
		
		// Add OAuth credential fields for OAuth services
		if (service.oauth) {
			fields = ["clientId", "clientSecret", ...fields];
		}
		
		if (fields.length === 0) return "";

		return fields
			.map((field) => {
				const value = config[field] || "";
				const isSecret = field.toLowerCase().includes("token") || field.toLowerCase().includes("key") || field.toLowerCase().includes("secret") || field.toLowerCase().includes("password");

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

		// Add voice hints
		section.appendChild(this.createVoiceHints("modules"));

		return section;
	},

	/**
	 * Create packages tracking section
	 */
	createPackagesSection: function () {
		const section = document.createElement("div");
		section.className = "packages-section";

		// Load packages from state
		const packages = this.trackedPackages || [];

		section.innerHTML = `
			<div class="packages-header">
				<h3><i class="fas fa-box"></i> Package Tracking</h3>
				<p class="section-description">Track deliveries from major carriers including USPS, FedEx, UPS, DHL, and Amazon.</p>
			</div>

			<div class="add-package-form">
				<h4>Add New Package</h4>
				<div class="form-row">
					<div class="form-group">
						<label for="package-tracking">Tracking Number</label>
						<input type="text" id="package-tracking" placeholder="Enter tracking number">
					</div>
					<div class="form-group">
						<label for="package-name">Package Name (optional)</label>
						<input type="text" id="package-name" placeholder="e.g., Amazon Order">
					</div>
				</div>
				<div class="form-row">
					<div class="form-group">
						<label for="package-carrier">Carrier</label>
						<select id="package-carrier">
							<option value="auto">Auto-detect</option>
							<option value="usps">USPS</option>
							<option value="fedex">FedEx</option>
							<option value="ups">UPS</option>
							<option value="dhl">DHL</option>
							<option value="amazon">Amazon</option>
							<option value="other">Other</option>
						</select>
					</div>
					<button class="btn btn-primary" id="add-package-btn">
						<i class="fas fa-plus"></i> Add Package
					</button>
				</div>
			</div>

			<div class="tracked-packages">
				<h4>Tracked Packages</h4>
				<div class="packages-list" id="packages-list">
					${packages.length === 0 ? `
						<div class="empty-state">
							<i class="fas fa-box-open"></i>
							<p>No packages being tracked</p>
							<p class="hint">Add a tracking number above or say "add package [number]" to start tracking.</p>
						</div>
					` : packages.map((pkg) => `
						<div class="package-card" data-tracking="${pkg.tracking}">
							<div class="package-info">
								<div class="package-main">
									<i class="fas ${this.getCarrierIcon(pkg.carrier)}"></i>
									<div class="package-details">
										<span class="package-name">${pkg.name || "Package"}</span>
										<span class="package-carrier">${pkg.carrier.toUpperCase()}</span>
									</div>
								</div>
								<code class="package-tracking">${pkg.tracking}</code>
								${pkg.status ? `<span class="package-status ${pkg.status.toLowerCase()}">${pkg.status}</span>` : ""}
							</div>
							<div class="package-actions">
								<button class="btn btn-sm btn-secondary copy-tracking-btn" data-tracking="${pkg.tracking}" title="Copy tracking number">
									<i class="fas fa-copy"></i>
								</button>
								<button class="btn btn-sm btn-danger remove-package-btn" data-tracking="${pkg.tracking}" title="Remove package">
									<i class="fas fa-trash"></i>
								</button>
							</div>
						</div>
					`).join("")}
				</div>
			</div>

			`;

		// Add voice hints
		section.appendChild(this.createVoiceHints("packages"));

		// Load packages
		setTimeout(() => {
			this.loadPackages();
		}, 100);

		return section;
	},

	/**
	 * Get carrier icon
	 */
	getCarrierIcon: function (carrier) {
		const icons = {
			usps: "fa-flag-usa",
			fedex: "fa-plane",
			ups: "fa-truck",
			dhl: "fa-globe",
			amazon: "fa-amazon",
			other: "fa-box"
		};
		return icons[carrier] || icons.other;
	},

	/**
	 * Load tracked packages
	 */
	loadPackages: function () {
		this.sendSocketNotification("SETTINGS_GET_PACKAGES", {});
	},

	/**
	 * Create locations management section
	 */
	createLocationsSection: function () {
		const section = document.createElement("div");
		section.className = "locations-section";

		const weatherLocations = this.weatherLocations || [];
		const newsLocations = this.newsLocations || [];
		const newsSources = this.newsSources || [];

		section.innerHTML = `
			<div class="locations-header">
				<h3><i class="fas fa-map-marker-alt"></i> Locations</h3>
				<p class="section-description">Manage locations for weather and news feeds.</p>
			</div>

			<!-- Weather Locations -->
			<div class="locations-category">
				<h4><i class="fas fa-cloud-sun"></i> Weather Locations</h4>
				<p class="category-hint">Add cities to display weather information</p>
				
				<div class="add-location-form">
					<div class="form-row">
						<input type="text" id="weather-location-input" placeholder="Enter city name (e.g., New York)">
						<button class="btn btn-primary" id="add-weather-location-btn">
							<i class="fas fa-plus"></i> Add
						</button>
					</div>
				</div>

				<div class="locations-list" id="weather-locations-list">
					${weatherLocations.length === 0 ? `
						<div class="empty-state-small">
							<p>No weather locations added. Using device location.</p>
						</div>
					` : weatherLocations.map((loc, index) => `
						<div class="location-item" data-index="${index}">
							<div class="location-info">
								<i class="fas fa-map-pin"></i>
								<span class="location-name">${loc.name}</span>
								${loc.country ? `<span class="location-country">${loc.country}</span>` : ""}
								${index === 0 ? `<span class="primary-badge">Primary</span>` : ""}
							</div>
							<div class="location-actions">
								${index !== 0 ? `
									<button class="btn btn-sm btn-secondary set-primary-btn" data-type="weather" data-index="${index}" title="Set as primary">
										<i class="fas fa-star"></i>
									</button>
								` : ""}
								<button class="btn btn-sm btn-danger remove-location-btn" data-type="weather" data-index="${index}" title="Remove">
									<i class="fas fa-trash"></i>
								</button>
							</div>
						</div>
					`).join("")}
				</div>
			</div>

			<!-- News Sources -->
			<div class="locations-category">
				<h4><i class="fas fa-newspaper"></i> News Sources</h4>
				<p class="category-hint">Add RSS feeds for the news module</p>
				
				<div class="add-location-form">
					<div class="form-row">
						<select id="news-source-select">
							<option value="">Select a news source...</option>
							<option value="bbc">BBC News</option>
							<option value="cnn">CNN</option>
							<option value="nyt">New York Times</option>
							<option value="reuters">Reuters</option>
							<option value="ap">Associated Press</option>
							<option value="guardian">The Guardian</option>
							<option value="washingtonpost">Washington Post</option>
							<option value="custom">Custom RSS URL...</option>
						</select>
						<button class="btn btn-primary" id="add-news-source-btn">
							<i class="fas fa-plus"></i> Add
						</button>
					</div>
					<div class="form-row custom-rss-row" style="display:none;">
						<input type="url" id="custom-rss-url" placeholder="Enter RSS feed URL">
						<input type="text" id="custom-rss-name" placeholder="Feed name">
					</div>
				</div>

				<div class="sources-list" id="news-sources-list">
					${newsSources.length === 0 ? `
						<div class="empty-state-small">
							<p>No news sources configured. Add feeds above.</p>
						</div>
					` : newsSources.map((source, index) => `
						<div class="source-item" data-index="${index}">
							<div class="source-info">
								<i class="fas fa-rss"></i>
								<span class="source-name">${source.name || source.title}</span>
								<span class="source-url">${source.url}</span>
							</div>
							<div class="source-actions">
								<button class="btn btn-sm btn-danger remove-source-btn" data-index="${index}" title="Remove">
									<i class="fas fa-trash"></i>
								</button>
							</div>
						</div>
					`).join("")}
				</div>
			</div>
		`;

		// Add voice hints
		section.appendChild(this.createVoiceHints("locations"));

		// Load locations
		setTimeout(() => {
			this.loadLocations();
		}, 100);

		return section;
	},

	/**
	 * Load locations from config
	 */
	loadLocations: function () {
		this.sendSocketNotification("SETTINGS_GET_LOCATIONS", {});
	},

	/**
	 * Create ecosystem section for cross-app integration
	 */
	createEcosystemSection: function () {
		const section = document.createElement("div");
		section.className = "ecosystem-section";

		// Discovered Apps
		section.innerHTML = `
			<div class="ecosystem-category">
				<h3><i class="fas fa-satellite-dish"></i> Companion Apps</h3>
				<p class="category-description">Apps discovered on your network that can be integrated with MagicMirror³</p>
				<div class="discovered-apps" id="discovered-apps">
					<div class="scanning">
						<i class="fas fa-radar fa-spin"></i>
						<span>Scanning network for companion apps...</span>
					</div>
				</div>
			</div>

			<div class="ecosystem-category">
				<h3><i class="fas fa-bell"></i> Unified Notifications</h3>
				<p class="category-description">Route notifications between apps to avoid duplicates and ensure delivery</p>
				
				<h4>Delivery Methods</h4>
				<div class="notification-settings">
					<div class="notification-method">
						<div class="method-info">
							<i class="fas fa-eye"></i>
							<div class="method-details">
								<span class="method-name">OpenEye Push</span>
								<span class="method-description">Send to OpenEye for mobile push delivery</span>
							</div>
						</div>
						<label class="toggle-switch">
							<input type="checkbox" id="notify-openeye" data-method="openeye">
							<span class="toggle-slider"></span>
						</label>
					</div>
					<div class="notification-method">
						<div class="method-info">
							<i class="fas fa-mobile-alt"></i>
							<div class="method-details">
								<span class="method-name">Direct Push</span>
								<span class="method-description">Push notifications via companion app</span>
							</div>
						</div>
						<label class="toggle-switch">
							<input type="checkbox" id="notify-push" data-method="push">
							<span class="toggle-slider"></span>
						</label>
					</div>
				</div>

				<h4>Notification Types</h4>
				<div class="notification-types">
					<div class="notification-type">
						<input type="checkbox" id="type-motion" data-type="motion" checked>
						<label for="type-motion"><i class="fas fa-running"></i> Motion</label>
					</div>
					<div class="notification-type">
						<input type="checkbox" id="type-face" data-type="face" checked>
						<label for="type-face"><i class="fas fa-user"></i> Face Detection</label>
					</div>
					<div class="notification-type">
						<input type="checkbox" id="type-doorbell" data-type="doorbell" checked>
						<label for="type-doorbell"><i class="fas fa-bell"></i> Doorbell</label>
					</div>
					<div class="notification-type">
						<input type="checkbox" id="type-alarm" data-type="alarm" checked>
						<label for="type-alarm"><i class="fas fa-exclamation-triangle"></i> Alarms</label>
					</div>
					<div class="notification-type">
						<input type="checkbox" id="type-weather" data-type="weather">
						<label for="type-weather"><i class="fas fa-cloud"></i> Weather</label>
					</div>
					<div class="notification-type">
						<input type="checkbox" id="type-calendar" data-type="calendar">
						<label for="type-calendar"><i class="fas fa-calendar"></i> Calendar</label>
					</div>
				</div>

				<h4>Quiet Hours</h4>
				<div class="quiet-hours">
					<div class="quiet-hours-toggle">
						<label class="toggle-switch">
							<input type="checkbox" id="quiet-enabled">
							<span class="toggle-slider"></span>
						</label>
						<span>Enable Quiet Hours</span>
					</div>
					<div class="quiet-hours-times">
						<input type="time" id="quiet-start" value="22:00">
						<span>to</span>
						<input type="time" id="quiet-end" value="07:00">
					</div>
				</div>
			</div>

			<div class="ecosystem-category">
				<h3><i class="fas fa-sync-alt"></i> Sync Settings</h3>
				<p class="category-description">Automatically share configuration between apps</p>
				
				<div class="sync-options">
					<div class="sync-option">
						<div class="sync-info">
							<span class="sync-name">Sync Users</span>
							<span class="sync-description">Share user accounts between apps</span>
						</div>
						<label class="toggle-switch">
							<input type="checkbox" id="sync-users" checked>
							<span class="toggle-slider"></span>
						</label>
					</div>
					<div class="sync-option">
						<div class="sync-info">
							<span class="sync-name">Sync Integrations</span>
							<span class="sync-description">Share HomeKit, Home Assistant, Nest credentials</span>
						</div>
						<label class="toggle-switch">
							<input type="checkbox" id="sync-integrations" checked>
							<span class="toggle-slider"></span>
						</label>
					</div>
					<div class="sync-option">
						<div class="sync-info">
							<span class="sync-name">Sync Automations</span>
							<span class="sync-description">Share automation rules and triggers</span>
						</div>
						<label class="toggle-switch">
							<input type="checkbox" id="sync-automations">
							<span class="toggle-slider"></span>
						</label>
					</div>
				</div>
			</div>
		`;

		// Add voice hints
		section.appendChild(this.createVoiceHints("ecosystem"));

		// Request app discovery
		setTimeout(() => {
			this.sendNotification("ECOSYSTEM_GET_APPS", {});
		}, 100);

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

		// Add voice hints
		section.appendChild(this.createVoiceHints("display"));

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
				<h3>MagicMirror³</h3>
				<p class="version">Version 3.0.0</p>
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

		// Add voice hints
		section.appendChild(this.createVoiceHints("about"));

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
			prefix: prefix,
			app: "magicmirror"
		});

		// Generate QR code using the QRCode library if available, otherwise use API
		if (typeof QRCode !== "undefined") {
			container.innerHTML = "";
			new QRCode(container, {
				text: connectionData,
				width: 180,
				height: 180,
				colorDark: "#ffffff",
				colorLight: "transparent",
				correctLevel: QRCode.CorrectLevel.M
			});
		} else {
			// Fallback: Use Google Charts API for QR generation
			const encodedData = encodeURIComponent(connectionData);
			container.innerHTML = `
				<img src="https://chart.googleapis.com/chart?cht=qr&chs=180x180&chl=${encodedData}&chco=FFFFFF" 
					 alt="QR Code" 
					 style="background: white; border-radius: 8px; padding: 8px;">
				<p style="font-size: 11px; margin-top: 8px;">Scan with companion app</p>
			`;
		}

		// Store data for copy functionality
		container.dataset.qrData = connectionData;
	},

	/**
	 * Attach event listeners to panel elements
	 */
	attachPanelListeners: function () {
		// Close button - use closePanel directly
		const closeBtn = document.getElementById("settings-close");
		if (closeBtn && !closeBtn.dataset.listenerAttached) {
			closeBtn.dataset.listenerAttached = "true";
			closeBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.closePanel();
			});
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

		// HomeKit discover buttons
		document.querySelectorAll(".discover-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const service = e.currentTarget.dataset.service;
				this.discoverHomeKitDevices();
			});
		});

		// HomeKit pair buttons
		document.querySelectorAll(".pair-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const deviceId = e.currentTarget.dataset.device;
				const codeInput = document.querySelector(`.pairing-code[data-device="${deviceId}"]`);
				if (codeInput) {
					this.pairHomeKitDevice(deviceId, codeInput.value);
				}
			});
		});

		// HomeKit unpair buttons
		document.querySelectorAll(".unpair-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const deviceId = e.currentTarget.dataset.device;
				this.unpairHomeKitDevice(deviceId);
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

		// Package tracking listeners
		const addPackageBtn = document.getElementById("add-package-btn");
		if (addPackageBtn) {
			addPackageBtn.addEventListener("click", () => {
				const tracking = document.getElementById("package-tracking")?.value?.trim();
				const name = document.getElementById("package-name")?.value?.trim();
				const carrier = document.getElementById("package-carrier")?.value || "auto";

				if (tracking) {
					this.sendSocketNotification("SETTINGS_ADD_PACKAGE", {
						tracking,
						name: name || null,
						carrier: carrier === "auto" ? null : carrier
					});
					document.getElementById("package-tracking").value = "";
					document.getElementById("package-name").value = "";
				}
			});
		}

		// Copy tracking button
		document.querySelectorAll(".copy-tracking-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const tracking = e.currentTarget.dataset.tracking;
				this.copyToClipboard(tracking);
			});
		});

		// Remove package buttons
		document.querySelectorAll(".remove-package-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const tracking = e.currentTarget.dataset.tracking;
				this.sendSocketNotification("SETTINGS_REMOVE_PACKAGE", { tracking });
			});
		});

		// Add weather location
		const addWeatherBtn = document.getElementById("add-weather-location-btn");
		if (addWeatherBtn) {
			addWeatherBtn.addEventListener("click", () => {
				const location = document.getElementById("weather-location-input")?.value?.trim();
				if (location) {
					this.sendSocketNotification("SETTINGS_ADD_LOCATION", {
						type: "weather",
						location
					});
					document.getElementById("weather-location-input").value = "";
				}
			});
		}

		// Remove location buttons
		document.querySelectorAll(".remove-location-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const type = e.currentTarget.dataset.type;
				const index = parseInt(e.currentTarget.dataset.index, 10);
				this.sendSocketNotification("SETTINGS_REMOVE_LOCATION", { type, index });
			});
		});

		// Set primary location
		document.querySelectorAll(".set-primary-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const type = e.currentTarget.dataset.type;
				const index = parseInt(e.currentTarget.dataset.index, 10);
				this.sendSocketNotification("SETTINGS_SET_PRIMARY_LOCATION", { type, index });
			});
		});

		// Add news source
		const addNewsBtn = document.getElementById("add-news-source-btn");
		if (addNewsBtn) {
			addNewsBtn.addEventListener("click", () => {
				const select = document.getElementById("news-source-select");
				const source = select?.value;

				if (source === "custom") {
					const url = document.getElementById("custom-rss-url")?.value?.trim();
					const name = document.getElementById("custom-rss-name")?.value?.trim();
					if (url) {
						this.sendSocketNotification("SETTINGS_ADD_NEWS_SOURCE", {
							source: "custom",
							url,
							name: name || url
						});
					}
				} else if (source) {
					this.sendSocketNotification("SETTINGS_ADD_NEWS_SOURCE", { source });
				}

				if (select) select.value = "";
			});
		}

		// News source select change (show custom URL input)
		const newsSelect = document.getElementById("news-source-select");
		if (newsSelect) {
			newsSelect.addEventListener("change", (e) => {
				const customRow = document.querySelector(".custom-rss-row");
				if (customRow) {
					customRow.style.display = e.target.value === "custom" ? "flex" : "none";
				}
			});
		}

		// Remove news source
		document.querySelectorAll(".remove-source-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const index = parseInt(e.currentTarget.dataset.index, 10);
				this.sendSocketNotification("SETTINGS_REMOVE_NEWS_SOURCE", { index });
			});
		});
	},

	/**
	 * Update packages list display
	 */
	updatePackagesList: function () {
		const list = document.getElementById("packages-list");
		if (!list) return;

		const packages = this.trackedPackages || [];

		if (packages.length === 0) {
			list.innerHTML = `
				<div class="empty-state">
					<i class="fas fa-box-open"></i>
					<p>No packages being tracked</p>
					<p class="hint">Add a tracking number above or say "add package [number]" to start tracking.</p>
				</div>
			`;
		} else {
			list.innerHTML = packages.map((pkg) => `
				<div class="package-card" data-tracking="${pkg.tracking}">
					<div class="package-info">
						<div class="package-main">
							<i class="fas ${this.getCarrierIcon(pkg.carrier)}"></i>
							<div class="package-details">
								<span class="package-name">${pkg.name || "Package"}</span>
								<span class="package-carrier">${pkg.carrier.toUpperCase()}</span>
							</div>
						</div>
						<code class="package-tracking">${pkg.tracking}</code>
						${pkg.status ? `<span class="package-status ${pkg.status.toLowerCase()}">${pkg.status}</span>` : ""}
					</div>
					<div class="package-actions">
						<button class="btn btn-sm btn-secondary copy-tracking-btn" data-tracking="${pkg.tracking}" title="Copy tracking number">
							<i class="fas fa-copy"></i>
						</button>
						<button class="btn btn-sm btn-danger remove-package-btn" data-tracking="${pkg.tracking}" title="Remove package">
							<i class="fas fa-trash"></i>
						</button>
					</div>
				</div>
			`).join("");

			// Reattach listeners
			this.attachPanelListeners();
		}
	},

	/**
	 * Update locations list display
	 */
	updateLocationsList: function () {
		// Refresh the entire locations section
		const section = document.querySelector(".locations-section");
		if (section) {
			const newSection = this.createLocationsSection();
			section.replaceWith(newSection);
			this.attachPanelListeners();
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
		if (this.panelVisible) {
			this.closePanel();
		} else {
			this.openPanel();
		}
	},

	/**
	 * Open settings panel
	 */
	openPanel: function () {
		if (this.panelVisible) return;
		this.panelVisible = true;
		this.isFirstOpen = true;
		this.updateDom();
		this.resetAutoHide();
	},

	/**
	 * Close settings panel
	 */
	closePanel: function () {
		if (!this.panelVisible) return;
		this.panelVisible = false;
		this.updateDom();
		this.clearAutoHide();
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
	 * Discover HomeKit devices on local network
	 */
	discoverHomeKitDevices: function () {
		const deviceList = document.getElementById("homekit-devices");
		if (deviceList) {
			deviceList.innerHTML = '<div class="discovering"><i class="fas fa-spinner fa-spin"></i> Scanning for HomeKit devices...</div>';
		}
		this.sendSocketNotification("HOMEKIT_DISCOVER", {});
	},

	/**
	 * Pair with a HomeKit device
	 */
	pairHomeKitDevice: function (deviceId, pairingCode) {
		if (!pairingCode || pairingCode.length !== 8) {
			this.showNotification("Please enter the 8-digit pairing code from your device", "error");
			return;
		}

		// Format pairing code as XXX-XX-XXX
		const formattedCode = `${pairingCode.slice(0, 3)}-${pairingCode.slice(3, 5)}-${pairingCode.slice(5, 8)}`;

		this.showNotification("Pairing with device...", "info");
		this.sendSocketNotification("HOMEKIT_PAIR", {
			deviceId: deviceId,
			pairingCode: formattedCode
		});
	},

	/**
	 * Unpair a HomeKit device
	 */
	unpairHomeKitDevice: function (deviceId) {
		if (confirm("Are you sure you want to unpair this device?")) {
			this.sendSocketNotification("HOMEKIT_UNPAIR", {
				deviceId: deviceId
			});
		}
	},

	/**
	 * Update HomeKit devices list in UI
	 */
	updateHomeKitDevicesList: function (devices) {
		const deviceList = document.getElementById("homekit-devices");
		if (!deviceList) return;

		if (!devices || devices.length === 0) {
			deviceList.innerHTML = '<div class="no-devices">No HomeKit devices found. Make sure your devices are on the same network.</div>';
			return;
		}

		let html = "";
		devices.forEach((device) => {
			const isPaired = device.paired;
			html += `
				<div class="homekit-device ${isPaired ? "paired" : ""}">
					<div class="device-info">
						<i class="fas fa-${this.getDeviceIcon(device.category)}"></i>
						<div class="device-details">
							<span class="device-name">${device.name}</span>
							<span class="device-status">${isPaired ? "Paired" : "Not Paired"}</span>
						</div>
					</div>
					${
	isPaired
		? `<button class="unpair-btn" data-device="${device.id}"><i class="fas fa-unlink"></i> Unpair</button>`
		: `<div class="pairing-controls">
								<input type="text" class="pairing-code" data-device="${device.id}" placeholder="12345678" maxlength="8" pattern="[0-9]{8}">
								<button class="pair-btn" data-device="${device.id}"><i class="fas fa-link"></i> Pair</button>
							</div>`
}
				</div>
			`;
		});

		deviceList.innerHTML = html;

		// Reattach event listeners for new buttons
		deviceList.querySelectorAll(".pair-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const id = e.currentTarget.dataset.device;
				const codeInput = deviceList.querySelector(`.pairing-code[data-device="${id}"]`);
				if (codeInput) {
					this.pairHomeKitDevice(id, codeInput.value);
				}
			});
		});

		deviceList.querySelectorAll(".unpair-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const id = e.currentTarget.dataset.device;
				this.unpairHomeKitDevice(id);
			});
		});
	},

	/**
	 * Get FontAwesome icon for HomeKit device category
	 */
	getDeviceIcon: function (category) {
		const icons = {
			lightbulb: "lightbulb",
			switch: "toggle-on",
			outlet: "plug",
			thermostat: "thermometer-half",
			lock: "lock",
			garage: "warehouse",
			door: "door-open",
			window: "border-none",
			fan: "fan",
			sensor: "eye",
			camera: "video",
			speaker: "volume-up",
			television: "tv"
		};
		return icons[category] || "home";
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
	 * Get setup help text for a service
	 */
	getSetupHelpText: function (service) {
		const helpTexts = {
			googlecalendar: `
				<strong>How to get your Google Calendar URL:</strong>
				<ol>
					<li>Open <a href="https://calendar.google.com" target="_blank">Google Calendar</a></li>
					<li>Click ⚙️ Settings → Select your calendar</li>
					<li>Scroll to "Integrate calendar"</li>
					<li>Copy "Secret address in iCal format"</li>
				</ol>
			`,
			outlookcalendar: `
				<strong>How to get your Outlook Calendar URL:</strong>
				<ol>
					<li>Open <a href="https://outlook.live.com/calendar" target="_blank">Outlook Calendar</a></li>
					<li>Click ⚙️ → View all Outlook settings</li>
					<li>Go to Calendar → Shared calendars</li>
					<li>Publish a calendar and copy the ICS link</li>
				</ol>
			`,
			applecalendar: `
				<strong>How to get your Apple Calendar URL:</strong>
				<ol>
					<li>Open Calendar on Mac or iCloud.com</li>
					<li>Right-click your calendar → Share Calendar</li>
					<li>Check "Public Calendar" and copy the URL</li>
				</ol>
			`,
			spotify: `
				<strong>Spotify requires developer credentials:</strong>
				<ol>
					<li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank">Spotify Developer</a></li>
					<li>Create an app and get Client ID/Secret</li>
					<li>Add redirect URI: http://localhost:8080/oauth/callback/spotify</li>
				</ol>
			`,
			openweathermap: `
				<strong>Get a free weather API key:</strong>
				<ol>
					<li>Sign up at <a href="https://openweathermap.org/api" target="_blank">OpenWeatherMap</a></li>
					<li>Go to API Keys and copy your key</li>
					<li>Enter your city name (e.g., "New York" or "London,UK")</li>
				</ol>
			`,
			openeye: `Enter the URL and token for your OpenEye security server.`,
			homeassistant: `
				<strong>Home Assistant Setup (Easy!):</strong>
				<ol>
					<li>Open your Home Assistant dashboard</li>
					<li>Click your profile (bottom left) → Security tab</li>
					<li>Scroll to "Long-Lived Access Tokens"</li>
					<li>Click "Create Token" and copy it</li>
					<li>Enter your HA URL (e.g., http://homeassistant.local:8123)</li>
				</ol>
				<p><em>💡 Tip: Home Assistant can connect to HomeKit, Nest, and 2000+ other devices!</em></p>
			`,
			homekit: `
				<strong>HomeKit Pairing:</strong>
				<ol>
					<li>Click "Discover Devices" to find HomeKit accessories on your network</li>
					<li>Select a device and enter its 8-digit pairing code</li>
					<li>The code is on the device or in its manual</li>
				</ol>
				<p><em>⚠️ Each accessory can only be paired with one controller at a time.</em></p>
			`,
			googlenest: `
				<strong>Google Nest Setup:</strong>
				<ol>
					<li>Go to <a href="https://console.nest.google.com/device-access" target="_blank">Google Device Access Console</a></li>
					<li>Pay $5 one-time registration fee</li>
					<li>Create a project and enable Device Access API</li>
					<li>Create OAuth credentials in <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a></li>
					<li>Enter your Client ID and Secret, then click Connect</li>
				</ol>
			`
		};
		return helpTexts[service] || "";
	},

	/**
	 * Get OAuth setup information for a service (legacy)
	 */
	getOAuthSetupInfo: function (service) {
		return this.config.services[service]?.helpText || "Enter your credentials to connect.";
	},

	/**
	 * Format field name for display
	 */
	formatFieldName: function (field) {
		const fieldNames = {
			icalUrl: "Calendar URL (iCal)",
			apiKey: "API Key",
			clientId: "Client ID",
			clientSecret: "Client Secret",
			host: "Server URL",
			token: "Access Token",
			location: "City/Location"
		};
		return fieldNames[field] || field
			.replace(/([A-Z])/g, " $1")
			.replace(/^./, (str) => str.toUpperCase())
			.replace("Api", "API")
			.replace("Url", "URL");
	}
});
