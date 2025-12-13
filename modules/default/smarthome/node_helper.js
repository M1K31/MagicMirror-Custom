/**
 * Smart Home Node Helper
 *
 * Handles server-side API integration for smart home platforms:
 * - Home Assistant REST API + WebSocket
 * - HomeKit (via HomeBridge API)
 * - Google Home (via Google Smart Home API)
 * - SmartThings API
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const path = require("path");
const { createDefaultStorage } = require("../../shared/secure-storage");
const { RateLimiter } = require("../../shared/rate-limiter");

// Initialize secure storage for tokens
const secureStorage = createDefaultStorage();

// Rate limiters per provider
const rateLimiters = {
	homeassistant: new RateLimiter(30, 60 * 1000, { name: "HomeAssistant" }),
	smartthings: new RateLimiter(250, 60 * 1000, { name: "SmartThings" }),
	homekit: new RateLimiter(30, 60 * 1000, { name: "HomeKit" }),
	google: new RateLimiter(30, 60 * 1000, { name: "GoogleHome" })
};

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.providers = {};
		this.websockets = {};
	},

	/**
	 * Load saved tokens from encrypted storage
	 * @param {string} provider - Provider name
	 * @returns {object} Saved tokens
	 */
	loadTokens: function (provider) {
		const configPath = path.join(__dirname, `.${provider}_tokens.encrypted`);
		try {
			return secureStorage.loadSecure(configPath) || {};
		} catch (error) {
			Log.warn(`[${this.name}] Could not load tokens for ${provider}: ${error.message}`);
			return {};
		}
	},

	/**
	 * Save tokens to encrypted storage
	 * @param {string} provider - Provider name
	 * @param {object} tokens - Tokens to save
	 */
	saveTokens: function (provider, tokens) {
		const configPath = path.join(__dirname, `.${provider}_tokens.encrypted`);
		try {
			secureStorage.saveSecure(configPath, tokens);
			Log.info(`[${this.name}] Saved encrypted tokens for ${provider}`);
		} catch (error) {
			Log.warn(`[${this.name}] Could not save tokens for ${provider}: ${error.message}`);
		}
	},

	/**
	 * Handle socket notifications from frontend
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "SMARTHOME_INIT":
				this.initProvider(payload);
				break;
			case "SMARTHOME_GET_DEVICES":
				this.getDevices(payload);
				break;
			case "SMARTHOME_TOGGLE":
				this.toggleDevice(payload);
				break;
			case "SMARTHOME_SET_BRIGHTNESS":
				this.setBrightness(payload);
				break;
			case "SMARTHOME_SET_TEMPERATURE":
				this.setTemperature(payload);
				break;
			case "SMARTHOME_ACTIVATE_SCENE":
				this.activateScene(payload);
				break;
		}
	},

	/**
	 * Initialize provider connection
	 * @param {object} payload - Init payload
	 */
	initProvider: async function (payload) {
		const { provider, config } = payload;

		try {
			switch (provider) {
				case "homeassistant":
					await this.initHomeAssistant(config);
					break;
				case "homekit":
					await this.initHomeKit(config);
					break;
				case "googlehome":
					await this.initGoogleHome(config);
					break;
				case "smartthings":
					await this.initSmartThings(config);
					break;
				default:
					throw new Error(`Unknown provider: ${provider}`);
			}

			this.sendSocketNotification("SMARTHOME_CONNECTED", { provider });
			this.getDevices(payload);
		} catch (error) {
			Log.error(`[${this.name}] Failed to init ${provider}:`, error.message);
			this.sendSocketNotification("SMARTHOME_ERROR", {
				error: `Failed to connect to ${provider}: ${error.message}`
			});
		}
	},

	// ==========================================
	// HOME ASSISTANT
	// ==========================================

	/**
	 * Initialize Home Assistant connection
	 * @param {object} config - Home Assistant config
	 */
	initHomeAssistant: async function (config) {
		this.providers.homeassistant = {
			host: config.host,
			token: config.token,
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json"
			}
		};

		// Test connection
		const response = await fetch(`${config.host}/api/`, {
			headers: this.providers.homeassistant.headers
		});

		if (!response.ok) {
			throw new Error(`Home Assistant returned ${response.status}`);
		}

		const data = await response.json();
		Log.info(`[${this.name}] Connected to Home Assistant: ${data.message}`);

		// Setup WebSocket for real-time updates (optional)
		this.setupHomeAssistantWebSocket(config);
	},

	/**
	 * Setup Home Assistant WebSocket for real-time updates
	 * @param {object} config - Home Assistant config
	 */
	setupHomeAssistantWebSocket: function (config) {
		try {
			const WebSocket = require("ws");
			const wsUrl = config.host.replace("http", "ws") + "/api/websocket";

			const ws = new WebSocket(wsUrl);

			ws.on("open", () => {
				Log.info(`[${this.name}] Home Assistant WebSocket connected`);
			});

			ws.on("message", (data) => {
				const message = JSON.parse(data);

				if (message.type === "auth_required") {
					ws.send(
						JSON.stringify({
							type: "auth",
							access_token: config.token
						})
					);
				} else if (message.type === "auth_ok") {
					// Subscribe to state changes
					ws.send(
						JSON.stringify({
							id: 1,
							type: "subscribe_events",
							event_type: "state_changed"
						})
					);
				} else if (message.type === "event" && message.event.event_type === "state_changed") {
					const newState = message.event.data.new_state;
					if (newState) {
						this.sendSocketNotification("SMARTHOME_DEVICE_UPDATE", {
							id: newState.entity_id,
							state: newState.state,
							attributes: newState.attributes,
							last_changed: newState.last_changed
						});
					}
				}
			});

			ws.on("error", (error) => {
				Log.error(`[${this.name}] Home Assistant WebSocket error:`, error.message);
			});

			ws.on("close", () => {
				Log.warn(`[${this.name}] Home Assistant WebSocket closed, reconnecting...`);
				setTimeout(() => this.setupHomeAssistantWebSocket(config), 5000);
			});

			this.websockets.homeassistant = ws;
		} catch (error) {
			Log.warn(`[${this.name}] WebSocket not available, using polling only`);
		}
	},

	/**
	 * Get devices from Home Assistant (rate-limited)
	 * @param {object} payload - Request payload
	 */
	getHomeAssistantDevices: async function (payload) {
		const provider = this.providers.homeassistant;
		if (!provider) return [];

		// Wrap API call with rate limiting
		const limiter = rateLimiters.homeassistant;
		const states = await limiter.throttle(async () => {
			const response = await fetch(`${provider.host}/api/states`, {
				headers: provider.headers
			});

			if (!response.ok) {
				throw new Error(`Failed to get states: ${response.status}`);
			}

			return response.json();
		});

		// Filter to requested devices or return all
		if (payload.devices && payload.devices.length > 0) {
			const entityIds = payload.devices.map((d) => d.entity_id || d.id);
			return states.filter((s) => entityIds.includes(s.entity_id));
		}

		// Return common device types by default
		const deviceTypes = ["light", "switch", "sensor", "binary_sensor", "climate", "lock", "cover", "fan", "media_player"];
		return states.filter((s) => {
			const domain = s.entity_id.split(".")[0];
			return deviceTypes.includes(domain);
		});
	},

	/**
	 * Call Home Assistant service (rate-limited)
	 * @param {string} domain - Service domain
	 * @param {string} service - Service name
	 * @param {object} data - Service data
	 */
	callHomeAssistantService: async function (domain, service, data) {
		const provider = this.providers.homeassistant;
		if (!provider) return;

		// Wrap API call with rate limiting
		const limiter = rateLimiters.homeassistant;
		return limiter.throttle(async () => {
			const response = await fetch(`${provider.host}/api/services/${domain}/${service}`, {
				method: "POST",
				headers: provider.headers,
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error(`Service call failed: ${response.status}`);
			}

			return response.json();
		});
	},

	// ==========================================
	// HOMEKIT (via HomeBridge)
	// ==========================================

	/**
	 * Initialize HomeKit/HomeBridge connection
	 * @param {object} config - HomeKit config
	 */
	initHomeKit: async function (config) {
		this.providers.homekit = {
			host: config.host,
			headers: {
				"Content-Type": "application/json"
			}
		};

		// HomeBridge UI X API authentication
		if (config.username && config.password) {
			const authResponse = await fetch(`${config.host}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: config.username,
					password: config.password
				})
			});

			if (!authResponse.ok) {
				throw new Error("HomeBridge authentication failed");
			}

			const authData = await authResponse.json();
			this.providers.homekit.token = authData.access_token;
			this.providers.homekit.headers.Authorization = `Bearer ${authData.access_token}`;
		}

		Log.info(`[${this.name}] Connected to HomeBridge`);
	},

	/**
	 * Get devices from HomeBridge
	 * @param {object} payload - Request payload
	 */
	getHomeKitDevices: async function (payload) {
		const provider = this.providers.homekit;
		if (!provider) return [];

		const response = await fetch(`${provider.host}/api/accessories`, {
			headers: provider.headers
		});

		if (!response.ok) {
			throw new Error(`Failed to get accessories: ${response.status}`);
		}

		const accessories = await response.json();

		return accessories.map((acc) => ({
			id: acc.uniqueId,
			name: acc.serviceName || acc.accessoryInformation?.Name || "Unknown",
			type: this.mapHomeKitType(acc.type),
			state: acc.values?.On ? "on" : "off",
			attributes: {
				brightness: acc.values?.Brightness,
				temperature: acc.values?.CurrentTemperature
			},
			room: acc.roomName
		}));
	},

	/**
	 * Map HomeKit accessory type to common type
	 * @param {string} type - HomeKit type
	 * @returns {string} Common type
	 */
	mapHomeKitType: function (type) {
		const typeMap = {
			Lightbulb: "light",
			Switch: "switch",
			Outlet: "outlet",
			Fan: "fan",
			Thermostat: "thermostat",
			TemperatureSensor: "sensor",
			HumiditySensor: "humidity",
			MotionSensor: "motion",
			ContactSensor: "door",
			LockMechanism: "lock",
			GarageDoorOpener: "garage",
			WindowCovering: "blind"
		};
		return typeMap[type] || "unknown";
	},

	/**
	 * Control HomeKit device
	 * @param {string} uniqueId - Device unique ID
	 * @param {object} values - Values to set
	 */
	controlHomeKitDevice: async function (uniqueId, values) {
		const provider = this.providers.homekit;
		if (!provider) return;

		const response = await fetch(`${provider.host}/api/accessories/${uniqueId}`, {
			method: "PUT",
			headers: provider.headers,
			body: JSON.stringify({
				characteristicType: Object.keys(values)[0],
				value: Object.values(values)[0]
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to control device: ${response.status}`);
		}
	},

	// ==========================================
	// GOOGLE HOME
	// ==========================================

	/**
	 * Initialize Google Home connection
	 * @param {object} config - Google Home config
	 */
	initGoogleHome: async function (config) {
		// Google Smart Home API requires OAuth2
		this.providers.googlehome = {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			refreshToken: config.refreshToken
		};

		// Get access token
		await this.refreshGoogleToken();
		Log.info(`[${this.name}] Connected to Google Home`);
	},

	/**
	 * Refresh Google OAuth token
	 */
	refreshGoogleToken: async function () {
		const provider = this.providers.googlehome;
		if (!provider) return;

		const response = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: provider.clientId,
				client_secret: provider.clientSecret,
				refresh_token: provider.refreshToken,
				grant_type: "refresh_token"
			})
		});

		if (!response.ok) {
			throw new Error("Failed to refresh Google token");
		}

		const data = await response.json();
		provider.accessToken = data.access_token;
		provider.tokenExpiry = Date.now() + data.expires_in * 1000;
	},

	/**
	 * Get devices from Google Home
	 * @param {object} payload - Request payload
	 */
	getGoogleHomeDevices: async function (payload) {
		const provider = this.providers.googlehome;
		if (!provider) return [];

		// Check token expiry
		if (provider.tokenExpiry && Date.now() > provider.tokenExpiry - 60000) {
			await this.refreshGoogleToken();
		}

		// Use Home Graph API to get device states
		const response = await fetch("https://homegraph.googleapis.com/v1/devices:query", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${provider.accessToken}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				requestId: Date.now().toString(),
				inputs: [{ intent: "action.devices.QUERY" }]
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to query devices: ${response.status}`);
		}

		const data = await response.json();
		const devices = [];

		if (data.payload && data.payload.devices) {
			for (const [id, device] of Object.entries(data.payload.devices)) {
				devices.push({
					id: id,
					name: device.name || id,
					type: this.mapGoogleType(device.type),
					state: device.on ? "on" : "off",
					attributes: {
						brightness: device.brightness,
						temperature: device.thermostatTemperatureSetpoint
					}
				});
			}
		}

		return devices;
	},

	/**
	 * Map Google device type to common type
	 * @param {string} type - Google device type
	 * @returns {string} Common type
	 */
	mapGoogleType: function (type) {
		const typeMap = {
			"action.devices.types.LIGHT": "light",
			"action.devices.types.SWITCH": "switch",
			"action.devices.types.OUTLET": "outlet",
			"action.devices.types.FAN": "fan",
			"action.devices.types.THERMOSTAT": "thermostat",
			"action.devices.types.LOCK": "lock",
			"action.devices.types.SENSOR": "sensor",
			"action.devices.types.CAMERA": "camera",
			"action.devices.types.SPEAKER": "speaker"
		};
		return typeMap[type] || "unknown";
	},

	// ==========================================
	// SMARTTHINGS
	// ==========================================

	/**
	 * Initialize SmartThings connection
	 * @param {object} config - SmartThings config
	 */
	initSmartThings: async function (config) {
		this.providers.smartthings = {
			token: config.token,
			locationId: config.locationId,
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json"
			}
		};

		// Test connection
		const response = await fetch("https://api.smartthings.com/v1/locations", {
			headers: this.providers.smartthings.headers
		});

		if (!response.ok) {
			throw new Error(`SmartThings returned ${response.status}`);
		}

		Log.info(`[${this.name}] Connected to SmartThings`);
	},

	/**
	 * Get devices from SmartThings (rate-limited)
	 * @param {object} payload - Request payload
	 */
	getSmartThingsDevices: async function (payload) {
		const provider = this.providers.smartthings;
		if (!provider) return [];

		const limiter = rateLimiters.smartthings;

		// Get all devices with rate limiting
		let url = "https://api.smartthings.com/v1/devices";
		if (provider.locationId) {
			url += `?locationId=${provider.locationId}`;
		}

		const data = await limiter.throttle(async () => {
			const response = await fetch(url, {
				headers: provider.headers
			});

			if (!response.ok) {
				throw new Error(`Failed to get devices: ${response.status}`);
			}

			return response.json();
		});

		const devices = [];

		for (const device of data.items || []) {
			// Get device status with rate limiting
			const status = await limiter.throttle(async () => {
				const statusResponse = await fetch(`https://api.smartthings.com/v1/devices/${device.deviceId}/status`, {
					headers: provider.headers
				});

				if (statusResponse.ok) {
					const statusData = await statusResponse.json();
					return this.flattenSmartThingsStatus(statusData);
				}
				return {};
			});

			devices.push({
				id: device.deviceId,
				name: device.label || device.name,
				type: this.mapSmartThingsType(device),
				state: status.switch === "on" ? "on" : "off",
				attributes: status,
				room: device.roomId,
				capabilities: device.components?.[0]?.capabilities?.map((c) => c.id) || []
			});
		}

		return devices;
	},

	/**
	 * Flatten SmartThings status object
	 * @param {object} statusData - Raw status data
	 * @returns {object} Flattened status
	 */
	flattenSmartThingsStatus: function (statusData) {
		const status = {};

		if (statusData.components?.main) {
			for (const [capability, values] of Object.entries(statusData.components.main)) {
				for (const [attr, data] of Object.entries(values)) {
					status[attr] = data.value;
				}
			}
		}

		return status;
	},

	/**
	 * Map SmartThings device type
	 * @param {object} device - SmartThings device
	 * @returns {string} Common type
	 */
	mapSmartThingsType: function (device) {
		const capabilities = device.components?.[0]?.capabilities?.map((c) => c.id) || [];

		if (capabilities.includes("colorControl") || capabilities.includes("switchLevel")) return "light";
		if (capabilities.includes("switch")) return "switch";
		if (capabilities.includes("temperatureMeasurement")) return "sensor";
		if (capabilities.includes("thermostatMode")) return "thermostat";
		if (capabilities.includes("lock")) return "lock";
		if (capabilities.includes("contactSensor")) return "door";
		if (capabilities.includes("motionSensor")) return "motion";

		return "unknown";
	},

	/**
	 * Control SmartThings device (rate-limited)
	 * @param {string} deviceId - Device ID
	 * @param {string} capability - Capability to control
	 * @param {string} command - Command to execute
	 * @param {array} args - Command arguments
	 */
	controlSmartThingsDevice: async function (deviceId, capability, command, args = []) {
		const provider = this.providers.smartthings;
		if (!provider) return;

		// Wrap API call with rate limiting
		const limiter = rateLimiters.smartthings;
		return limiter.throttle(async () => {
			const response = await fetch(`https://api.smartthings.com/v1/devices/${deviceId}/commands`, {
				method: "POST",
				headers: provider.headers,
				body: JSON.stringify({
					commands: [
						{
							component: "main",
							capability: capability,
							command: command,
							arguments: args
						}
					]
				})
			});

			if (!response.ok) {
				throw new Error(`Command failed: ${response.status}`);
			}
		});
	},

	// ==========================================
	// COMMON METHODS
	// ==========================================

	/**
	 * Get devices from configured provider
	 * @param {object} payload - Request payload
	 */
	getDevices: async function (payload) {
		try {
			let devices = [];

			switch (payload.provider) {
				case "homeassistant":
					devices = await this.getHomeAssistantDevices(payload);
					break;
				case "homekit":
					devices = await this.getHomeKitDevices(payload);
					break;
				case "googlehome":
					devices = await this.getGoogleHomeDevices(payload);
					break;
				case "smartthings":
					devices = await this.getSmartThingsDevices(payload);
					break;
			}

			this.sendSocketNotification("SMARTHOME_DEVICES", { devices });
		} catch (error) {
			Log.error(`[${this.name}] Failed to get devices:`, error.message);
			this.sendSocketNotification("SMARTHOME_ERROR", {
				error: `Failed to get devices: ${error.message}`
			});
		}
	},

	/**
	 * Toggle device on/off
	 * @param {object} payload - Toggle payload
	 */
	toggleDevice: async function (payload) {
		try {
			const newState = !payload.currentState;

			switch (payload.provider) {
				case "homeassistant":
					const domain = payload.deviceId.split(".")[0];
					await this.callHomeAssistantService(domain, newState ? "turn_on" : "turn_off", {
						entity_id: payload.deviceId
					});
					break;

				case "homekit":
					await this.controlHomeKitDevice(payload.deviceId, { On: newState });
					break;

				case "smartthings":
					await this.controlSmartThingsDevice(payload.deviceId, "switch", newState ? "on" : "off");
					break;
			}

			// Send update notification
			this.sendSocketNotification("SMARTHOME_DEVICE_UPDATE", {
				id: payload.deviceId,
				state: newState ? "on" : "off"
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to toggle device:`, error.message);
			this.sendSocketNotification("SMARTHOME_ERROR", {
				error: `Failed to toggle device: ${error.message}`
			});
		}
	},

	/**
	 * Set device brightness
	 * @param {object} payload - Brightness payload
	 */
	setBrightness: async function (payload) {
		try {
			switch (payload.provider) {
				case "homeassistant":
					await this.callHomeAssistantService("light", "turn_on", {
						entity_id: payload.deviceId,
						brightness: payload.brightness
					});
					break;

				case "homekit":
					await this.controlHomeKitDevice(payload.deviceId, {
						Brightness: Math.round((payload.brightness / 255) * 100)
					});
					break;

				case "smartthings":
					await this.controlSmartThingsDevice(payload.deviceId, "switchLevel", "setLevel", [Math.round((payload.brightness / 255) * 100)]);
					break;
			}

			this.sendSocketNotification("SMARTHOME_DEVICE_UPDATE", {
				id: payload.deviceId,
				attributes: { brightness: payload.brightness }
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to set brightness:`, error.message);
		}
	},

	/**
	 * Set thermostat temperature
	 * @param {object} payload - Temperature payload
	 */
	setTemperature: async function (payload) {
		try {
			switch (payload.provider) {
				case "homeassistant":
					await this.callHomeAssistantService("climate", "set_temperature", {
						entity_id: payload.deviceId,
						temperature: payload.temperature
					});
					break;

				case "smartthings":
					await this.controlSmartThingsDevice(payload.deviceId, "thermostatHeatingSetpoint", "setHeatingSetpoint", [payload.temperature]);
					break;
			}

			this.sendSocketNotification("SMARTHOME_DEVICE_UPDATE", {
				id: payload.deviceId,
				attributes: { temperature: payload.temperature }
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to set temperature:`, error.message);
		}
	},

	/**
	 * Activate a scene
	 * @param {object} payload - Scene payload
	 */
	activateScene: async function (payload) {
		try {
			switch (payload.provider) {
				case "homeassistant":
					await this.callHomeAssistantService("scene", "turn_on", {
						entity_id: payload.sceneId
					});
					break;

				case "smartthings":
					await fetch(`https://api.smartthings.com/v1/scenes/${payload.sceneId}/execute`, {
						method: "POST",
						headers: this.providers.smartthings.headers
					});
					break;
			}

			Log.info(`[${this.name}] Activated scene: ${payload.sceneId}`);
		} catch (error) {
			Log.error(`[${this.name}] Failed to activate scene:`, error.message);
		}
	},

	/**
	 * Cleanup on stop
	 */
	stop: function () {
		// Close WebSocket connections
		for (const ws of Object.values(this.websockets)) {
			if (ws && ws.close) {
				ws.close();
			}
		}
	}
});
