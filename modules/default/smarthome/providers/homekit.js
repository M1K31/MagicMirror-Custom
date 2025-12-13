/**
 * HomeKit Provider for Smart Home Module
 *
 * Connects to Apple HomeKit via Homebridge or HAP-NodeJS
 * Provides device status and control for HomeKit accessories
 *
 * Setup Options:
 * 1. Use Homebridge with homebridge-config-ui-x (recommended)
 * 2. Direct HAP-NodeJS connection
 * 3. Use shortcuts/automations for control
 */

const SmartHomeProvider = require("./smarthomeprovider");

SmartHomeProvider.register("homekit", {
	providerName: "HomeKit",

	defaults: {
		// Homebridge UI settings
		homebridgeHost: "http://localhost:8581",
		homebridgeUser: "admin",
		homebridgePassword: "",
		// Direct accessory connections
		accessories: [],
		// Pin for pairing
		pin: ""
	},

	/**
	 * Internal state
	 */
	token: null,
	tokenExpiry: 0,
	cachedDevices: [],

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.homebridgeHost) {
			this.setError("Homebridge host URL is required");
			return false;
		}
		return true;
	},

	/**
	 * Authenticate with Homebridge UI
	 * @returns {Promise<boolean>}
	 */
	async authenticate() {
		// Check if token is still valid
		if (this.token && Date.now() < this.tokenExpiry - 60000) {
			return true;
		}

		try {
			const response = await fetch(`${this.config.homebridgeHost}/api/auth/login`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					username: this.config.homebridgeUser,
					password: this.config.homebridgePassword
				})
			});

			if (!response.ok) {
				throw new Error("Homebridge authentication failed");
			}

			const data = await response.json();
			this.token = data.access_token;
			this.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

			return true;
		} catch (error) {
			this.setError(`HomeKit auth error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, options = {}) {
		await this.authenticate();

		const url = `${this.config.homebridgeHost}${endpoint}`;

		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
				...options.headers
			}
		});

		if (!response.ok) {
			throw new Error(`Homebridge API error: ${response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Fetch all devices
	 * @returns {Promise<Array>}
	 */
	async fetchDevices() {
		if (!this.validateConfig()) return [];

		try {
			await this.authenticate();

			const data = await this.apiRequest("/api/accessories");
			const devices = [];

			for (const accessory of data || []) {
				const device = this.accessoryToDevice(accessory);
				if (device) {
					devices.push(device);
				}
			}

			this.cachedDevices = devices;
			return devices;
		} catch (error) {
			this.setError(`HomeKit fetch error: ${error.message}`);
			return this.cachedDevices;
		}
	},

	/**
	 * Convert Homebridge accessory to device
	 * @param {object} accessory - Homebridge accessory
	 * @returns {object}
	 */
	accessoryToDevice(accessory) {
		const serviceType = this.getMainServiceType(accessory);
		if (!serviceType) return null;

		const device = {
			id: accessory.uniqueId,
			name: accessory.serviceName || accessory.accessoryInformation?.Name || "Unknown",
			type: this.mapServiceType(serviceType),
			room: accessory.room || null,
			state: "off",
			brightness: null,
			color: null,
			temperature: null,
			humidity: null,
			battery: null,
			lastChanged: null,
			attributes: {
				manufacturer: accessory.accessoryInformation?.Manufacturer,
				model: accessory.accessoryInformation?.Model,
				serviceType: serviceType
			}
		};

		// Extract characteristic values
		const chars = accessory.values || {};

		// Power state
		if (chars.On !== undefined) {
			device.state = chars.On ? "on" : "off";
		}

		// Brightness
		if (chars.Brightness !== undefined) {
			device.brightness = chars.Brightness;
		}

		// Color
		if (chars.Hue !== undefined && chars.Saturation !== undefined) {
			device.color = { h: chars.Hue, s: chars.Saturation };
		}

		// Temperature (thermostat)
		if (chars.CurrentTemperature !== undefined) {
			device.temperature = chars.CurrentTemperature;
		}
		if (chars.TargetTemperature !== undefined) {
			device.targetTemperature = chars.TargetTemperature;
		}

		// Humidity
		if (chars.CurrentRelativeHumidity !== undefined) {
			device.humidity = chars.CurrentRelativeHumidity;
		}

		// Battery
		if (chars.BatteryLevel !== undefined) {
			device.battery = chars.BatteryLevel;
		}

		// Lock state
		if (chars.LockCurrentState !== undefined) {
			device.state = chars.LockCurrentState === 1 ? "locked" : "unlocked";
		}

		return device;
	},

	/**
	 * Get main service type from accessory
	 * @param {object} accessory - Homebridge accessory
	 * @returns {string|null}
	 */
	getMainServiceType(accessory) {
		// Priority order for service types
		const priority = [
			"Lightbulb",
			"Switch",
			"Outlet",
			"Thermostat",
			"TemperatureSensor",
			"HumiditySensor",
			"LockMechanism",
			"Fan",
			"GarageDoorOpener",
			"WindowCovering",
			"MotionSensor",
			"ContactSensor"
		];

		for (const type of priority) {
			if (accessory.type === type || accessory.serviceType === type) {
				return type;
			}
		}

		return accessory.type || accessory.serviceType || null;
	},

	/**
	 * Map HomeKit service type to device type
	 * @param {string} serviceType - HomeKit service type
	 * @returns {string}
	 */
	mapServiceType(serviceType) {
		const mapping = {
			Lightbulb: "light",
			Switch: "switch",
			Outlet: "switch",
			Thermostat: "thermostat",
			TemperatureSensor: "sensor",
			HumiditySensor: "sensor",
			LockMechanism: "lock",
			Fan: "fan",
			GarageDoorOpener: "cover",
			WindowCovering: "cover",
			MotionSensor: "sensor",
			ContactSensor: "sensor",
			LeakSensor: "sensor",
			SmokeSensor: "sensor"
		};
		return mapping[serviceType] || "switch";
	},

	/**
	 * Fetch all scenes
	 * @returns {Promise<Array>}
	 */
	async fetchScenes() {
		// Homebridge doesn't expose HomeKit scenes directly
		// Would need to use automations or custom plugins
		return [];
	},

	/**
	 * Control a device
	 * @param {string} deviceId - Unique ID
	 * @param {string} action - turn_on, turn_off, toggle, set
	 * @param {object} options - Characteristic values
	 * @returns {Promise<boolean>}
	 */
	async controlDevice(deviceId, action, options = {}) {
		if (!this.validateConfig()) return false;

		try {
			await this.authenticate();

			const characteristics = {};

			switch (action) {
				case "turn_on":
					characteristics.On = true;
					break;
				case "turn_off":
					characteristics.On = false;
					break;
				case "toggle":
					// Need current state
					const devices = await this.fetchDevices();
					const device = devices.find((d) => d.id === deviceId);
					characteristics.On = device?.state !== "on";
					break;
				case "set":
					if (options.brightness !== undefined) {
						characteristics.Brightness = options.brightness;
						characteristics.On = true;
					}
					if (options.color) {
						characteristics.Hue = options.color.h;
						characteristics.Saturation = options.color.s;
					}
					if (options.temperature !== undefined) {
						characteristics.TargetTemperature = options.temperature;
					}
					break;
				case "lock":
					characteristics.LockTargetState = 1;
					break;
				case "unlock":
					characteristics.LockTargetState = 0;
					break;
			}

			await this.apiRequest(`/api/accessories/${deviceId}`, {
				method: "PUT",
				body: JSON.stringify({ characteristicType: "On", value: characteristics.On, ...characteristics })
			});

			return true;
		} catch (error) {
			this.setError(`HomeKit control error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Activate a scene
	 * @param {string} sceneId - Scene ID
	 * @returns {Promise<boolean>}
	 */
	async activateScene(sceneId) {
		// Not directly supported via Homebridge API
		console.warn("[HomeKit] Scene activation requires HomeKit automation");
		return false;
	},

	/**
	 * Subscribe to real-time updates
	 * Uses polling as Homebridge doesn't support WebSocket push
	 * @param {function} callback - Callback for device updates
	 * @returns {function} Unsubscribe function
	 */
	subscribe(callback) {
		const interval = setInterval(async () => {
			const devices = await this.fetchDevices();
			callback(devices);
		}, this.config.updateInterval);

		return () => clearInterval(interval);
	}
});

module.exports = SmartHomeProvider;
