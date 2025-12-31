/**
 * OpenEye Events Dashboard Module for MagicMirror
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Displays surveillance event counts from OpenEye:
 * - Motion events per camera
 * - Face detection events per camera
 * - Recording counts per camera
 * - Last 24 hours summary
 *
 * Follows Apple HIG principles adapted for mirror display:
 * - Clear visual hierarchy
 * - Minimal cognitive load
 * - Glanceable information
 */

/* global Log, Module */

Module.register("openeye-events", {
	/**
	 * Default configuration
	 */
	defaults: {
		// OpenEye connection
		openeyeHost: "http://localhost:8000",
		ecosystemToken: "",

		// Update interval
		updateInterval: 60000, // 1 minute

		// Display options
		showMotionEvents: true,
		showFaceEvents: true,
		showRecordings: true,
		showCameraRows: true,
		maxCameras: 6,

		// Time range
		hoursBack: 24, // Show last 24 hours

		// Compact mode for smaller displays
		compactMode: false,

		// Animation
		animateChanges: true
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("openeye-events.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting OpenEye events dashboard`);

		// State
		this.eventData = {
			total: {
				motion: 0,
				faces: 0,
				recordings: 0
			},
			cameras: [],
			lastUpdate: null,
			error: null
		};

		this.previousData = null;

		// Start fetching data
		this.fetchEventData();
		this.scheduleUpdate();
	},

	/**
	 * Schedule next update
	 */
	scheduleUpdate: function () {
		setInterval(() => {
			this.fetchEventData();
		}, this.config.updateInterval);
	},

	/**
	 * Fetch event data from OpenEye
	 */
	fetchEventData: async function () {
		try {
			const headers = {
				"Content-Type": "application/json"
			};

			if (this.config.ecosystemToken) {
				headers["Authorization"] = `Bearer ${this.config.ecosystemToken}`;
			}

			// Fetch ecosystem statistics
			const response = await fetch(
				`${this.config.openeyeHost}/api/ecosystem/statistics?hours=${this.config.hoursBack}`,
				{ headers }
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			// Store previous data for animations
			this.previousData = JSON.parse(JSON.stringify(this.eventData));

			// Update event data
			this.eventData = {
				total: {
					motion: data.motion_events || 0,
					faces: data.face_events || 0,
					recordings: data.recordings || 0
				},
				cameras: data.cameras || [],
				lastUpdate: new Date(),
				error: null
			};

			this.updateDom(300);

		} catch (error) {
			Log.error(`[${this.name}] Error fetching event data: ${error.message}`);
			this.eventData.error = error.message;
			this.updateDom(300);
		}
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `openeye-events${this.config.compactMode ? " compact" : ""}`;

		// Error state
		if (this.eventData.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "events-error";
			errorDiv.innerHTML = `<i class="fa fa-exclamation-triangle"></i> ${this.eventData.error}`;
			wrapper.appendChild(errorDiv);
			return wrapper;
		}

		// Total counts summary
		wrapper.appendChild(this.renderTotalSummary());

		// Per-camera breakdown
		if (this.config.showCameraRows && this.eventData.cameras.length > 0) {
			wrapper.appendChild(this.renderCameraList());
		}

		return wrapper;
	},

	/**
	 * Render total events summary
	 * @returns {HTMLElement} Summary element
	 */
	renderTotalSummary: function () {
		const summary = document.createElement("div");
		summary.className = "events-summary";

		// Motion events
		if (this.config.showMotionEvents) {
			summary.appendChild(this.renderEventCount(
				"motion",
				this.eventData.total.motion,
				"fa-person-running",
				"Motion"
			));
		}

		// Face events
		if (this.config.showFaceEvents) {
			summary.appendChild(this.renderEventCount(
				"faces",
				this.eventData.total.faces,
				"fa-user",
				"Faces"
			));
		}

		// Recordings
		if (this.config.showRecordings) {
			summary.appendChild(this.renderEventCount(
				"recordings",
				this.eventData.total.recordings,
				"fa-video",
				"Videos"
			));
		}

		return summary;
	},

	/**
	 * Render a single event count
	 * @param {string} type - Event type
	 * @param {number} count - Event count
	 * @param {string} icon - Font Awesome icon class
	 * @param {string} label - Display label
	 * @returns {HTMLElement} Event count element
	 */
	renderEventCount: function (type, count, icon, label) {
		const item = document.createElement("div");
		item.className = `event-count ${type}`;

		// Check for changes and animate
		if (this.config.animateChanges && this.previousData) {
			const prevCount = this.previousData.total[type] || 0;
			if (count > prevCount) {
				item.classList.add("increased");
				setTimeout(() => item.classList.remove("increased"), 1000);
			}
		}

		// Icon
		const iconEl = document.createElement("i");
		iconEl.className = `fa ${icon}`;
		item.appendChild(iconEl);

		// Count
		const countEl = document.createElement("span");
		countEl.className = "count-number";
		countEl.textContent = this.formatNumber(count);
		item.appendChild(countEl);

		// Label
		const labelEl = document.createElement("span");
		labelEl.className = "count-label";
		labelEl.textContent = label;
		item.appendChild(labelEl);

		return item;
	},

	/**
	 * Render per-camera list
	 * @returns {HTMLElement} Camera list element
	 */
	renderCameraList: function () {
		const list = document.createElement("div");
		list.className = "camera-list";

		// Header
		const header = document.createElement("div");
		header.className = "camera-header";
		header.textContent = "Per Camera (24h)";
		list.appendChild(header);

		// Camera rows
		const cameras = this.eventData.cameras.slice(0, this.config.maxCameras);

		cameras.forEach(camera => {
			list.appendChild(this.renderCameraRow(camera));
		});

		// Show more indicator
		if (this.eventData.cameras.length > this.config.maxCameras) {
			const more = document.createElement("div");
			more.className = "more-cameras";
			more.textContent = `+${this.eventData.cameras.length - this.config.maxCameras} more`;
			list.appendChild(more);
		}

		return list;
	},

	/**
	 * Render a camera row
	 * @param {object} camera - Camera data
	 * @returns {HTMLElement} Camera row element
	 */
	renderCameraRow: function (camera) {
		const row = document.createElement("div");
		row.className = `camera-row${camera.is_active !== false ? "" : " offline"}`;

		// Camera name
		const name = document.createElement("div");
		name.className = "camera-name";
		name.textContent = camera.camera_name || camera.camera_id;
		row.appendChild(name);

		// Event counts
		const counts = document.createElement("div");
		counts.className = "camera-counts";

		// Motion
		if (this.config.showMotionEvents) {
			const motion = document.createElement("span");
			motion.className = "mini-count motion";
			motion.innerHTML = `<i class="fa fa-person-running"></i> ${camera.motion_events || 0}`;
			counts.appendChild(motion);
		}

		// Faces
		if (this.config.showFaceEvents) {
			const faces = document.createElement("span");
			faces.className = "mini-count faces";
			faces.innerHTML = `<i class="fa fa-user"></i> ${camera.face_events || 0}`;
			counts.appendChild(faces);
		}

		// Recordings
		if (this.config.showRecordings) {
			const recordings = document.createElement("span");
			recordings.className = "mini-count recordings";
			recordings.innerHTML = `<i class="fa fa-video"></i> ${camera.recordings || 0}`;
			counts.appendChild(recordings);
		}

		row.appendChild(counts);

		return row;
	},

	/**
	 * Format number with K/M suffix for large numbers
	 * @param {number} num - Number to format
	 * @returns {string} Formatted number
	 */
	formatNumber: function (num) {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1) + "M";
		}
		if (num >= 1000) {
			return (num / 1000).toFixed(1) + "K";
		}
		return num.toString();
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "OPENEYE_REFRESH":
				this.fetchEventData();
				break;

			case "OPENEYE_TOKEN_UPDATE":
				if (payload && payload.token) {
					this.config.ecosystemToken = payload.token;
					this.fetchEventData();
				}
				break;
		}
	}
});
