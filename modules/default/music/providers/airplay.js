/**
 * AirPlay Provider for Music Module
 *
 * Monitors AirPlay receivers for now playing information
 * Works with HomePod, Apple TV, and other AirPlay 2 devices
 *
 * Setup:
 * - Devices must be on the same network
 * - Uses mDNS/Bonjour for device discovery
 * - Requires pyatv for Apple TV integration
 */

const MusicProvider = require("./musicprovider");
const dgram = require("dgram");

MusicProvider.register("airplay", {
	providerName: "AirPlay",

	defaults: {
		// Specific device to monitor (optional)
		deviceId: "",
		deviceName: "",
		// Device IP if known
		deviceIp: "",
		// Use pyatv for Apple TV (requires Python)
		usePyatv: true,
		// pyatv credentials (for Apple TV)
		credentials: ""
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		// AirPlay can work with auto-discovery
		return true;
	},

	/**
	 * Fetch now playing info from AirPlay device
	 * @returns {Promise<object>}
	 */
	async fetchNowPlaying() {
		try {
			if (this.config.usePyatv && this.config.deviceIp) {
				return await this.fetchFromPyatv();
			}

			// Fallback: try DACP protocol
			return await this.fetchFromDacp();
		} catch (error) {
			this.setError(`AirPlay error: ${error.message}`);
			return this.getNowPlayingTemplate();
		}
	},

	/**
	 * Fetch now playing using pyatv
	 * @returns {Promise<object>}
	 */
	async fetchFromPyatv() {
		const { exec } = require("child_process");
		const util = require("util");
		const execPromise = util.promisify(exec);

		try {
			let cmd = `atvremote -s ${this.config.deviceIp} playing`;

			if (this.config.credentials) {
				cmd = `atvremote -s ${this.config.deviceIp} --companion-credentials ${this.config.credentials} playing`;
			}

			const { stdout } = await execPromise(cmd);

			// Parse pyatv output
			const lines = stdout.split("\n");
			const data = {};

			for (const line of lines) {
				const [key, ...valueParts] = line.split(":");
				if (key && valueParts.length > 0) {
					data[key.trim().toLowerCase().replace(/\s+/g, "_")] = valueParts.join(":").trim();
				}
			}

			return {
				isPlaying: data.device_state === "Playing",
				track: {
					name: data.title || "",
					artist: data.artist || "",
					album: data.album || "",
					duration: this.parseDuration(data.total_time),
					albumArt: null, // Would need separate artwork fetch
					uri: null
				},
				progress: this.parseDuration(data.position),
				device: {
					name: this.config.deviceName || data.device || "AirPlay",
					type: "speaker",
					volume: 0
				},
				context: {
					type: data.media_type || "",
					name: data.app || ""
				},
				shuffle: data.shuffle === "True" || data.shuffle === "Songs",
				repeat: data.repeat?.toLowerCase() || "off"
			};
		} catch (error) {
			throw new Error(`pyatv error: ${error.message}`);
		}
	},

	/**
	 * Parse duration string (HH:MM:SS or MM:SS)
	 * @param {string} timeStr - Time string
	 * @returns {number} Seconds
	 */
	parseDuration(timeStr) {
		if (!timeStr) return 0;

		const parts = timeStr.split(":").map(Number);
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		} else if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		return 0;
	},

	/**
	 * Fetch using DACP protocol (iTunes Remote Protocol)
	 * @returns {Promise<object>}
	 */
	async fetchFromDacp() {
		// DACP requires pairing and is complex to implement
		// Return placeholder
		return {
			...this.getNowPlayingTemplate(),
			isPlaying: false,
			error: "DACP not implemented - use pyatv"
		};
	},

	/**
	 * Control playback using pyatv
	 * @param {string} action - play, pause, next, previous
	 * @param {object} options - Action options
	 * @returns {Promise<boolean>}
	 */
	async control(action, options = {}) {
		if (!this.config.deviceIp) {
			console.warn("[AirPlay] Device IP required for control");
			return false;
		}

		try {
			const { exec } = require("child_process");
			const util = require("util");
			const execPromise = util.promisify(exec);

			const actionMap = {
				play: "play",
				pause: "pause",
				next: "next",
				previous: "previous",
				stop: "stop"
			};

			const atvAction = actionMap[action];
			if (!atvAction) {
				throw new Error(`Unknown action: ${action}`);
			}

			let cmd = `atvremote -s ${this.config.deviceIp} ${atvAction}`;
			if (this.config.credentials) {
				cmd = `atvremote -s ${this.config.deviceIp} --companion-credentials ${this.config.credentials} ${atvAction}`;
			}

			await execPromise(cmd);
			return true;
		} catch (error) {
			this.setError(`AirPlay control error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Set volume using pyatv
	 * @param {number} volume - Volume level 0-100
	 * @returns {Promise<boolean>}
	 */
	async setVolume(volume) {
		if (!this.config.deviceIp) return false;

		try {
			const { exec } = require("child_process");
			const util = require("util");
			const execPromise = util.promisify(exec);

			const level = Math.max(0, Math.min(100, Math.round(volume)));
			let cmd = `atvremote -s ${this.config.deviceIp} set_volume=${level}`;

			if (this.config.credentials) {
				cmd = `atvremote -s ${this.config.deviceIp} --companion-credentials ${this.config.credentials} set_volume=${level}`;
			}

			await execPromise(cmd);
			return true;
		} catch (error) {
			this.setError(`AirPlay volume error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Seek to position
	 * @param {number} position - Position in seconds
	 * @returns {Promise<boolean>}
	 */
	async seek(position) {
		if (!this.config.deviceIp) return false;

		try {
			const { exec } = require("child_process");
			const util = require("util");
			const execPromise = util.promisify(exec);

			let cmd = `atvremote -s ${this.config.deviceIp} set_position=${position}`;

			if (this.config.credentials) {
				cmd = `atvremote -s ${this.config.deviceIp} --companion-credentials ${this.config.credentials} set_position=${position}`;
			}

			await execPromise(cmd);
			return true;
		} catch (error) {
			this.setError(`AirPlay seek error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Discover AirPlay devices on the network
	 * @returns {Promise<Array>}
	 */
	async discoverDevices() {
		try {
			const { exec } = require("child_process");
			const util = require("util");
			const execPromise = util.promisify(exec);

			const { stdout } = await execPromise("atvremote scan");

			const devices = [];
			const lines = stdout.split("\n");
			let currentDevice = null;

			for (const line of lines) {
				if (line.includes("Name:")) {
					if (currentDevice) devices.push(currentDevice);
					currentDevice = { name: line.split(":")[1].trim() };
				} else if (line.includes("Address:") && currentDevice) {
					currentDevice.ip = line.split(":")[1].trim();
				} else if (line.includes("Identifier:") && currentDevice) {
					currentDevice.id = line.split(":")[1].trim();
				}
			}

			if (currentDevice) devices.push(currentDevice);

			return devices;
		} catch (error) {
			this.setError(`AirPlay discovery error: ${error.message}`);
			return [];
		}
	}
});

module.exports = MusicProvider;
