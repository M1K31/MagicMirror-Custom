/**
 * Smart Home Module for MagicMirror
 *
 * Displays and controls smart home devices from multiple providers:
 * - Home Assistant
 * - HomeKit (via HomeBridge API)
 * - Google Home
 * - SmartThings
 *
 * Follows Apple HIG principles adapted for mirror display:
 * - Glanceable device status
 * - Clear on/off states
 * - Grouped by room
 * - Real-time updates
 */

/* global Log, Module */

Module.register("smarthome", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Provider configuration
		provider: "homeassistant",

		// Home Assistant configuration
		homeAssistant: {
			host: "http://homeassistant.local:8123",
			token: "",
			useLongLivedToken: true
		},

		// HomeKit (HomeBridge) configuration
		homeKit: {
			host: "http://localhost:51826",
			pin: "031-45-154",
			username: "",
			password: ""
		},

		// Google Home configuration
		googleHome: {
			clientId: "",
			clientSecret: "",
			refreshToken: ""
		},

		// SmartThings configuration
		smartThings: {
			token: "",
			locationId: ""
		},

		// Devices to display
		devices: [],

		// Display options
		groupByRoom: true,
		showControls: false,
		showLastUpdated: false,
		compactMode: false,

		// Update interval (ms)
		updateInterval: 30000,

		// Device type icons
		deviceIcons: {
			light: "fa-lightbulb",
			switch: "fa-toggle-on",
			sensor: "fa-thermometer-half",
			thermostat: "fa-temperature-half",
			lock: "fa-lock",
			door: "fa-door-closed",
			window: "fa-window-maximize",
			camera: "fa-video",
			fan: "fa-fan",
			outlet: "fa-plug",
			speaker: "fa-volume-up",
			vacuum: "fa-robot",
			blind: "fa-blinds",
			garage: "fa-warehouse",
			motion: "fa-walking",
			humidity: "fa-droplet",
			battery: "fa-battery-full",
			binary_sensor: "fa-circle",
			climate: "fa-snowflake",
			cover: "fa-blinds",
			media_player: "fa-play-circle"
		},

		// Animation
		animateChanges: true
	},

	/**
	 * Required scripts
	 * @returns {string[]} Array of script paths
	 */
	getScripts: function () {
		return [
			this.file("../../shared/utils.js"),
			this.file("../../shared/touch-handler.js"),
			this.file("../../shared/voice-handler.js")
		];
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("smarthome.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting module with provider: ${this.config.provider}`);

		this.devices = [];
		this.rooms = new Map();
		this.error = null;
		this.lastUpdate = null;
		this.connected = false;

		// Request initial data
		this.sendSocketNotification("SMARTHOME_INIT", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			devices: this.config.devices
		});

		// Schedule updates
		this.scheduleUpdate();
	},

	/**
	 * Get provider-specific configuration
	 * @returns {object} Provider configuration
	 */
	getProviderConfig: function () {
		switch (this.config.provider) {
			case "homeassistant":
				return this.config.homeAssistant;
			case "homekit":
				return this.config.homeKit;
			case "googlehome":
				return this.config.googleHome;
			case "smartthings":
				return this.config.smartThings;
			default:
				return {};
		}
	},

	/**
	 * Schedule periodic updates
	 */
	scheduleUpdate: function () {
		setInterval(() => {
			this.sendSocketNotification("SMARTHOME_GET_DEVICES", {
				provider: this.config.provider,
				config: this.getProviderConfig(),
				devices: this.config.devices
			});
		}, this.config.updateInterval);
	},

	/**
	 * Handle socket notifications from node_helper
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "SMARTHOME_DEVICES":
				this.processDevices(payload.devices);
				this.connected = true;
				this.error = null;
				this.lastUpdate = new Date();
				this.updateDom(this.config.animateChanges ? 300 : 0);
				break;

			case "SMARTHOME_DEVICE_UPDATE":
				this.updateDevice(payload);
				break;

			case "SMARTHOME_ERROR":
				this.error = payload.error;
				this.connected = false;
				this.updateDom();
				break;

			case "SMARTHOME_CONNECTED":
				this.connected = true;
				this.error = null;
				Log.info(`[${this.name}] Connected to ${this.config.provider}`);
				break;
		}
	},

	/**
	 * Process devices from provider
	 * @param {object[]} devices - Array of device objects
	 */
	processDevices: function (devices) {
		this.devices = devices.map((device) => this.normalizeDevice(device));

		// Group by room if enabled
		if (this.config.groupByRoom) {
			this.rooms = new Map();
			for (const device of this.devices) {
				const room = device.room || "Other";
				if (!this.rooms.has(room)) {
					this.rooms.set(room, []);
				}
				this.rooms.get(room).push(device);
			}
		}
	},

	/**
	 * Normalize device data across providers
	 * @param {object} device - Raw device from provider
	 * @returns {object} Normalized device
	 */
	normalizeDevice: function (device) {
		return {
			id: device.id || device.entity_id || device.deviceId,
			name: device.name || device.friendly_name || device.label || "Unknown Device",
			type: this.getDeviceType(device),
			state: this.getDeviceState(device),
			room: device.room || device.area || this.extractRoom(device),
			attributes: device.attributes || {},
			lastChanged: device.last_changed || device.lastUpdated || null,
			available: device.available !== false,
			raw: device
		};
	},

	/**
	 * Get device type from raw device
	 * @param {object} device - Raw device
	 * @returns {string} Device type
	 */
	getDeviceType: function (device) {
		// Home Assistant entity_id prefix
		if (device.entity_id) {
			return device.entity_id.split(".")[0];
		}

		// Explicit type
		if (device.type) {
			return device.type.toLowerCase();
		}

		// SmartThings capability
		if (device.capabilities) {
			if (device.capabilities.includes("switch")) return "switch";
			if (device.capabilities.includes("colorControl")) return "light";
			if (device.capabilities.includes("temperatureMeasurement")) return "sensor";
			if (device.capabilities.includes("thermostatMode")) return "thermostat";
		}

		return "unknown";
	},

	/**
	 * Get device state
	 * @param {object} device - Raw device
	 * @returns {object} State object
	 */
	getDeviceState: function (device) {
		const state = {
			on: false,
			value: null,
			unit: null,
			brightness: null,
			color: null,
			temperature: null
		};

		// Home Assistant
		if (device.state !== undefined) {
			state.on = device.state === "on" || device.state === "home" || device.state === "open";
			state.value = device.state;
		}

		// Attributes
		if (device.attributes) {
			state.brightness = device.attributes.brightness;
			state.color = device.attributes.rgb_color;
			state.temperature = device.attributes.temperature || device.attributes.current_temperature;
			state.unit = device.attributes.unit_of_measurement;
		}

		// SmartThings
		if (device.status) {
			state.on = device.status.switch === "on";
			state.value = device.status.switch || device.status.motion;
		}

		return state;
	},

	/**
	 * Extract room from device name or area
	 * @param {object} device - Device object
	 * @returns {string} Room name
	 */
	extractRoom: function (device) {
		// Try to extract from entity_id or name
		const name = device.friendly_name || device.name || "";
		const commonRooms = ["Living Room", "Bedroom", "Kitchen", "Bathroom", "Office", "Garage", "Hallway", "Basement", "Attic"];

		for (const room of commonRooms) {
			if (name.toLowerCase().includes(room.toLowerCase())) {
				return room;
			}
		}

		return "Other";
	},

	/**
	 * Update a single device
	 * @param {object} update - Device update
	 */
	updateDevice: function (update) {
		const index = this.devices.findIndex((d) => d.id === update.id);
		if (index !== -1) {
			this.devices[index] = this.normalizeDevice({ ...this.devices[index].raw, ...update });
			this.updateDom(this.config.animateChanges ? 300 : 0);
		}
	},

	/**
	 * Toggle device state
	 * @param {string} deviceId - Device ID
	 */
	toggleDevice: function (deviceId) {
		if (this.config.mode === "display" || !this.config.showControls) {
			return;
		}

		const device = this.devices.find((d) => d.id === deviceId);
		if (!device) return;

		this.sendSocketNotification("SMARTHOME_TOGGLE", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			deviceId: deviceId,
			currentState: device.state.on
		});
	},

	/**
	 * Set device brightness
	 * @param {string} deviceId - Device ID
	 * @param {number} brightness - Brightness level (0-255)
	 */
	setBrightness: function (deviceId, brightness) {
		if (this.config.mode === "display" || !this.config.showControls) {
			return;
		}

		this.sendSocketNotification("SMARTHOME_SET_BRIGHTNESS", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			deviceId: deviceId,
			brightness: brightness
		});
	},

	/**
	 * Set thermostat temperature
	 * @param {string} deviceId - Device ID
	 * @param {number} temperature - Target temperature
	 */
	setTemperature: function (deviceId, temperature) {
		if (this.config.mode === "display" || !this.config.showControls) {
			return;
		}

		this.sendSocketNotification("SMARTHOME_SET_TEMPERATURE", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			deviceId: deviceId,
			temperature: temperature
		});
	},

	/**
	 * Activate a scene
	 * @param {string} sceneId - Scene ID
	 */
	activateScene: function (sceneId) {
		this.sendSocketNotification("SMARTHOME_ACTIVATE_SCENE", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			sceneId: sceneId
		});
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `smarthome-module${this.config.compactMode ? " compact" : ""}`;

		// Error state
		if (this.error) {
			wrapper.innerHTML = `
				<div class="smarthome-error">
					<i class="fa fa-exclamation-triangle"></i>
					<span>${this.error}</span>
				</div>
			`;
			return wrapper;
		}

		// Loading state
		if (this.devices.length === 0 && !this.connected) {
			wrapper.innerHTML = `
				<div class="smarthome-loading">
					<i class="fa fa-spinner fa-spin"></i>
					<span>Connecting to ${this.config.provider}...</span>
				</div>
			`;
			return wrapper;
		}

		// Empty state
		if (this.devices.length === 0) {
			wrapper.innerHTML = `
				<div class="smarthome-empty">
					<i class="fa fa-home"></i>
					<span>No devices configured</span>
				</div>
			`;
			return wrapper;
		}

		// Connection status indicator
		if (!this.connected) {
			const status = document.createElement("div");
			status.className = "smarthome-status disconnected";
			status.innerHTML = '<i class="fa fa-plug-circle-xmark"></i> Disconnected';
			wrapper.appendChild(status);
		}

		// Render by room or flat list
		if (this.config.groupByRoom && this.rooms.size > 0) {
			wrapper.appendChild(this.renderRooms());
		} else {
			wrapper.appendChild(this.renderDeviceList(this.devices));
		}

		// Setup touch handlers
		if (this.config.mode === "touch" && this.config.showControls) {
			this.setupTouchHandlers(wrapper);
		}

		return wrapper;
	},

	/**
	 * Render devices grouped by room
	 * @returns {HTMLElement} Rooms container
	 */
	renderRooms: function () {
		const container = document.createElement("div");
		container.className = "smarthome-rooms";

		for (const [roomName, devices] of this.rooms) {
			const roomEl = document.createElement("div");
			roomEl.className = "smarthome-room";

			const header = document.createElement("div");
			header.className = "room-header";
			header.innerHTML = `
				<span class="room-name">${roomName}</span>
				<span class="room-count">${devices.length}</span>
			`;
			roomEl.appendChild(header);

			roomEl.appendChild(this.renderDeviceList(devices));
			container.appendChild(roomEl);
		}

		return container;
	},

	/**
	 * Render a list of devices
	 * @param {object[]} devices - Devices to render
	 * @returns {HTMLElement} Device list container
	 */
	renderDeviceList: function (devices) {
		const list = document.createElement("div");
		list.className = "device-list";

		for (const device of devices) {
			list.appendChild(this.renderDevice(device));
		}

		return list;
	},

	/**
	 * Render a single device
	 * @param {object} device - Device to render
	 * @returns {HTMLElement} Device element
	 */
	renderDevice: function (device) {
		const el = document.createElement("div");
		el.className = `device-item ${device.type} ${device.state.on ? "on" : "off"}`;
		if (!device.available) {
			el.classList.add("unavailable");
		}
		el.dataset.deviceId = device.id;

		// Icon
		const iconClass = this.config.deviceIcons[device.type] || "fa-circle";
		const iconEl = document.createElement("div");
		iconEl.className = "device-icon";
		iconEl.innerHTML = `<i class="fa ${iconClass}"></i>`;

		// Info
		const infoEl = document.createElement("div");
		infoEl.className = "device-info";

		const nameEl = document.createElement("div");
		nameEl.className = "device-name";
		nameEl.textContent = device.name;

		const stateEl = document.createElement("div");
		stateEl.className = "device-state";
		stateEl.textContent = this.formatDeviceState(device);

		infoEl.appendChild(nameEl);
		infoEl.appendChild(stateEl);

		el.appendChild(iconEl);
		el.appendChild(infoEl);

		// Controls for touch mode
		if (this.config.showControls && this.config.mode === "touch") {
			el.appendChild(this.renderControls(device));
		}

		return el;
	},

	/**
	 * Format device state for display
	 * @param {object} device - Device object
	 * @returns {string} Formatted state string
	 */
	formatDeviceState: function (device) {
		if (!device.available) {
			return "Unavailable";
		}

		switch (device.type) {
			case "light":
				if (!device.state.on) return "Off";
				if (device.state.brightness) {
					return `${Math.round((device.state.brightness / 255) * 100)}%`;
				}
				return "On";

			case "sensor":
			case "binary_sensor":
				if (device.state.value !== null && device.state.unit) {
					return `${device.state.value}${device.state.unit}`;
				}
				return device.state.value || "Unknown";

			case "thermostat":
			case "climate":
				if (device.state.temperature) {
					return `${device.state.temperature}°`;
				}
				return device.state.value || "Unknown";

			case "lock":
				return device.state.on ? "Locked" : "Unlocked";

			case "door":
			case "window":
			case "cover":
				return device.state.on ? "Open" : "Closed";

			case "motion":
				return device.state.on ? "Detected" : "Clear";

			default:
				return device.state.on ? "On" : "Off";
		}
	},

	/**
	 * Render device controls
	 * @param {object} device - Device object
	 * @returns {HTMLElement} Controls element
	 */
	renderControls: function (device) {
		const controls = document.createElement("div");
		controls.className = "device-controls";

		switch (device.type) {
			case "light":
			case "switch":
			case "fan":
			case "outlet":
				const toggleBtn = document.createElement("button");
				toggleBtn.className = `control-btn toggle ${device.state.on ? "on" : "off"}`;
				toggleBtn.innerHTML = `<i class="fa fa-power-off"></i>`;
				toggleBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.toggleDevice(device.id);
				});
				controls.appendChild(toggleBtn);

				// Brightness slider for lights
				if (device.type === "light" && device.state.brightness !== null) {
					const slider = document.createElement("input");
					slider.type = "range";
					slider.className = "brightness-slider";
					slider.min = 0;
					slider.max = 255;
					slider.value = device.state.brightness || 0;
					slider.addEventListener("change", (e) => {
						e.stopPropagation();
						this.setBrightness(device.id, parseInt(e.target.value));
					});
					controls.appendChild(slider);
				}
				break;

			case "thermostat":
			case "climate":
				const tempDown = document.createElement("button");
				tempDown.className = "control-btn temp-down";
				tempDown.innerHTML = '<i class="fa fa-minus"></i>';
				tempDown.addEventListener("click", (e) => {
					e.stopPropagation();
					const currentTemp = device.state.temperature || 70;
					this.setTemperature(device.id, currentTemp - 1);
				});

				const tempDisplay = document.createElement("span");
				tempDisplay.className = "temp-display";
				tempDisplay.textContent = `${device.state.temperature || "--"}°`;

				const tempUp = document.createElement("button");
				tempUp.className = "control-btn temp-up";
				tempUp.innerHTML = '<i class="fa fa-plus"></i>';
				tempUp.addEventListener("click", (e) => {
					e.stopPropagation();
					const currentTemp = device.state.temperature || 70;
					this.setTemperature(device.id, currentTemp + 1);
				});

				controls.appendChild(tempDown);
				controls.appendChild(tempDisplay);
				controls.appendChild(tempUp);
				break;

			case "lock":
				const lockBtn = document.createElement("button");
				lockBtn.className = `control-btn lock ${device.state.on ? "locked" : "unlocked"}`;
				lockBtn.innerHTML = `<i class="fa ${device.state.on ? "fa-lock" : "fa-lock-open"}"></i>`;
				lockBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.toggleDevice(device.id);
				});
				controls.appendChild(lockBtn);
				break;
		}

		return controls;
	},

	/**
	 * Setup touch handlers for interactive mode
	 * @param {HTMLElement} wrapper - Module wrapper
	 */
	setupTouchHandlers: function (wrapper) {
		if (typeof TouchHandler === "undefined") return;

		const devices = wrapper.querySelectorAll(".device-item");
		devices.forEach((deviceEl) => {
			TouchHandler.init(
				deviceEl,
				{
					onTap: () => {
						const deviceId = deviceEl.dataset.deviceId;
						this.toggleDevice(deviceId);
					},
					onLongPress: () => {
						// Could show device details or more controls
						const deviceId = deviceEl.dataset.deviceId;
						const device = this.devices.find((d) => d.id === deviceId);
						if (device) {
							this.sendNotification("SMARTHOME_DEVICE_DETAILS", device);
						}
					}
				},
				{ longPressTime: 500 }
			);
		});
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "SMARTHOME_TOGGLE_DEVICE":
				this.toggleDevice(payload.deviceId);
				break;
			case "SMARTHOME_SET_BRIGHTNESS":
				this.setBrightness(payload.deviceId, payload.brightness);
				break;
			case "SMARTHOME_SET_TEMPERATURE":
				this.setTemperature(payload.deviceId, payload.temperature);
				break;
			case "SMARTHOME_ACTIVATE_SCENE":
				this.activateScene(payload.sceneId);
				break;
			case "SMARTHOME_REFRESH":
				this.sendSocketNotification("SMARTHOME_GET_DEVICES", {
					provider: this.config.provider,
					config: this.getProviderConfig(),
					devices: this.config.devices
				});
				break;
		}
	}
});
