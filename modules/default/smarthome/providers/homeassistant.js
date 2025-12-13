/**
 * Home Assistant Provider for Smart Home Module
 *
 * Connects to Home Assistant for device status and control
 * Supports real-time updates via WebSocket API
 *
 * Setup:
 * 1. Go to Profile > Long-Lived Access Tokens
 * 2. Create a new token
 * 3. Configure host URL (http://homeassistant.local:8123)
 *
 * Credentials can be set via environment variables:
 * - HOMEASSISTANT_HOST
 * - HOMEASSISTANT_TOKEN
 */

const SmartHomeProvider = require("./smarthomeprovider");
const WebSocket = require("ws");

SmartHomeProvider.register("homeassistant", {
	providerName: "Home Assistant",

	defaults: {
		// Support environment variables for credentials
		host: process.env.HOMEASSISTANT_HOST || "http://homeassistant.local:8123",
		token: process.env.HOMEASSISTANT_TOKEN || "",
		// Entity ID patterns to include
		include: [],
		// Entity ID patterns to exclude
		exclude: ["automation.", "script.", "zone.", "person.", "device_tracker."],
		// Specific entities to show
		entities: []
	},

	/**
	 * Internal state
	 */
	ws: null,
	msgId: 1,
	subscriptionId: null,
	entityStates: {},
	callbacks: [],

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.host) {
			this.setError("Home Assistant host URL is required");
			return false;
		}
		if (!this.config.token) {
			this.setError("Home Assistant access token is required");
			return false;
		}
		return true;
	},

	/**
	 * Start the provider
	 */
	async start() {
		if (!this.validateConfig()) return;

		try {
			await this.connect();
		} catch (error) {
			this.setError(error.message);
		}
	},

	/**
	 * Stop the provider
	 */
	stop() {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	},

	/**
	 * Connect to Home Assistant WebSocket API
	 * @returns {Promise<void>}
	 */
	async connect() {
		return new Promise((resolve, reject) => {
			const wsUrl = this.config.host
				.replace("http://", "ws://")
				.replace("https://", "wss://") + "/api/websocket";

			this.ws = new WebSocket(wsUrl);

			this.ws.on("open", () => {
				console.log("[Home Assistant] WebSocket connected");
			});

			this.ws.on("message", async (data) => {
				try {
					const message = JSON.parse(data);
					await this.handleMessage(message, resolve, reject);
				} catch (error) {
					console.error("[Home Assistant] Message parse error:", error);
				}
			});

			this.ws.on("error", (error) => {
				console.error("[Home Assistant] WebSocket error:", error);
				reject(error);
			});

			this.ws.on("close", () => {
				console.log("[Home Assistant] WebSocket closed");
				// Attempt reconnection after delay
				setTimeout(() => this.connect(), 5000);
			});
		});
	},

	/**
	 * Handle WebSocket message
	 * @param {object} message - WebSocket message
	 * @param {function} resolve - Promise resolve
	 * @param {function} reject - Promise reject
	 */
	async handleMessage(message, resolve, reject) {
		switch (message.type) {
			case "auth_required":
				// Send authentication
				this.sendMessage({
					type: "auth",
					access_token: this.config.token
				});
				break;

			case "auth_ok":
				console.log("[Home Assistant] Authenticated");
				// Fetch initial states
				await this.fetchStates();
				// Subscribe to state changes
				await this.subscribeEvents();
				resolve();
				break;

			case "auth_invalid":
				reject(new Error("Home Assistant authentication failed"));
				break;

			case "result":
				if (message.success && message.result) {
					// Handle state fetch result
					if (Array.isArray(message.result)) {
						this.processStates(message.result);
					}
				}
				break;

			case "event":
				if (message.event?.event_type === "state_changed") {
					this.handleStateChange(message.event.data);
				}
				break;
		}
	},

	/**
	 * Send WebSocket message
	 * @param {object} message - Message to send
	 * @returns {number} Message ID
	 */
	sendMessage(message) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.error("[Home Assistant] WebSocket not connected");
			return null;
		}

		if (!message.type.startsWith("auth")) {
			message.id = this.msgId++;
		}

		this.ws.send(JSON.stringify(message));
		return message.id;
	},

	/**
	 * Fetch all entity states
	 * @returns {Promise<void>}
	 */
	async fetchStates() {
		this.sendMessage({
			type: "get_states"
		});
	},

	/**
	 * Subscribe to state change events
	 * @returns {Promise<void>}
	 */
	async subscribeEvents() {
		const id = this.sendMessage({
			type: "subscribe_events",
			event_type: "state_changed"
		});
		this.subscriptionId = id;
	},

	/**
	 * Process entity states
	 * @param {Array} states - Entity states
	 */
	processStates(states) {
		for (const state of states) {
			if (this.shouldIncludeEntity(state.entity_id)) {
				this.entityStates[state.entity_id] = state;
			}
		}
		this.notifyUpdate();
	},

	/**
	 * Handle state change event
	 * @param {object} data - State change data
	 */
	handleStateChange(data) {
		const entityId = data.entity_id;

		if (this.shouldIncludeEntity(entityId)) {
			this.entityStates[entityId] = data.new_state;
			this.notifyUpdate();
		}
	},

	/**
	 * Check if entity should be included
	 * @param {string} entityId - Entity ID
	 * @returns {boolean}
	 */
	shouldIncludeEntity(entityId) {
		// If specific entities configured, only include those
		if (this.config.entities && this.config.entities.length > 0) {
			return this.config.entities.includes(entityId);
		}

		// Check exclude patterns
		for (const pattern of this.config.exclude || []) {
			if (entityId.startsWith(pattern) || entityId.includes(pattern)) {
				return false;
			}
		}

		// Check include patterns
		if (this.config.include && this.config.include.length > 0) {
			for (const pattern of this.config.include) {
				if (entityId.startsWith(pattern) || entityId.includes(pattern)) {
					return true;
				}
			}
			return false;
		}

		return true;
	},

	/**
	 * Notify subscribers of update
	 */
	notifyUpdate() {
		const devices = this.getDevicesFromStates();
		this.setData(devices);

		for (const callback of this.callbacks) {
			callback(devices);
		}
	},

	/**
	 * Convert entity states to device objects
	 * @returns {Array}
	 */
	getDevicesFromStates() {
		const devices = [];

		for (const [entityId, state] of Object.entries(this.entityStates)) {
			if (!state) continue;

			const device = this.entityToDevice(entityId, state);
			if (device) {
				devices.push(device);
			}
		}

		return devices;
	},

	/**
	 * Convert Home Assistant entity to device
	 * @param {string} entityId - Entity ID
	 * @param {object} state - Entity state
	 * @returns {object}
	 */
	entityToDevice(entityId, state) {
		const domain = entityId.split(".")[0];
		const attrs = state.attributes || {};

		const device = {
			id: entityId,
			name: attrs.friendly_name || entityId,
			type: this.mapDomainToType(domain),
			room: attrs.room || null,
			state: state.state,
			brightness: null,
			color: null,
			temperature: null,
			humidity: null,
			battery: attrs.battery_level || null,
			lastChanged: state.last_changed,
			attributes: attrs
		};

		// Add type-specific attributes
		switch (domain) {
			case "light":
				if (attrs.brightness) {
					device.brightness = Math.round((attrs.brightness / 255) * 100);
				}
				if (attrs.hs_color) {
					device.color = { h: attrs.hs_color[0], s: attrs.hs_color[1] };
				} else if (attrs.rgb_color) {
					device.color = { r: attrs.rgb_color[0], g: attrs.rgb_color[1], b: attrs.rgb_color[2] };
				}
				break;

			case "climate":
				device.temperature = attrs.current_temperature;
				device.targetTemperature = attrs.temperature;
				device.hvacMode = state.state;
				break;

			case "sensor":
				if (attrs.device_class === "temperature") {
					device.temperature = parseFloat(state.state) || null;
				} else if (attrs.device_class === "humidity") {
					device.humidity = parseFloat(state.state) || null;
				}
				device.unit = attrs.unit_of_measurement;
				device.sensorValue = state.state;
				break;

			case "fan":
				device.speed = attrs.percentage || null;
				break;

			case "cover":
				device.position = attrs.current_position || null;
				break;

			case "lock":
				device.state = state.state === "locked" ? "locked" : "unlocked";
				break;
		}

		return device;
	},

	/**
	 * Map Home Assistant domain to device type
	 * @param {string} domain - HA domain
	 * @returns {string}
	 */
	mapDomainToType(domain) {
		const mapping = {
			light: "light",
			switch: "switch",
			input_boolean: "switch",
			climate: "thermostat",
			sensor: "sensor",
			binary_sensor: "sensor",
			lock: "lock",
			cover: "cover",
			fan: "fan",
			media_player: "media_player",
			camera: "camera"
		};
		return mapping[domain] || "switch";
	},

	/**
	 * Fetch all devices
	 * @returns {Promise<Array>}
	 */
	async fetchDevices() {
		return this.getDevicesFromStates();
	},

	/**
	 * Fetch all scenes
	 * @returns {Promise<Array>}
	 */
	async fetchScenes() {
		const scenes = [];

		for (const [entityId, state] of Object.entries(this.entityStates)) {
			if (entityId.startsWith("scene.")) {
				scenes.push({
					id: entityId,
					name: state.attributes?.friendly_name || entityId,
					icon: state.attributes?.icon || null,
					room: state.attributes?.room || null
				});
			}
		}

		return scenes;
	},

	/**
	 * Control a device
	 * @param {string} deviceId - Entity ID
	 * @param {string} action - turn_on, turn_off, toggle, set
	 * @param {object} options - Service data
	 * @returns {Promise<boolean>}
	 */
	async controlDevice(deviceId, action, options = {}) {
		const domain = deviceId.split(".")[0];

		let service = action;
		const serviceData = { entity_id: deviceId, ...options };

		// Map actions to Home Assistant services
		if (action === "set" && options.brightness !== undefined) {
			service = "turn_on";
			serviceData.brightness_pct = options.brightness;
		}

		this.sendMessage({
			type: "call_service",
			domain: domain,
			service: service,
			service_data: serviceData
		});

		return true;
	},

	/**
	 * Activate a scene
	 * @param {string} sceneId - Scene entity ID
	 * @returns {Promise<boolean>}
	 */
	async activateScene(sceneId) {
		this.sendMessage({
			type: "call_service",
			domain: "scene",
			service: "turn_on",
			service_data: { entity_id: sceneId }
		});

		return true;
	},

	/**
	 * Subscribe to real-time updates
	 * @param {function} callback - Callback for device updates
	 * @returns {function} Unsubscribe function
	 */
	subscribe(callback) {
		this.callbacks.push(callback);

		return () => {
			const index = this.callbacks.indexOf(callback);
			if (index > -1) {
				this.callbacks.splice(index, 1);
			}
		};
	}
});

module.exports = SmartHomeProvider;
