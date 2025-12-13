/**
 * Fitness Module for MagicMirror
 *
 * Displays fitness data from multiple providers:
 * - Fitbit
 * - Garmin Connect
 * - Apple Health (via export)
 * - Strava
 *
 * Follows Apple HIG principles adapted for mirror display:
 * - Ring-based goal progress
 * - Clear metrics display
 * - Glanceable daily stats
 * - Weekly summaries
 */

/* global Log, Module */

Module.register("fitness", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Provider configuration
		provider: "fitbit",

		// Fitbit configuration
		fitbit: {
			clientId: "",
			clientSecret: "",
			refreshToken: ""
		},

		// Garmin configuration
		garmin: {
			email: "",
			password: ""
		},

		// Apple Health configuration (requires export)
		appleHealth: {
			dataPath: ""
		},

		// Strava configuration
		strava: {
			clientId: "",
			clientSecret: "",
			refreshToken: ""
		},

		// Display options
		metrics: ["steps", "distance", "calories", "activeMinutes"],
		showGoals: true,
		showRings: true,
		showSleep: false,
		showHeartRate: false,
		showWeekSummary: false,
		compactMode: false,

		// Goals (defaults, can be overridden by provider data)
		goals: {
			steps: 10000,
			distance: 8, // km
			calories: 500, // active calories
			activeMinutes: 30,
			floors: 10
		},

		// Units
		units: {
			distance: "km", // km or mi
			weight: "kg" // kg or lbs
		},

		// Update interval (ms)
		updateInterval: 300000, // 5 minutes

		// Ring colors (Apple-inspired)
		ringColors: {
			move: "#fa114f",
			exercise: "#92e82a",
			stand: "#1eeaef"
		}
	},

	/**
	 * Required scripts
	 * @returns {string[]} Array of script paths
	 */
	getScripts: function () {
		return [this.file("../../shared/utils.js")];
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("fitness.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting module with provider: ${this.config.provider}`);

		this.data = {
			steps: 0,
			distance: 0,
			calories: 0,
			activeMinutes: 0,
			floors: 0,
			heartRate: null,
			sleep: null,
			weekData: []
		};
		this.goals = { ...this.config.goals };
		this.error = null;
		this.lastUpdate = null;

		// Request initial data
		this.sendSocketNotification("FITNESS_INIT", {
			provider: this.config.provider,
			config: this.getProviderConfig()
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
			case "fitbit":
				return this.config.fitbit;
			case "garmin":
				return this.config.garmin;
			case "applehealth":
				return this.config.appleHealth;
			case "strava":
				return this.config.strava;
			default:
				return {};
		}
	},

	/**
	 * Schedule periodic updates
	 */
	scheduleUpdate: function () {
		setInterval(() => {
			this.sendSocketNotification("FITNESS_REFRESH", {
				provider: this.config.provider,
				config: this.getProviderConfig()
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
			case "FITNESS_DATA":
				this.processData(payload);
				this.lastUpdate = new Date();
				this.error = null;
				this.updateDom(300);
				break;

			case "FITNESS_ERROR":
				this.error = payload.error;
				this.updateDom();
				break;
		}
	},

	/**
	 * Process fitness data from provider
	 * @param {object} data - Fitness data
	 */
	processData: function (data) {
		this.data = {
			steps: data.steps || 0,
			distance: data.distance || 0,
			calories: data.calories || 0,
			activeMinutes: data.activeMinutes || 0,
			floors: data.floors || 0,
			heartRate: data.heartRate || null,
			sleep: data.sleep || null,
			weekData: data.weekData || []
		};

		// Update goals from provider if available
		if (data.goals) {
			this.goals = { ...this.config.goals, ...data.goals };
		}
	},

	/**
	 * Calculate progress percentage
	 * @param {number} current - Current value
	 * @param {number} goal - Goal value
	 * @returns {number} Progress percentage (0-100)
	 */
	calculateProgress: function (current, goal) {
		if (!goal || goal === 0) return 0;
		return Math.min(100, Math.round((current / goal) * 100));
	},

	/**
	 * Format distance based on units
	 * @param {number} meters - Distance in meters
	 * @returns {string} Formatted distance
	 */
	formatDistance: function (meters) {
		if (this.config.units.distance === "mi") {
			const miles = meters / 1609.34;
			return `${miles.toFixed(1)} mi`;
		}
		const km = meters / 1000;
		return `${km.toFixed(1)} km`;
	},

	/**
	 * Format large numbers with commas
	 * @param {number} num - Number to format
	 * @returns {string} Formatted number
	 */
	formatNumber: function (num) {
		return num.toLocaleString();
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `fitness-module${this.config.compactMode ? " compact" : ""}`;

		// Error state
		if (this.error) {
			wrapper.innerHTML = `
				<div class="fitness-error">
					<i class="fa fa-exclamation-triangle"></i>
					<span>${this.error}</span>
				</div>
			`;
			return wrapper;
		}

		// Activity rings (Apple-style)
		if (this.config.showRings) {
			wrapper.appendChild(this.renderRings());
		}

		// Metrics grid
		wrapper.appendChild(this.renderMetrics());

		// Heart rate
		if (this.config.showHeartRate && this.data.heartRate) {
			wrapper.appendChild(this.renderHeartRate());
		}

		// Sleep
		if (this.config.showSleep && this.data.sleep) {
			wrapper.appendChild(this.renderSleep());
		}

		// Week summary
		if (this.config.showWeekSummary && this.data.weekData.length > 0) {
			wrapper.appendChild(this.renderWeekSummary());
		}

		return wrapper;
	},

	/**
	 * Render activity rings (Apple-style)
	 * @returns {HTMLElement} Rings element
	 */
	renderRings: function () {
		const container = document.createElement("div");
		container.className = "activity-rings";

		const moveProgress = this.calculateProgress(this.data.calories, this.goals.calories);
		const exerciseProgress = this.calculateProgress(this.data.activeMinutes, this.goals.activeMinutes);
		const standProgress = this.calculateProgress(this.data.steps, this.goals.steps);

		container.innerHTML = `
			<svg viewBox="0 0 100 100" class="rings-svg">
				<!-- Background rings -->
				<circle cx="50" cy="50" r="45" class="ring-bg" />
				<circle cx="50" cy="50" r="35" class="ring-bg" />
				<circle cx="50" cy="50" r="25" class="ring-bg" />

				<!-- Progress rings -->
				<circle cx="50" cy="50" r="45" class="ring-progress move"
					style="stroke-dasharray: ${(moveProgress * 283) / 100} 283" />
				<circle cx="50" cy="50" r="35" class="ring-progress exercise"
					style="stroke-dasharray: ${(exerciseProgress * 220) / 100} 220" />
				<circle cx="50" cy="50" r="25" class="ring-progress stand"
					style="stroke-dasharray: ${(standProgress * 157) / 100} 157" />
			</svg>
			<div class="rings-legend">
				<div class="legend-item move">
					<span class="legend-color"></span>
					<span class="legend-label">Move</span>
					<span class="legend-value">${this.data.calories} cal</span>
				</div>
				<div class="legend-item exercise">
					<span class="legend-color"></span>
					<span class="legend-label">Exercise</span>
					<span class="legend-value">${this.data.activeMinutes} min</span>
				</div>
				<div class="legend-item stand">
					<span class="legend-color"></span>
					<span class="legend-label">Steps</span>
					<span class="legend-value">${this.formatNumber(this.data.steps)}</span>
				</div>
			</div>
		`;

		return container;
	},

	/**
	 * Render metrics grid
	 * @returns {HTMLElement} Metrics element
	 */
	renderMetrics: function () {
		const container = document.createElement("div");
		container.className = "metrics-grid";

		const metricsConfig = {
			steps: {
				icon: "fa-shoe-prints",
				label: "Steps",
				value: this.formatNumber(this.data.steps),
				goal: this.goals.steps,
				current: this.data.steps
			},
			distance: {
				icon: "fa-route",
				label: "Distance",
				value: this.formatDistance(this.data.distance),
				goal: this.goals.distance * 1000,
				current: this.data.distance
			},
			calories: {
				icon: "fa-fire",
				label: "Calories",
				value: `${this.data.calories}`,
				goal: this.goals.calories,
				current: this.data.calories
			},
			activeMinutes: {
				icon: "fa-heart-pulse",
				label: "Active",
				value: `${this.data.activeMinutes} min`,
				goal: this.goals.activeMinutes,
				current: this.data.activeMinutes
			},
			floors: {
				icon: "fa-stairs",
				label: "Floors",
				value: `${this.data.floors}`,
				goal: this.goals.floors,
				current: this.data.floors
			}
		};

		for (const metric of this.config.metrics) {
			const config = metricsConfig[metric];
			if (!config) continue;

			const progress = this.calculateProgress(config.current, config.goal);

			const item = document.createElement("div");
			item.className = "metric-item";
			item.innerHTML = `
				<div class="metric-icon">
					<i class="fa ${config.icon}"></i>
				</div>
				<div class="metric-info">
					<div class="metric-value">${config.value}</div>
					<div class="metric-label">${config.label}</div>
				</div>
				${
					this.config.showGoals
						? `
					<div class="metric-progress">
						<div class="progress-bar">
							<div class="progress-fill" style="width: ${progress}%"></div>
						</div>
						<span class="progress-text">${progress}%</span>
					</div>
				`
						: ""
				}
			`;

			container.appendChild(item);
		}

		return container;
	},

	/**
	 * Render heart rate section
	 * @returns {HTMLElement} Heart rate element
	 */
	renderHeartRate: function () {
		const container = document.createElement("div");
		container.className = "heart-rate-section";

		container.innerHTML = `
			<div class="heart-rate-current">
				<i class="fa fa-heart heart-icon"></i>
				<span class="heart-value">${this.data.heartRate.current || "--"}</span>
				<span class="heart-unit">BPM</span>
			</div>
			${
				this.data.heartRate.resting
					? `
				<div class="heart-rate-resting">
					Resting: ${this.data.heartRate.resting} BPM
				</div>
			`
					: ""
			}
		`;

		return container;
	},

	/**
	 * Render sleep section
	 * @returns {HTMLElement} Sleep element
	 */
	renderSleep: function () {
		const container = document.createElement("div");
		container.className = "sleep-section";

		const sleep = this.data.sleep;
		const totalHours = Math.floor(sleep.duration / 60);
		const totalMins = sleep.duration % 60;

		container.innerHTML = `
			<div class="sleep-header">
				<i class="fa fa-moon"></i>
				<span>Last Night's Sleep</span>
			</div>
			<div class="sleep-duration">
				<span class="sleep-hours">${totalHours}</span>
				<span class="sleep-unit">hr</span>
				<span class="sleep-mins">${totalMins}</span>
				<span class="sleep-unit">min</span>
			</div>
			${
				sleep.quality
					? `
				<div class="sleep-quality">
					Quality: ${sleep.quality}
				</div>
			`
					: ""
			}
		`;

		return container;
	},

	/**
	 * Render week summary chart
	 * @returns {HTMLElement} Week summary element
	 */
	renderWeekSummary: function () {
		const container = document.createElement("div");
		container.className = "week-summary";

		const days = ["S", "M", "T", "W", "T", "F", "S"];
		const maxSteps = Math.max(...this.data.weekData.map((d) => d.steps), this.goals.steps);

		let barsHTML = "";
		for (let i = 0; i < 7; i++) {
			const dayData = this.data.weekData[i] || { steps: 0 };
			const height = (dayData.steps / maxSteps) * 100;
			const isToday = i === new Date().getDay();
			const metGoal = dayData.steps >= this.goals.steps;

			barsHTML += `
				<div class="week-day ${isToday ? "today" : ""} ${metGoal ? "goal-met" : ""}">
					<div class="day-bar-container">
						<div class="day-bar" style="height: ${height}%"></div>
					</div>
					<div class="day-label">${days[i]}</div>
				</div>
			`;
		}

		container.innerHTML = `
			<div class="week-header">This Week</div>
			<div class="week-bars">${barsHTML}</div>
		`;

		return container;
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		if (notification === "FITNESS_REFRESH") {
			this.sendSocketNotification("FITNESS_REFRESH", {
				provider: this.config.provider,
				config: this.getProviderConfig()
			});
		}
	}
});
