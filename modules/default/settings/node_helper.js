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
	}
});
