/**
 * SmartThings Provider for Smart Home Module
 *
 * Connects to Samsung SmartThings for device control
 * Uses the official SmartThings API
 *
 * Setup:
 * 1. Go to https://account.smartthings.com/tokens
 * 2. Create a new personal access token
 * 3. Select required scopes (devices, scenes, locations)
 */

const SmartHomeProvider = require("./smarthomeprovider");

SmartHomeProvider.register("smartthings", {
	providerName: "SmartThings",

	defaults: {
		token: "",
		baseUrl: "https://api.smartthings.com/v1",
		// Filter by location ID (optional)
		locationId: "",
		// Filter by room ID (optional)
		roomId: ""
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.token) {
			this.setError("SmartThings personal access token is required");
			return false;
		}
		return true;
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, options = {}) {
		const url = `${this.config.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.config.token}`,
				"Content-Type": "application/json",
				...options.headers
			}
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(`SmartThings API error: ${error.error?.message || response.statusText}`);
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
			const params = new URLSearchParams();
			if (this.config.locationId) {
				params.append("locationId", this.config.locationId);
			}

			const data = await this.apiRequest(`/devices?${params}`);
			const devices = [];

			for (const item of data.items || []) {
				// Fetch device status
				const status = await this.fetchDeviceStatus(item.deviceId);
				const device = this.smartThingsToDevice(item, status);
				if (device) {
					devices.push(device);
				}
			}

			return devices;
		} catch (error) {
			this.setError(`SmartThings fetch error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Fetch device status
	 * @param {string} deviceId - Device ID
	 * @returns {Promise<object>}
	 */
	async fetchDeviceStatus(deviceId) {
		try {
			return await this.apiRequest(`/devices/${deviceId}/status`);
		} catch {
			return {};
		}
	},

	/**
	 * Convert SmartThings device to standard format
	 * @param {object} item - SmartThings device
	 * @param {object} status - Device status
	 * @returns {object}
	 */
	smartThingsToDevice(item, status) {
		const components = status.components?.main || {};

		const device = {
			id: item.deviceId,
			name: item.label || item.name,
			type: this.mapDeviceType(item.components?.[0]?.categories?.[0]?.name),
			room: item.roomId || null,
			state: "off",
			brightness: null,
			color: null,
			temperature: null,
			humidity: null,
			battery: null,
			lastChanged: null,
			attributes: {
				manufacturer: item.manufacturerName,
				model: item.deviceTypeName,
				capabilities: item.components?.[0]?.capabilities?.map((c) => c.id) || []
			}
		};

		// Extract state from components
		if (components.switch) {
			device.state = components.switch.switch?.value === "on" ? "on" : "off";
		}

		if (components.switchLevel) {
			device.brightness = components.switchLevel.level?.value;
		}

		if (components.colorControl) {
			device.color = {
				h: components.colorControl.hue?.value,
				s: components.colorControl.saturation?.value
			};
		}

		if (components.temperatureMeasurement) {
			device.temperature = components.temperatureMeasurement.temperature?.value;
		}

		if (components.thermostatCoolingSetpoint || components.thermostatHeatingSetpoint) {
			device.targetTemperature = components.thermostatCoolingSetpoint?.coolingSetpoint?.value
				|| components.thermostatHeatingSetpoint?.heatingSetpoint?.value;
		}

		if (components.relativeHumidityMeasurement) {
			device.humidity = components.relativeHumidityMeasurement.humidity?.value;
		}

		if (components.battery) {
			device.battery = components.battery.battery?.value;
		}

		if (components.lock) {
			device.state = components.lock.lock?.value === "locked" ? "locked" : "unlocked";
		}

		if (components.doorControl) {
			device.state = components.doorControl.door?.value || "closed";
		}

		if (components.motionSensor) {
			device.state = components.motionSensor.motion?.value === "active" ? "on" : "off";
			device.motion = components.motionSensor.motion?.value === "active";
		}

		if (components.contactSensor) {
			device.state = components.contactSensor.contact?.value || "closed";
		}

		return device;
	},

	/**
	 * Map SmartThings category to device type
	 * @param {string} category - SmartThings category
	 * @returns {string}
	 */
	mapDeviceType(category) {
		const mapping = {
			Light: "light",
			Switch: "switch",
			Outlet: "switch",
			Thermostat: "thermostat",
			Sensor: "sensor",
			Lock: "lock",
			GarageDoor: "cover",
			Blind: "cover",
			Fan: "fan",
			Television: "media_player",
			Speaker: "media_player",
			Camera: "camera"
		};
		return mapping[category] || "switch";
	},

	/**
	 * Fetch all scenes
	 * @returns {Promise<Array>}
	 */
	async fetchScenes() {
		if (!this.validateConfig()) return [];

		try {
			const params = new URLSearchParams();
			if (this.config.locationId) {
				params.append("locationId", this.config.locationId);
			}

			const data = await this.apiRequest(`/scenes?${params}`);
			const scenes = [];

			for (const item of data.items || []) {
				scenes.push({
					id: item.sceneId,
					name: item.sceneName,
					icon: item.sceneIcon || null,
					room: null
				});
			}

			return scenes;
		} catch (error) {
			this.setError(`SmartThings scenes error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Control a device
	 * @param {string} deviceId - Device ID
	 * @param {string} action - turn_on, turn_off, set
	 * @param {object} options - Command options
	 * @returns {Promise<boolean>}
	 */
	async controlDevice(deviceId, action, options = {}) {
		if (!this.validateConfig()) return false;

		try {
			const commands = [];

			switch (action) {
				case "turn_on":
					commands.push({
						capability: "switch",
						command: "on"
					});
					break;

				case "turn_off":
					commands.push({
						capability: "switch",
						command: "off"
					});
					break;

				case "toggle":
					// Need to fetch current state first
					const status = await this.fetchDeviceStatus(deviceId);
					const isOn = status.components?.main?.switch?.switch?.value === "on";
					commands.push({
						capability: "switch",
						command: isOn ? "off" : "on"
					});
					break;

				case "set":
					if (options.brightness !== undefined) {
						commands.push({
							capability: "switchLevel",
							command: "setLevel",
							arguments: [options.brightness]
						});
					}
					if (options.color) {
						commands.push({
							capability: "colorControl",
							command: "setHue",
							arguments: [options.color.h]
						});
						commands.push({
							capability: "colorControl",
							command: "setSaturation",
							arguments: [options.color.s]
						});
					}
					if (options.temperature !== undefined) {
						commands.push({
							capability: "thermostatCoolingSetpoint",
							command: "setCoolingSetpoint",
							arguments: [options.temperature]
						});
					}
					break;

				case "lock":
					commands.push({
						capability: "lock",
						command: "lock"
					});
					break;

				case "unlock":
					commands.push({
						capability: "lock",
						command: "unlock"
					});
					break;
			}

			if (commands.length === 0) return false;

			await this.apiRequest(`/devices/${deviceId}/commands`, {
				method: "POST",
				body: JSON.stringify({
					commands: commands.map((cmd) => ({
						component: "main",
						...cmd
					}))
				})
			});

			return true;
		} catch (error) {
			this.setError(`SmartThings control error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Activate a scene
	 * @param {string} sceneId - Scene ID
	 * @returns {Promise<boolean>}
	 */
	async activateScene(sceneId) {
		if (!this.validateConfig()) return false;

		try {
			await this.apiRequest(`/scenes/${sceneId}/execute`, {
				method: "POST"
			});
			return true;
		} catch (error) {
			this.setError(`SmartThings scene error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Subscribe to real-time updates
	 * SmartThings uses webhooks, so we poll
	 * @param {function} callback - Callback for device updates
	 * @returns {function} Unsubscribe function
	 */
	subscribe(callback) {
		const interval = setInterval(async () => {
			const devices = await this.fetchDevices();
			callback(devices);
		}, this.config.updateInterval);

		return () => clearInterval(interval);
	},

	/**
	 * Get rooms/locations
	 * @returns {Promise<Array>}
	 */
	async getRooms() {
		if (!this.validateConfig()) return [];

		try {
			const params = new URLSearchParams();
			if (this.config.locationId) {
				params.append("locationId", this.config.locationId);
			}

			const data = await this.apiRequest(`/rooms?${params}`);
			return data.items || [];
		} catch (error) {
			this.setError(`SmartThings rooms error: ${error.message}`);
			return [];
		}
	}
});

module.exports = SmartHomeProvider;
