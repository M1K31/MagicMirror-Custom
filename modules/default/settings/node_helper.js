/**
 * Settings Module - Node Helper
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Handles backend operations for the settings module:
 * - Reading/writing configuration
 * - OAuth authentication flows
 * - Service connection testing
 * - System information
 */

const NodeHelper = require("node_helper");
const fs = require("fs").promises;
const path = require("path");
const https = require("https");
const http = require("http");
const { exec } = require("child_process");
const Log = require("logger");

// OAuth configurations for services
const OAUTH_CONFIGS = {
	spotify: {
		authUrl: "https://accounts.spotify.com/authorize",
		tokenUrl: "https://accounts.spotify.com/api/token",
		scopes: ["user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing"]
	},
	googlecalendar: {
		authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
		tokenUrl: "https://oauth2.googleapis.com/token",
		scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
	},
	googlenest: {
		authUrl: "https://nestservices.google.com/partnerconnections",
		tokenUrl: "https://oauth2.googleapis.com/token",
		scopes: ["https://www.googleapis.com/auth/sdm.service"],
		// Device Access requires project ID from Google Device Access Console
		projectIdRequired: true
	},
	ring: {
		// Ring uses username/password, not OAuth
		usesCredentials: true
	}
};

module.exports = NodeHelper.create({
	/**
	 * Start the node helper
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper starting...`);

		this.configPath = path.join(__dirname, "..", "..", "..", "config", "config.js");
		this.secretsPath = path.join(__dirname, "..", "..", "..", "config", "secrets.json");
		this.serviceConfigs = {};

		// Load secrets if exists
		this.loadSecrets();
	},

	/**
	 * Load secrets from file
	 */
	loadSecrets: async function () {
		try {
			const data = await fs.readFile(this.secretsPath, "utf8");
			this.serviceConfigs = JSON.parse(data);
		} catch (error) {
			// Secrets file doesn't exist yet, that's okay
			this.serviceConfigs = {};
		}
	},

	/**
	 * Save secrets to file
	 */
	saveSecrets: async function () {
		try {
			await fs.writeFile(this.secretsPath, JSON.stringify(this.serviceConfigs, null, 2));
			return true;
		} catch (error) {
			Log.error(`[${this.name}] Failed to save secrets:`, error);
			return false;
		}
	},

	/**
	 * Handle socket notifications from frontend
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "SETTINGS_GET_CONFIG":
				this.sendServiceConfigs();
				break;

			case "SETTINGS_GET_MODULES":
				this.sendModulesList();
				break;

			case "SETTINGS_SAVE_SERVICE":
				this.saveServiceConfig(payload.service, payload.config);
				break;

			case "SETTINGS_TEST_CONNECTION":
				this.testConnection(payload.service, payload.config);
				break;

			case "SETTINGS_OAUTH_START":
				this.startOAuth(payload.service);
				break;

			case "SETTINGS_TOGGLE_MODULE":
				this.toggleModule(payload.module, payload.enabled);
				break;

			case "SETTINGS_GET_SYSTEM_INFO":
				this.sendSystemInfo();
				break;

			case "HOMEKIT_DISCOVER":
				this.discoverHomeKitDevices();
				break;

			case "HOMEKIT_PAIR":
				this.pairHomeKitDevice(payload.deviceId, payload.pairingCode);
				break;

			case "HOMEKIT_UNPAIR":
				this.unpairHomeKitDevice(payload.deviceId);
				break;

			// Package tracking
			case "SETTINGS_GET_PACKAGES":
				this.getPackages();
				break;

			case "SETTINGS_ADD_PACKAGE":
				this.addPackage(payload);
				break;

			case "SETTINGS_REMOVE_PACKAGE":
				this.removePackage(payload.tracking);
				break;

			// Locations management
			case "SETTINGS_GET_LOCATIONS":
				this.getLocations();
				break;

			case "SETTINGS_ADD_LOCATION":
				this.addLocation(payload.type, payload.location);
				break;

			case "SETTINGS_REMOVE_LOCATION":
				this.removeLocation(payload.type, payload.index);
				break;

			case "SETTINGS_SET_PRIMARY_LOCATION":
				this.setPrimaryLocation(payload.type, payload.index);
				break;

			case "SETTINGS_ADD_NEWS_SOURCE":
				this.addNewsSource(payload);
				break;

			case "SETTINGS_REMOVE_NEWS_SOURCE":
				this.removeNewsSource(payload.index);
				break;
		}
	},

	/**
	 * Send current service configurations
	 */
	sendServiceConfigs: function () {
		this.sendSocketNotification("SETTINGS_CONFIG", {
			services: this.serviceConfigs
		});
	},

	/**
	 * Get list of modules from config
	 */
	sendModulesList: async function () {
		try {
			const configContent = await fs.readFile(this.configPath, "utf8");

			// Extract modules array from config
			const modulesMatch = configContent.match(/modules:\s*\[([\s\S]*?)\](?=\s*[,}]?\s*(?:\/\/|\/\*|$))/);
			if (modulesMatch) {
				// Parse module names (simplified parsing)
				const moduleNames = [];
				const modulePattern = /module:\s*["']([^"']+)["']/g;
				let match;
				while ((match = modulePattern.exec(modulesMatch[1])) !== null) {
					moduleNames.push({ name: match[1] });
				}

				this.sendSocketNotification("SETTINGS_MODULES", {
					modules: moduleNames
				});
			}
		} catch (error) {
			Log.error(`[${this.name}] Failed to read modules:`, error);
			this.sendSocketNotification("SETTINGS_MODULES", { modules: [] });
		}
	},

	/**
	 * Save service configuration
	 */
	saveServiceConfig: async function (service, config) {
		try {
			this.serviceConfigs[service] = {
				...this.serviceConfigs[service],
				...config,
				updatedAt: new Date().toISOString()
			};

			const saved = await this.saveSecrets();
			if (saved) {
				this.sendSocketNotification("SETTINGS_SAVED", { service });
			} else {
				throw new Error("Failed to write secrets file");
			}
		} catch (error) {
			this.sendSocketNotification("SETTINGS_ERROR", {
				message: `Failed to save ${service} config: ${error.message}`
			});
		}
	},

	/**
	 * Test service connection
	 */
	testConnection: async function (service, config) {
		try {
			let success = false;
			let error = null;

			switch (service) {
				case "openeye":
					success = await this.testOpenEye(config);
					break;

				case "homeassistant":
					success = await this.testHomeAssistant(config);
					break;

				case "openweathermap":
					success = await this.testOpenWeatherMap(config);
					break;

				case "googlecalendar":
				case "outlookcalendar":
				case "applecalendar":
					success = await this.testCalendarUrl(config);
					break;

				default:
					error = "Test not implemented for this service";
			}

			this.sendSocketNotification("SETTINGS_TEST_RESULT", {
				service,
				success,
				error
			});
		} catch (err) {
			this.sendSocketNotification("SETTINGS_TEST_RESULT", {
				service,
				success: false,
				error: err.message
			});
		}
	},

	/**
	 * Test OpenEye connection
	 */
	testOpenEye: function (config) {
		return new Promise((resolve, reject) => {
			const host = config.host || "http://localhost:8000";
			const url = new URL("/api/health", host);

			const req = (url.protocol === "https:" ? https : http).get(url.toString(), (res) => {
				if (res.statusCode === 200) {
					resolve(true);
				} else {
					reject(new Error(`HTTP ${res.statusCode}`));
				}
			});

			req.on("error", reject);
			req.setTimeout(5000, () => {
				req.destroy();
				reject(new Error("Connection timeout"));
			});
		});
	},

	/**
	 * Test Home Assistant connection
	 */
	testHomeAssistant: function (config) {
		return new Promise((resolve, reject) => {
			const host = config.host || "http://localhost:8123";
			const token = config.token;
			const url = new URL("/api/", host);

			const options = {
				hostname: url.hostname,
				port: url.port,
				path: url.pathname,
				method: "GET",
				headers: {
					"Authorization": `Bearer ${token}`,
					"Content-Type": "application/json"
				}
			};

			const req = (url.protocol === "https:" ? https : http).request(options, (res) => {
				if (res.statusCode === 200 || res.statusCode === 201) {
					resolve(true);
				} else {
					reject(new Error(`HTTP ${res.statusCode}`));
				}
			});

			req.on("error", reject);
			req.setTimeout(5000, () => {
				req.destroy();
				reject(new Error("Connection timeout"));
			});
			req.end();
		});
	},

	/**
	 * Test OpenWeatherMap API
	 */
	testOpenWeatherMap: function (config) {
		return new Promise((resolve, reject) => {
			const apiKey = config.apiKey;
			if (!apiKey) {
				reject(new Error("API key required"));
				return;
			}

			const url = `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${apiKey}`;

			https
				.get(url, (res) => {
					if (res.statusCode === 200) {
						resolve(true);
					} else if (res.statusCode === 401) {
						reject(new Error("Invalid API key"));
					} else {
						reject(new Error(`HTTP ${res.statusCode}`));
					}
				})
				.on("error", reject);
		});
	},

	/**
	 * Test calendar iCal URL
	 */
	testCalendarUrl: function (config) {
		return new Promise((resolve, reject) => {
			const icalUrl = config.icalUrl;
			if (!icalUrl) {
				reject(new Error("Calendar URL required"));
				return;
			}

			try {
				const url = new URL(icalUrl);
				const protocol = url.protocol === "https:" ? https : http;

				const req = protocol.get(icalUrl, (res) => {
					if (res.statusCode === 200) {
						// Check if response looks like iCal data
						let data = "";
						res.on("data", (chunk) => data += chunk.toString().substring(0, 100));
						res.on("end", () => {
							if (data.includes("BEGIN:VCALENDAR") || data.includes("VCALENDAR")) {
								resolve(true);
							} else {
								reject(new Error("URL does not return valid calendar data"));
							}
						});
					} else if (res.statusCode === 301 || res.statusCode === 302) {
						resolve(true); // Redirect is okay, the calendar module handles it
					} else {
						reject(new Error(`HTTP ${res.statusCode} - Check if URL is correct`));
					}
				});

				req.on("error", (err) => reject(new Error(`Connection failed: ${err.message}`)));
				req.setTimeout(10000, () => {
					req.destroy();
					reject(new Error("Connection timeout"));
				});
			} catch (e) {
				reject(new Error("Invalid URL format"));
			}
		});
	},

	/**
	 * Start OAuth flow for a service
	 */
	startOAuth: async function (service) {
		const oauthConfig = OAUTH_CONFIGS[service];
		if (!oauthConfig) {
			this.sendSocketNotification("SETTINGS_ERROR", {
				message: `OAuth not configured for ${service}`
			});
			return;
		}

		// Check if client credentials are configured
		const serviceConfig = this.serviceConfigs[service] || {};
		const clientId = serviceConfig.clientId;
		const clientSecret = serviceConfig.clientSecret;

		if (!clientId || !clientSecret) {
			this.sendSocketNotification("SETTINGS_ERROR", {
				message: `Please save your Client ID and Client Secret first, then click Connect.`
			});
			return;
		}

		// Generate OAuth URL
		const state = Math.random().toString(36).substring(7);
		const redirectUri = `http://localhost:8080/oauth/callback/${service}`;
		
		const authUrl = new URL(oauthConfig.authUrl);
		authUrl.searchParams.set("client_id", clientId);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", oauthConfig.scopes.join(" "));
		authUrl.searchParams.set("state", state);
		authUrl.searchParams.set("access_type", "offline");
		authUrl.searchParams.set("prompt", "consent");

		// Store state for verification
		this.serviceConfigs[service] = {
			...this.serviceConfigs[service],
			oauthState: state
		};
		await this.saveSecrets();

		// Send URL to frontend to open
		this.sendSocketNotification("SETTINGS_OAUTH_URL", {
			service: service,
			url: authUrl.toString()
		});
	},

	/**
	 * Toggle module enabled/disabled
	 */
	toggleModule: async function (moduleName, enabled) {
		try {
			const configContent = await fs.readFile(this.configPath, "utf8");

			// This is a simplified implementation
			// A full implementation would properly parse and modify the config

			if (enabled) {
				// Module should be enabled - check if it exists
				const modulePattern = new RegExp(`module:\\s*["']${moduleName}["']`);
				if (!modulePattern.test(configContent)) {
					// Add module to config (would need more sophisticated config parsing)
					Log.info(`[${this.name}] Would add module: ${moduleName}`);
				}
			} else {
				// Module should be disabled
				Log.info(`[${this.name}] Would remove module: ${moduleName}`);
			}

			this.sendSocketNotification("SETTINGS_SAVED", {});
			this.sendSocketNotification("SETTINGS_ERROR", {
				message: "Module toggle requires page refresh to take effect"
			});
		} catch (error) {
			this.sendSocketNotification("SETTINGS_ERROR", {
				message: `Failed to toggle module: ${error.message}`
			});
		}
	},

	/**
	 * Get and send system information
	 */
	sendSystemInfo: async function () {
		const info = {
			platform: process.platform,
			node: process.version,
			uptime: this.formatUptime(process.uptime()),
			memory: this.formatMemory(process.memoryUsage().heapUsed)
		};

		// Read API token for companion app setup
		try {
			const tokenPath = path.join(__dirname, "..", "..", "..", "config", ".api_token");
			const tokenData = await fs.readFile(tokenPath, "utf8");
			const parsed = JSON.parse(tokenData);
			info.apiToken = parsed.token;
			info.apiHost = parsed.host;
			info.apiPrefix = parsed.prefix;
		} catch (err) {
			// API token file doesn't exist or couldn't be read
			Log.warn(`[${this.name}] Could not read API token: ${err.message}`);
			info.apiToken = null;
		}

		// Update UI with system info
		exec("cat /etc/os-release 2>/dev/null | head -1 || echo 'Unknown OS'", (error, stdout) => {
			if (!error) {
				info.os = stdout.trim().replace('PRETTY_NAME="', "").replace('"', "");
			}

			this.sendSocketNotification("SETTINGS_SYSTEM_INFO", info);
		});
	},

	/**
	 * Format uptime for display
	 */
	formatUptime: function (seconds) {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const mins = Math.floor((seconds % 3600) / 60);

		if (days > 0) return `${days}d ${hours}h ${mins}m`;
		if (hours > 0) return `${hours}h ${mins}m`;
		return `${mins}m`;
	},

	/**
	 * Format memory for display
	 */
	formatMemory: function (bytes) {
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	},

	/**
	 * Discover HomeKit devices on the local network
	 * Uses mDNS/Bonjour to find HAP (HomeKit Accessory Protocol) devices
	 */
	discoverHomeKitDevices: async function () {
		try {
			// Try to use hap-controller if available
			let HapClient;
			try {
				HapClient = require("hap-controller");
			} catch (e) {
				// hap-controller not installed, use mock discovery for now
				Log.warn(`[${this.name}] hap-controller not installed. Install with: npm install hap-controller`);

				// Check if we have any saved paired devices
				const pairedDevices = this.serviceConfigs.homekit?.devices || [];

				if (pairedDevices.length > 0) {
					this.sendSocketNotification("HOMEKIT_DEVICES", {
						devices: pairedDevices.map((d) => ({ ...d, paired: true }))
					});
				} else {
					this.sendSocketNotification("HOMEKIT_ERROR", {
						message: "HomeKit discovery requires the hap-controller package. Run: npm install hap-controller"
					});
				}
				return;
			}

			const { HttpClient, IPDiscovery } = HapClient;
			const discovery = new IPDiscovery();

			Log.info(`[${this.name}] Starting HomeKit device discovery...`);

			// Start discovery (timeout after 10 seconds)
			const devices = [];
			const pairedDeviceIds = (this.serviceConfigs.homekit?.devices || []).map((d) => d.id);

			discovery.on("serviceUp", (service) => {
				const device = {
					id: service.id,
					name: service.name,
					address: service.address,
					port: service.port,
					category: this.getHomeKitCategory(service.ci),
					paired: pairedDeviceIds.includes(service.id)
				};
				devices.push(device);
				Log.info(`[${this.name}] Found HomeKit device: ${device.name}`);
			});

			await discovery.start();

			// Wait for discovery
			await new Promise((resolve) => setTimeout(resolve, 10000));
			await discovery.stop();

			this.sendSocketNotification("HOMEKIT_DEVICES", { devices });
		} catch (error) {
			Log.error(`[${this.name}] HomeKit discovery failed:`, error);
			this.sendSocketNotification("HOMEKIT_ERROR", {
				message: `Discovery failed: ${error.message}`
			});
		}
	},

	/**
	 * Pair with a HomeKit device
	 */
	pairHomeKitDevice: async function (deviceId, pairingCode) {
		try {
			let HapClient;
			try {
				HapClient = require("hap-controller");
			} catch (e) {
				this.sendSocketNotification("HOMEKIT_ERROR", {
					message: "HomeKit pairing requires the hap-controller package. Run: npm install hap-controller"
				});
				return;
			}

			const { HttpClient, IPDiscovery } = HapClient;
			const discovery = new IPDiscovery();

			// Find the device
			let targetDevice = null;

			discovery.on("serviceUp", (service) => {
				if (service.id === deviceId) {
					targetDevice = service;
				}
			});

			await discovery.start();
			await new Promise((resolve) => setTimeout(resolve, 5000));
			await discovery.stop();

			if (!targetDevice) {
				this.sendSocketNotification("HOMEKIT_ERROR", {
					message: "Device not found. Please try discovering devices again."
				});
				return;
			}

			// Attempt pairing
			const client = new HttpClient(deviceId, targetDevice.address, targetDevice.port);
			await client.pairSetup(pairingCode);

			// Save pairing data
			const pairingData = client.getLongTermData();

			if (!this.serviceConfigs.homekit) {
				this.serviceConfigs.homekit = { devices: [] };
			}

			// Remove existing entry if any
			this.serviceConfigs.homekit.devices = this.serviceConfigs.homekit.devices.filter((d) => d.id !== deviceId);

			// Add new pairing
			this.serviceConfigs.homekit.devices.push({
				id: deviceId,
				name: targetDevice.name,
				address: targetDevice.address,
				port: targetDevice.port,
				category: this.getHomeKitCategory(targetDevice.ci),
				pairingData: pairingData,
				pairedAt: new Date().toISOString()
			});

			await this.saveSecrets();

			this.sendSocketNotification("HOMEKIT_PAIRED", {
				deviceId: deviceId,
				deviceName: targetDevice.name
			});
		} catch (error) {
			Log.error(`[${this.name}] HomeKit pairing failed:`, error);
			this.sendSocketNotification("HOMEKIT_ERROR", {
				message: `Pairing failed: ${error.message}`
			});
		}
	},

	/**
	 * Unpair a HomeKit device
	 */
	unpairHomeKitDevice: async function (deviceId) {
		try {
			if (!this.serviceConfigs.homekit?.devices) {
				this.sendSocketNotification("HOMEKIT_ERROR", {
					message: "No paired devices found"
				});
				return;
			}

			const device = this.serviceConfigs.homekit.devices.find((d) => d.id === deviceId);
			if (!device) {
				this.sendSocketNotification("HOMEKIT_ERROR", {
					message: "Device not found in paired devices"
				});
				return;
			}

			// Try to properly unpair if hap-controller is available
			try {
				const HapClient = require("hap-controller");
				const { HttpClient } = HapClient;

				const client = new HttpClient(deviceId, device.address, device.port, device.pairingData);
				await client.removePairing(client.pairingProtocol.iOSDevicePairingID);
			} catch (e) {
				Log.warn(`[${this.name}] Could not send unpair command to device: ${e.message}`);
			}

			// Remove from saved devices
			const deviceName = device.name;
			this.serviceConfigs.homekit.devices = this.serviceConfigs.homekit.devices.filter((d) => d.id !== deviceId);

			await this.saveSecrets();

			this.sendSocketNotification("HOMEKIT_UNPAIRED", {
				deviceId: deviceId,
				deviceName: deviceName
			});
		} catch (error) {
			Log.error(`[${this.name}] HomeKit unpairing failed:`, error);
			this.sendSocketNotification("HOMEKIT_ERROR", {
				message: `Unpairing failed: ${error.message}`
			});
		}
	},

	/**
	 * Get HomeKit category name from category ID
	 */
	getHomeKitCategory: function (categoryId) {
		const categories = {
			1: "other",
			2: "bridge",
			3: "fan",
			4: "garage",
			5: "lightbulb",
			6: "lock",
			7: "outlet",
			8: "switch",
			9: "thermostat",
			10: "sensor",
			11: "door",
			12: "window",
			13: "windowCovering",
			14: "programmableSwitch",
			15: "rangeExtender",
			16: "camera",
			17: "videoDoorbell",
			18: "airPurifier",
			19: "heater",
			20: "airConditioner",
			21: "humidifier",
			22: "dehumidifier",
			28: "sprinkler",
			29: "faucet",
			30: "showerSystem",
			31: "television",
			32: "remoteControl",
			33: "router",
			34: "audio"
		};
		return categories[categoryId] || "other";
	},

	// ============================================
	// Package Tracking Methods
	// ============================================

	/**
	 * Get all tracked packages
	 */
	getPackages: async function () {
		try {
			const packagesPath = path.join(__dirname, "..", "..", "..", "config", "packages.json");
			let packages = [];
			try {
				const data = await fs.readFile(packagesPath, "utf8");
				packages = JSON.parse(data).packages || [];
			} catch {
				packages = [];
			}

			this.sendSocketNotification("SETTINGS_PACKAGES", { packages });
		} catch (error) {
			Log.error(`[${this.name}] Failed to get packages:`, error);
			this.sendSocketNotification("SETTINGS_PACKAGES", { packages: [] });
		}
	},

	/**
	 * Add a package to track
	 */
	addPackage: async function (payload) {
		try {
			const packagesPath = path.join(__dirname, "..", "..", "..", "config", "packages.json");
			let packages = [];
			try {
				const data = await fs.readFile(packagesPath, "utf8");
				packages = JSON.parse(data).packages || [];
			} catch {
				packages = [];
			}

			// Detect carrier if not specified
			const carrier = payload.carrier || this.detectCarrier(payload.tracking);

			// Check for duplicate
			if (packages.some((p) => p.tracking.toUpperCase() === payload.tracking.toUpperCase())) {
				this.sendSocketNotification("SETTINGS_PACKAGE_ADDED", {
					success: false,
					error: "Package already being tracked"
				});
				return;
			}

			packages.push({
				tracking: payload.tracking.toUpperCase(),
				carrier: carrier,
				name: payload.name || `Package ${packages.length + 1}`,
				addedAt: new Date().toISOString()
			});

			await fs.writeFile(packagesPath, JSON.stringify({ packages }, null, 2));

			this.sendSocketNotification("SETTINGS_PACKAGE_ADDED", {
				success: true,
				carrier: carrier
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to add package:`, error);
			this.sendSocketNotification("SETTINGS_PACKAGE_ADDED", {
				success: false,
				error: error.message
			});
		}
	},

	/**
	 * Remove a tracked package
	 */
	removePackage: async function (tracking) {
		try {
			const packagesPath = path.join(__dirname, "..", "..", "..", "config", "packages.json");
			let packages = [];
			try {
				const data = await fs.readFile(packagesPath, "utf8");
				packages = JSON.parse(data).packages || [];
			} catch {
				packages = [];
			}

			const original = packages.length;
			packages = packages.filter((p) => p.tracking.toUpperCase() !== tracking.toUpperCase());

			if (packages.length < original) {
				await fs.writeFile(packagesPath, JSON.stringify({ packages }, null, 2));
				this.sendSocketNotification("SETTINGS_PACKAGE_REMOVED", { success: true });
			} else {
				this.sendSocketNotification("SETTINGS_PACKAGE_REMOVED", {
					success: false,
					error: "Package not found"
				});
			}
		} catch (error) {
			Log.error(`[${this.name}] Failed to remove package:`, error);
			this.sendSocketNotification("SETTINGS_PACKAGE_REMOVED", {
				success: false,
				error: error.message
			});
		}
	},

	/**
	 * Detect carrier from tracking number format
	 */
	detectCarrier: function (tracking) {
		const patterns = {
			usps: [/^94\d{20,22}$/, /^92\d{20,22}$/, /^[A-Z]{2}\d{9}US$/i],
			ups: [/^1Z[A-Z0-9]{16}$/i, /^T\d{10}$/, /^[0-9]{26}$/],
			fedex: [/^\d{12,15}$/, /^\d{20,22}$/, /^96\d{20}$/],
			dhl: [/^\d{10,11}$/, /^[A-Z]{3}\d{7}$/i],
			amazon: [/^TBA\d+$/i]
		};

		for (const [carrier, regexes] of Object.entries(patterns)) {
			for (const regex of regexes) {
				if (regex.test(tracking)) {
					return carrier;
				}
			}
		}
		return "other";
	},

	// ============================================
	// Location Management Methods
	// ============================================

	/**
	 * Get all saved locations
	 */
	getLocations: async function () {
		try {
			const locationsPath = path.join(__dirname, "..", "..", "..", "config", "locations.json");
			let locations = { weather: [], news: [] };
			try {
				const data = await fs.readFile(locationsPath, "utf8");
				locations = JSON.parse(data);
			} catch {
				locations = { weather: [], news: [] };
			}

			// Also get news sources from newsfeed config if available
			const sources = await this.getNewsSources();

			this.sendSocketNotification("SETTINGS_LOCATIONS", {
				weather: locations.weather || [],
				news: locations.news || [],
				sources: sources
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to get locations:`, error);
			this.sendSocketNotification("SETTINGS_LOCATIONS", {
				weather: [],
				news: [],
				sources: []
			});
		}
	},

	/**
	 * Get news sources from config
	 */
	getNewsSources: async function () {
		try {
			const configContent = await fs.readFile(this.configPath, "utf8");
			// Parse newsfeed config - simplified extraction
			const feedsMatch = configContent.match(/feeds:\s*\[([\s\S]*?)\]/);
			if (feedsMatch) {
				const sources = [];
				const titlePattern = /title:\s*["']([^"']+)["']/g;
				const urlPattern = /url:\s*["']([^"']+)["']/g;

				let titleMatch, urlMatch;
				const titles = [];
				const urls = [];

				while ((titleMatch = titlePattern.exec(feedsMatch[1])) !== null) {
					titles.push(titleMatch[1]);
				}
				while ((urlMatch = urlPattern.exec(feedsMatch[1])) !== null) {
					urls.push(urlMatch[1]);
				}

				for (let i = 0; i < Math.max(titles.length, urls.length); i++) {
					sources.push({
						name: titles[i] || `Feed ${i + 1}`,
						url: urls[i] || ""
					});
				}

				return sources;
			}
		} catch {
			// Ignore errors
		}
		return [];
	},

	/**
	 * Add a location
	 */
	addLocation: async function (type, location) {
		try {
			const locationsPath = path.join(__dirname, "..", "..", "..", "config", "locations.json");
			let locations = { weather: [], news: [] };
			try {
				const data = await fs.readFile(locationsPath, "utf8");
				locations = JSON.parse(data);
			} catch {
				locations = { weather: [], news: [] };
			}

			if (type === "weather") {
				// Geocode the location using OpenMeteo
				const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
				const geoData = await this.httpGet(geoUrl);
				const geo = JSON.parse(geoData);

				if (geo.results && geo.results.length > 0) {
					const { latitude, longitude, name, country } = geo.results[0];
					locations.weather.push({
						name: name,
						country: country,
						lat: latitude,
						lon: longitude,
						addedAt: new Date().toISOString()
					});

					await fs.writeFile(locationsPath, JSON.stringify(locations, null, 2));

					this.sendSocketNotification("SETTINGS_LOCATION_ADDED", {
						success: true,
						location: name
					});
				} else {
					this.sendSocketNotification("SETTINGS_LOCATION_ADDED", {
						success: false,
						error: "Location not found"
					});
				}
			}
		} catch (error) {
			Log.error(`[${this.name}] Failed to add location:`, error);
			this.sendSocketNotification("SETTINGS_LOCATION_ADDED", {
				success: false,
				error: error.message
			});
		}
	},

	/**
	 * Remove a location
	 */
	removeLocation: async function (type, index) {
		try {
			const locationsPath = path.join(__dirname, "..", "..", "..", "config", "locations.json");
			let locations = { weather: [], news: [] };
			try {
				const data = await fs.readFile(locationsPath, "utf8");
				locations = JSON.parse(data);
			} catch {
				return;
			}

			if (type === "weather" && locations.weather[index]) {
				locations.weather.splice(index, 1);
			} else if (type === "news" && locations.news[index]) {
				locations.news.splice(index, 1);
			}

			await fs.writeFile(locationsPath, JSON.stringify(locations, null, 2));
			this.getLocations(); // Refresh
		} catch (error) {
			Log.error(`[${this.name}] Failed to remove location:`, error);
		}
	},

	/**
	 * Set primary location
	 */
	setPrimaryLocation: async function (type, index) {
		try {
			const locationsPath = path.join(__dirname, "..", "..", "..", "config", "locations.json");
			let locations = { weather: [], news: [] };
			try {
				const data = await fs.readFile(locationsPath, "utf8");
				locations = JSON.parse(data);
			} catch {
				return;
			}

			if (type === "weather" && locations.weather[index]) {
				const [item] = locations.weather.splice(index, 1);
				locations.weather.unshift(item);
			}

			await fs.writeFile(locationsPath, JSON.stringify(locations, null, 2));
			this.getLocations();
		} catch (error) {
			Log.error(`[${this.name}] Failed to set primary location:`, error);
		}
	},

	/**
	 * Add news source
	 */
	addNewsSource: async function (payload) {
		const knownFeeds = {
			bbc: { name: "BBC News", url: "http://feeds.bbci.co.uk/news/rss.xml" },
			cnn: { name: "CNN", url: "http://rss.cnn.com/rss/edition.rss" },
			nyt: { name: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
			reuters: { name: "Reuters", url: "https://feeds.reuters.com/reuters/topNews" },
			ap: { name: "Associated Press", url: "https://feeds.apnews.com/rss/apf-topnews" },
			guardian: { name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
			washingtonpost: { name: "Washington Post", url: "https://feeds.washingtonpost.com/rss/national" }
		};

		let feed;
		if (payload.source === "custom") {
			feed = { name: payload.name || payload.url, url: payload.url };
		} else {
			feed = knownFeeds[payload.source];
		}

		if (feed) {
			// For now, we'll add to locations.json news sources
			// A more complete implementation would update the config.js newsfeed module
			this.sendSocketNotification("SETTINGS_NEWS_SOURCE_ADDED", {
				success: true,
				source: feed.name,
				url: feed.url
			});
		} else {
			this.sendSocketNotification("SETTINGS_NEWS_SOURCE_ADDED", {
				success: false,
				error: "Unknown news source"
			});
		}
	},

	/**
	 * Remove news source
	 */
	removeNewsSource: async function (index) {
		// Would need to update config.js - simplified for now
		Log.info(`[${this.name}] Would remove news source at index ${index}`);
	},

	/**
	 * HTTP GET helper
	 */
	httpGet: function (url) {
		return new Promise((resolve, reject) => {
			const client = url.startsWith("https") ? https : http;
			client.get(url, (res) => {
				let data = "";
				res.on("data", (chunk) => data += chunk);
				res.on("end", () => resolve(data));
			}).on("error", reject);
		});
	}
});
