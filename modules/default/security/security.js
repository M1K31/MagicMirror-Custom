/**
 * Security Module for MagicMirror
 *
 * Integrates with OpenEye surveillance system for:
 * - Live camera feeds
 * - Motion event notifications
 * - Face recognition alerts
 * - Recording status
 * - Recent events timeline
 *
 * Requires OpenEye to be running and accessible
 * @see https://github.com/M1K31/OpenEye-OpenCV_Home_Security
 */

/* global Log, Module */

Module.register("security", {
	/**
	 * Default configuration
	 */
	defaults: {
		// OpenEye server configuration
		openeyeHost: "http://localhost:8000",
		// JWT token for authentication (set via env var or config)
		token: process.env.OPENEYE_TOKEN || "",

		// Display mode: "cameras", "events", "combined"
		displayMode: "combined",

		// Camera options
		cameras: [], // Camera IDs to display, empty = all
		maxCameras: 4,
		cameraSize: 200, // pixels
		showCameraNames: true,
		refreshInterval: 1000, // MJPEG refresh interval

		// Events options
		showEvents: true,
		maxEvents: 5,
		eventTypes: ["motion", "face_detected", "person_detected", "recording_started"],

		// Notifications
		notifyOnMotion: true,
		notifyOnFace: true,
		notifyOnUnknownFace: true,
		notifyOnRecording: false,

		// Real-time updates via WebSocket
		useWebSocket: true,

		// Update interval for polling (if WebSocket disabled)
		updateInterval: 30000,

		// Compact mode
		compactMode: false,

		// Event icons
		eventIcons: {
			motion: "fa-running",
			face_detected: "fa-user-check",
			unknown_face: "fa-user-secret",
			person_detected: "fa-person",
			recording_started: "fa-circle",
			recording_stopped: "fa-stop",
			camera_online: "fa-video",
			camera_offline: "fa-video-slash"
		}
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("security.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting security module`);

		// State
		this.cameras = [];
		this.events = [];
		this.statistics = null;
		this.connected = false;
		this.error = null;

		// Initialize connection to OpenEye
		this.sendSocketNotification("SECURITY_INIT", {
			host: this.config.openeyeHost,
			token: this.config.token,
			cameras: this.config.cameras,
			useWebSocket: this.config.useWebSocket,
			eventTypes: this.config.eventTypes
		});

		// Schedule updates if not using WebSocket
		if (!this.config.useWebSocket) {
			this.scheduleUpdate();
		}
	},

	/**
	 * Schedule periodic updates
	 */
	scheduleUpdate: function () {
		setInterval(() => {
			this.sendSocketNotification("SECURITY_REFRESH", {
				host: this.config.openeyeHost,
				token: this.config.token
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
			case "SECURITY_CONNECTED":
				this.connected = true;
				this.error = null;
				this.updateDom(300);
				break;

			case "SECURITY_CAMERAS":
				this.cameras = payload.cameras || [];
				this.updateDom(300);
				break;

			case "SECURITY_EVENTS":
				this.processEvents(payload.events || []);
				this.updateDom(300);
				break;

			case "SECURITY_STATISTICS":
				this.statistics = payload;
				this.updateDom(300);
				break;

			case "SECURITY_MOTION_EVENT":
				this.handleMotionEvent(payload);
				break;

			case "SECURITY_FACE_EVENT":
				this.handleFaceEvent(payload);
				break;

			case "SECURITY_ERROR":
				this.error = payload.message;
				this.connected = false;
				this.updateDom(300);
				break;

			case "SECURITY_DISCONNECTED":
				this.connected = false;
				this.updateDom(300);
				break;
		}
	},

	/**
	 * Process events from OpenEye
	 * @param {object[]} events - Array of events
	 */
	processEvents: function (events) {
		this.events = events
			.filter((e) => this.config.eventTypes.includes(e.event_type))
			.slice(0, this.config.maxEvents);
	},

	/**
	 * Handle motion event
	 * @param {object} event - Motion event
	 */
	handleMotionEvent: function (event) {
		// Add to events list
		this.events.unshift({
			event_type: "motion",
			camera_id: event.camera_id,
			timestamp: new Date().toISOString(),
			details: event
		});
		this.events = this.events.slice(0, this.config.maxEvents);
		this.updateDom(300);

		// Notify if enabled
		if (this.config.notifyOnMotion) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "Motion Detected",
				message: `Camera: ${event.camera_id}`,
				timer: 5000
			});
		}
	},

	/**
	 * Handle face detection event
	 * @param {object} event - Face event
	 */
	handleFaceEvent: function (event) {
		const isKnown = event.person_name && event.person_name !== "Unknown";

		// Add to events list
		this.events.unshift({
			event_type: isKnown ? "face_detected" : "unknown_face",
			camera_id: event.camera_id,
			timestamp: new Date().toISOString(),
			person_name: event.person_name,
			confidence: event.confidence,
			details: event
		});
		this.events = this.events.slice(0, this.config.maxEvents);
		this.updateDom(300);

		// Notify
		if (isKnown && this.config.notifyOnFace) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "Person Recognized",
				message: `${event.person_name} at ${event.camera_id}`,
				timer: 5000
			});
		} else if (!isKnown && this.config.notifyOnUnknownFace) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "Unknown Face Detected",
				message: `Camera: ${event.camera_id}`,
				timer: 8000
			});
		}
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `security-module${this.config.compactMode ? " compact" : ""}`;

		// Helper to create icon elements safely
		const createIcon = (iconClass) => {
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			return icon;
		};

		// Error state
		if (this.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "security-error";
			errorDiv.appendChild(createIcon("fa-exclamation-triangle"));
			const errorSpan = document.createElement("span");
			errorSpan.textContent = this.error;
			errorDiv.appendChild(errorSpan);
			wrapper.appendChild(errorDiv);
			return wrapper;
		}

		// Connection status
		if (!this.connected) {
			const statusDiv = document.createElement("div");
			statusDiv.className = "security-status connecting";
			statusDiv.appendChild(createIcon("fa-spinner fa-spin"));
			const statusSpan = document.createElement("span");
			statusSpan.textContent = "Connecting to OpenEye...";
			statusDiv.appendChild(statusSpan);
			wrapper.appendChild(statusDiv);
			return wrapper;
		}

		// Cameras section
		if (this.config.displayMode === "cameras" || this.config.displayMode === "combined") {
			wrapper.appendChild(this.renderCameras());
		}

		// Events section
		if ((this.config.displayMode === "events" || this.config.displayMode === "combined") && this.config.showEvents) {
			wrapper.appendChild(this.renderEvents());
		}

		return wrapper;
	},

	/**
	 * Render cameras grid
	 * @returns {HTMLElement} Cameras element
	 */
	renderCameras: function () {
		const section = document.createElement("div");
		section.className = "cameras-section";

		if (this.cameras.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "cameras-empty";
			const icon = document.createElement("i");
			icon.className = "fa fa-video-slash";
			emptyDiv.appendChild(icon);
			const span = document.createElement("span");
			span.textContent = "No cameras available";
			emptyDiv.appendChild(span);
			section.appendChild(emptyDiv);
			return section;
		}

		const grid = document.createElement("div");
		grid.className = "cameras-grid";

		const displayCameras = this.cameras.slice(0, this.config.maxCameras);

		displayCameras.forEach((camera) => {
			const cameraEl = document.createElement("div");
			cameraEl.className = `camera-item ${camera.is_active ? "active" : "inactive"}`;

			// Camera feed (MJPEG stream)
			const feedContainer = document.createElement("div");
			feedContainer.className = "camera-feed";
			feedContainer.style.width = `${this.config.cameraSize}px`;
			feedContainer.style.height = `${Math.round(this.config.cameraSize * 0.75)}px`;

			if (camera.is_active) {
				const img = document.createElement("img");
				img.src = `${this.config.openeyeHost}/api/cameras/${camera.camera_id}/stream`;
				img.alt = camera.camera_id;
				img.onerror = function () {
					this.style.display = "none";
					feedContainer.classList.add("error");
				};
				feedContainer.appendChild(img);
			} else {
				const offlineIcon = document.createElement("i");
				offlineIcon.className = "fa fa-video-slash";
				feedContainer.appendChild(offlineIcon);
			}

			cameraEl.appendChild(feedContainer);

			// Camera name
			if (this.config.showCameraNames) {
				const nameDiv = document.createElement("div");
				nameDiv.className = "camera-name";
				nameDiv.textContent = camera.name || camera.camera_id;

				// Status indicator
				const status = document.createElement("span");
				status.className = `camera-status ${camera.is_active ? "active" : "inactive"}`;
				nameDiv.appendChild(status);

				cameraEl.appendChild(nameDiv);
			}

			grid.appendChild(cameraEl);
		});

		section.appendChild(grid);

		return section;
	},

	/**
	 * Render events list
	 * @returns {HTMLElement} Events element
	 */
	renderEvents: function () {
		const section = document.createElement("div");
		section.className = "events-section";

		const header = document.createElement("div");
		header.className = "section-header";
		header.textContent = "Recent Events";
		section.appendChild(header);

		if (this.events.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "events-empty dimmed";
			emptyDiv.textContent = "No recent events";
			section.appendChild(emptyDiv);
			return section;
		}

		const list = document.createElement("div");
		list.className = "events-list";

		this.events.forEach((event) => {
			const eventEl = document.createElement("div");
			eventEl.className = `event-item ${event.event_type}`;

			// Icon
			const iconClass = this.config.eventIcons[event.event_type] || "fa-bell";
			const iconDiv = document.createElement("div");
			iconDiv.className = "event-icon";
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			iconDiv.appendChild(icon);
			eventEl.appendChild(iconDiv);

			// Info
			const infoDiv = document.createElement("div");
			infoDiv.className = "event-info";

			const typeDiv = document.createElement("div");
			typeDiv.className = "event-type";
			typeDiv.textContent = this.formatEventType(event);
			infoDiv.appendChild(typeDiv);

			const detailsDiv = document.createElement("div");
			detailsDiv.className = "event-details dimmed xsmall";

			const cameraSpan = document.createElement("span");
			cameraSpan.textContent = event.camera_id;
			detailsDiv.appendChild(cameraSpan);

			detailsDiv.appendChild(document.createTextNode(" • "));

			const timeSpan = document.createElement("span");
			timeSpan.textContent = this.formatTime(event.timestamp);
			detailsDiv.appendChild(timeSpan);

			infoDiv.appendChild(detailsDiv);
			eventEl.appendChild(infoDiv);

			list.appendChild(eventEl);
		});

		section.appendChild(list);

		return section;
	},

	/**
	 * Format event type for display
	 * @param {object} event - Event object
	 * @returns {string} Formatted type
	 */
	formatEventType: function (event) {
		switch (event.event_type) {
			case "motion":
				return "Motion Detected";
			case "face_detected":
				return event.person_name || "Face Detected";
			case "unknown_face":
				return "Unknown Face";
			case "person_detected":
				return "Person Detected";
			case "recording_started":
				return "Recording Started";
			case "recording_stopped":
				return "Recording Stopped";
			default:
				return event.event_type;
		}
	},

	/**
	 * Format timestamp
	 * @param {string} timestamp - ISO timestamp
	 * @returns {string} Formatted time
	 */
	formatTime: function (timestamp) {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now - date;
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		return date.toLocaleDateString();
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "SECURITY_REFRESH":
				this.sendSocketNotification("SECURITY_REFRESH", {
					host: this.config.openeyeHost,
					token: this.config.token
				});
				break;

			case "SECURITY_SHOW_CAMERA":
				// TODO: Show specific camera fullscreen
				break;
		}
	}
});
