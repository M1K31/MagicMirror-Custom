/**
 * Security Node Helper
 *
 * Copyright (c) 2025 Mikel Smart
 * Licensed under the MIT License
 *
 * Handles server-side integration with OpenEye surveillance system:
 * - REST API communication
 * - WebSocket connection for real-time events
 * - Camera feed proxying
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const WebSocket = require("ws");

let EcosystemClient;
try {
	({ EcosystemClient } = require("../../js/ecosystem-client"));
} catch {
	EcosystemClient = null;
}

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.config = null;
		this.ws = null;
		this.token = null;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 5;
		this.reconnectDelay = 5000;
	},

	/**
	 * Handle socket notifications from frontend
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "SECURITY_INIT":
				this.initialize(payload);
				break;

			case "SECURITY_REFRESH":
				this.refreshData(payload);
				break;
		}
	},

	/**
	 * Initialize connection to OpenEye
	 * @param {object} config - Configuration
	 */
	initialize: async function (config) {
		this.config = config;
		this.token = config.token;

		// Try ecosystem discovery first, fall back to config host
		let resolvedHost = config.host;
		if (EcosystemClient && !this._ecoClient) {
			try {
				this._ecoClient = new EcosystemClient({
					serviceName: "magicmirror_security",
					servicePort: 8080,
				});
				await this._ecoClient.start();
				const peer = await this._ecoClient.discover("openeye");
				if (peer) {
					resolvedHost = peer.baseUrl;
					Log.info(`[${this.name}] Discovered OpenEye via ecosystem: ${resolvedHost}`);
				}
			} catch (e) {
				Log.debug(`[${this.name}] Ecosystem discovery failed, using config: ${e.message}`);
			}
		}
		this.config.host = resolvedHost;

		Log.info(`[${this.name}] Connecting to OpenEye at ${this.config.host}`);

		try {
			// Test connection
			await this.testConnection();

			// Fetch initial data
			await this.fetchCameras();
			await this.fetchEvents();

			// Connect WebSocket for real-time updates
			if (config.useWebSocket) {
				this.connectWebSocket();
			}

			this.sendSocketNotification("SECURITY_CONNECTED", { host: this.config.host });

			// Subscribe to ecosystem security events (complementary to WebSocket)
			if (this._ecoClient) {
				this._ecoClient.on("security.motion_detected", async (envelope) => {
					this.sendSocketNotification("SECURITY_MOTION_EVENT", {
						camera_id: envelope.data.camera_id,
						motion_areas: envelope.data.motion_areas,
						timestamp: envelope.timestamp,
						source: "ecosystem",
					});
				});

				this._ecoClient.on("security.person_detected", async (envelope) => {
					this.sendSocketNotification("SECURITY_FACE_EVENT", {
						camera_id: envelope.data.camera_id,
						person_name: envelope.data.person_name,
						confidence: envelope.data.confidence,
						type: "known",
						source: "ecosystem",
					});
				});

				this._ecoClient.on("security.alert", async (envelope) => {
					this.sendSocketNotification("SECURITY_FACE_EVENT", {
						camera_id: envelope.data.camera_id,
						person_name: "Unknown",
						confidence: 0,
						type: "unknown",
						severity: envelope.data.severity,
						source: "ecosystem",
					});
				});
			}
		} catch (error) {
			Log.error(`[${this.name}] Connection error: ${error.message}`);
			this.sendSocketNotification("SECURITY_ERROR", {
				message: `Failed to connect to OpenEye: ${error.message}`
			});
		}
	},

	/**
	 * Test connection to OpenEye API
	 */
	testConnection: async function () {
		const response = await fetch(`${this.config.host}/api/`);
		if (!response.ok) {
			throw new Error(`API returned ${response.status}`);
		}
		return response.json();
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>} Response data
	 */
	apiRequest: async function (endpoint, options = {}) {
		const headers = {
			"Content-Type": "application/json",
			...options.headers
		};

		if (this.token) {
			headers["Authorization"] = `Bearer ${this.token}`;
		}

		const response = await fetch(`${this.config.host}${endpoint}`, {
			...options,
			headers
		});

		if (!response.ok) {
			if (response.status === 401) {
				throw new Error("Authentication required - check OPENEYE_TOKEN");
			}
			throw new Error(`API error: ${response.status}`);
		}

		// Handle empty responses
		const text = await response.text();
		return text ? JSON.parse(text) : {};
	},

	/**
	 * Fetch cameras from OpenEye
	 */
	fetchCameras: async function () {
		try {
			const data = await this.apiRequest("/api/cameras/");

			const cameras = (data.cameras || []).map((cam) => ({
				camera_id: cam.camera_id,
				name: cam.name || cam.camera_id,
				camera_type: cam.camera_type,
				is_active: cam.is_active,
				face_detection_enabled: cam.face_detection_enabled,
				motion_detection_enabled: cam.motion_detection_enabled,
				recording_enabled: cam.recording_enabled
			}));

			// Filter to requested cameras if specified
			const filteredCameras = this.config.cameras?.length > 0
				? cameras.filter((c) => this.config.cameras.includes(c.camera_id))
				: cameras;

			this.sendSocketNotification("SECURITY_CAMERAS", { cameras: filteredCameras });
		} catch (error) {
			Log.error(`[${this.name}] Failed to fetch cameras: ${error.message}`);
		}
	},

	/**
	 * Fetch recent events from OpenEye
	 */
	fetchEvents: async function () {
		try {
			// Fetch motion events
			const motionData = await this.apiRequest("/api/motion-events/?limit=20");

			const events = (motionData.events || []).map((event) => ({
				id: event.id,
				event_type: "motion",
				camera_id: event.camera_id,
				timestamp: event.created_at || event.timestamp,
				details: event
			}));

			// Try to fetch face history (may require auth)
			try {
				const faceData = await this.apiRequest("/api/face-history/?limit=10");

				const faceEvents = (faceData.items || []).map((face) => ({
					id: face.id,
					event_type: face.person_name ? "face_detected" : "unknown_face",
					camera_id: face.camera_id,
					timestamp: face.detected_at,
					person_name: face.person_name,
					confidence: face.confidence,
					details: face
				}));

				events.push(...faceEvents);
			} catch {
				// Face history may not be available without auth
			}

			// Sort by timestamp
			events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

			this.sendSocketNotification("SECURITY_EVENTS", { events: events.slice(0, 20) });
		} catch (error) {
			Log.error(`[${this.name}] Failed to fetch events: ${error.message}`);
		}
	},

	/**
	 * Fetch statistics from OpenEye
	 */
	fetchStatistics: async function () {
		try {
			const data = await this.apiRequest("/api/metrics/");

			this.sendSocketNotification("SECURITY_STATISTICS", {
				totalCameras: data.total_cameras,
				activeCameras: data.active_cameras,
				totalRecordings: data.total_recordings,
				knownFaces: data.known_faces,
				storageUsed: data.storage_used
			});
		} catch (error) {
			Log.error(`[${this.name}] Failed to fetch statistics: ${error.message}`);
		}
	},

	/**
	 * Connect to OpenEye WebSocket for real-time events
	 */
	connectWebSocket: function () {
		if (this.ws) {
			this.ws.close();
		}

		const wsUrl = this.config.host.replace(/^http/, "ws");
		const wsEndpoint = `${wsUrl}/api/ws/statistics?token=${this.token}`;

		Log.info(`[${this.name}] Connecting to WebSocket: ${wsUrl}/api/ws/statistics`);

		try {
			this.ws = new WebSocket(wsEndpoint);

			this.ws.on("open", () => {
				Log.info(`[${this.name}] WebSocket connected`);
				this.reconnectAttempts = 0;
			});

			this.ws.on("message", (data) => {
				try {
					const message = JSON.parse(data);
					this.handleWebSocketMessage(message);
				} catch (error) {
					Log.error(`[${this.name}] WebSocket message parse error: ${error.message}`);
				}
			});

			this.ws.on("close", () => {
				Log.warn(`[${this.name}] WebSocket disconnected`);
				this.sendSocketNotification("SECURITY_DISCONNECTED", {});
				this.scheduleReconnect();
			});

			this.ws.on("error", (error) => {
				Log.error(`[${this.name}] WebSocket error: ${error.message}`);
			});
		} catch (error) {
			Log.error(`[${this.name}] WebSocket connection error: ${error.message}`);
			this.scheduleReconnect();
		}
	},

	/**
	 * Handle WebSocket message
	 * @param {object} message - WebSocket message
	 */
	handleWebSocketMessage: function (message) {
		switch (message.type) {
			case "statistics_update":
				this.sendSocketNotification("SECURITY_STATISTICS", message.data);
				break;

			case "camera_event":
				if (message.event === "motion_detected") {
					this.sendSocketNotification("SECURITY_MOTION_EVENT", {
						camera_id: message.camera_id,
						timestamp: message.timestamp,
						motion_area: message.motion_area
					});
				}
				break;

			case "face_detected":
				this.sendSocketNotification("SECURITY_FACE_EVENT", {
					camera_id: message.camera_id,
					person_name: message.person_name,
					confidence: message.confidence,
					timestamp: message.timestamp
				});
				break;

			case "recording_started":
			case "recording_stopped":
				// Could notify about recording status changes
				break;

			case "connection_status":
				Log.info(`[${this.name}] OpenEye: ${message.message}`);
				break;
		}
	},

	/**
	 * Schedule WebSocket reconnection
	 */
	scheduleReconnect: function () {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			Log.error(`[${this.name}] Max reconnection attempts reached`);
			return;
		}

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

		Log.info(`[${this.name}] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

		setTimeout(() => {
			this.connectWebSocket();
		}, delay);
	},

	/**
	 * Refresh all data
	 * @param {object} payload - Refresh payload
	 */
	refreshData: async function (payload) {
		this.config = { ...this.config, ...payload };

		await this.fetchCameras();
		await this.fetchEvents();
		await this.fetchStatistics();
	},

	/**
	 * Stop the helper
	 */
	stop: async function () {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		if (this._ecoClient) {
			try { await this._ecoClient.stop(); } catch { /* ignore */ }
			this._ecoClient = null;
		}
	}
});
