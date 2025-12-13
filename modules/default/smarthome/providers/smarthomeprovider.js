/**
 * Base Smart Home Provider
 *
 * Abstract base class for all smart home providers.
 * Provides standardized data structures for devices, scenes, and rooms.
 */

const BaseProvider = require("../../../shared/baseprovider");

const SmartHomeProvider = BaseProvider.extend({
	providerName: "SmartHomeProvider",

	defaults: {
		updateInterval: 30000 // 30 seconds
	},

	/**
	 * Device types
	 */
	deviceTypes: {
		LIGHT: "light",
		SWITCH: "switch",
		DIMMER: "dimmer",
		THERMOSTAT: "thermostat",
		SENSOR: "sensor",
		LOCK: "lock",
		COVER: "cover", // blinds, garage door
		FAN: "fan",
		CLIMATE: "climate",
		CAMERA: "camera",
		MEDIA_PLAYER: "media_player"
	},

	/**
	 * Standard device data structure
	 * @returns {object}
	 */
	getDeviceTemplate() {
		return {
			id: "",
			name: "",
			type: "switch",
			room: null,
			state: "off", // on, off, unavailable
			brightness: null, // 0-100 for lights
			color: null, // { h, s } or { r, g, b }
			temperature: null, // For thermostats
			humidity: null, // For sensors
			battery: null, // For battery-powered devices
			lastChanged: null,
			attributes: {} // Provider-specific attributes
		};
	},

	/**
	 * Standard scene data structure
	 * @returns {object}
	 */
	getSceneTemplate() {
		return {
			id: "",
			name: "",
			icon: null,
			room: null
		};
	},

	/**
	 * Fetch all devices
	 * @returns {Promise<Array>}
	 */
	async fetchDevices() {
		throw new Error("fetchDevices() must be implemented by provider");
	},

	/**
	 * Fetch all scenes
	 * @returns {Promise<Array>}
	 */
	async fetchScenes() {
		throw new Error("fetchScenes() must be implemented by provider");
	},

	/**
	 * Control a device
	 * @param {string} deviceId - Device identifier
	 * @param {string} action - turn_on, turn_off, toggle, set
	 * @param {object} options - Action options (brightness, color, etc.)
	 * @returns {Promise<boolean>}
	 */
	async controlDevice(deviceId, action, options = {}) {
		throw new Error("controlDevice() must be implemented by provider");
	},

	/**
	 * Activate a scene
	 * @param {string} sceneId - Scene identifier
	 * @returns {Promise<boolean>}
	 */
	async activateScene(sceneId) {
		throw new Error("activateScene() must be implemented by provider");
	},

	/**
	 * Subscribe to real-time updates
	 * @param {function} callback - Callback for device updates
	 * @returns {function} Unsubscribe function
	 */
	subscribe(callback) {
		throw new Error("subscribe() must be implemented by provider");
	},

	/**
	 * Get device icon based on type and state
	 * @param {object} device - Device object
	 * @returns {string} FontAwesome icon class
	 */
	getDeviceIcon(device) {
		const icons = {
			light: device.state === "on" ? "fa-lightbulb" : "fa-lightbulb",
			switch: device.state === "on" ? "fa-toggle-on" : "fa-toggle-off",
			dimmer: "fa-sliders",
			thermostat: "fa-temperature-half",
			sensor: "fa-gauge",
			lock: device.state === "locked" ? "fa-lock" : "fa-lock-open",
			cover: "fa-door-open",
			fan: "fa-fan",
			climate: "fa-snowflake",
			camera: "fa-video",
			media_player: "fa-play"
		};
		return icons[device.type] || "fa-plug";
	},

	/**
	 * Get state display text
	 * @param {object} device - Device object
	 * @returns {string}
	 */
	getStateText(device) {
		switch (device.type) {
			case "thermostat":
			case "climate":
				return device.temperature ? `${device.temperature}°` : device.state;

			case "sensor":
				if (device.temperature !== null) return `${device.temperature}°`;
				if (device.humidity !== null) return `${device.humidity}%`;
				return device.state;

			case "light":
			case "dimmer":
				if (device.state === "on" && device.brightness) {
					return `${device.brightness}%`;
				}
				return device.state;

			case "lock":
				return device.state === "locked" ? "Locked" : "Unlocked";

			default:
				return device.state === "on" ? "On" : "Off";
		}
	}
});

// Provider registry
SmartHomeProvider.providers = {};

/**
 * Register a smart home provider
 * @param {string} id - Provider identifier
 * @param {object} provider - Provider implementation
 */
SmartHomeProvider.register = function (id, provider) {
	SmartHomeProvider.providers[id.toLowerCase()] = SmartHomeProvider.extend(provider);
};

/**
 * Get a provider instance
 * @param {string} id - Provider identifier
 * @param {object} config - Provider configuration
 * @param {object} module - Parent module reference
 * @returns {SmartHomeProvider}
 */
SmartHomeProvider.getInstance = function (id, config, module) {
	const Provider = SmartHomeProvider.providers[id.toLowerCase()];
	if (!Provider) {
		throw new Error(`Unknown smart home provider: ${id}`);
	}
	const instance = new Provider();
	instance.init(config, module);
	return instance;
};

/**
 * List available providers
 * @returns {string[]}
 */
SmartHomeProvider.getAvailableProviders = function () {
	return Object.keys(SmartHomeProvider.providers);
};

module.exports = SmartHomeProvider;
