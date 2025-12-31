/**
 * MagicMirror Maintenance Module
 *
 * Scheduled maintenance and health monitoring:
 * - Automatic restart at configured time
 * - Memory monitoring and cleanup
 * - Process health checks
 * - Graceful degradation
 *
 * Copyright (c) 2025 Mikel Smart
 */

/* global Log, Module */

Module.register("maintenance", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Scheduled maintenance time (24-hour format, e.g., "03:00")
		maintenanceTime: "03:00",

		// Enable automatic restart at maintenance time
		autoRestart: true,

		// Memory threshold (MB) - warn if exceeded
		memoryWarningThreshold: 500,

		// Memory threshold (MB) - restart if exceeded
		memoryRestartThreshold: 1000,

		// Check interval (ms)
		checkInterval: 60000, // 1 minute

		// Enable memory optimization (garbage collection hints)
		enableMemoryOptimization: true,

		// Show maintenance status in UI (for debugging)
		showStatus: false,

		// Grace period before restart (ms) - allows saving state
		restartGracePeriod: 5000,

		// Days to run maintenance (0=Sunday, 1=Monday, etc.)
		// Empty array = every day
		maintenanceDays: []
	},

	/**
	 * Module start
	 */
	start: function () {
		Log.info(`[${this.name}] Starting maintenance module`);

		this.maintenanceScheduled = false;
		this.lastMemoryCheck = null;
		this.memoryHistory = [];
		this.startTime = Date.now();

		// Start monitoring
		this.scheduleMaintenanceCheck();
		this.startHealthMonitoring();

		// Notify node_helper
		this.sendSocketNotification("MAINTENANCE_INIT", this.config);
	},

	/**
	 * Schedule maintenance check
	 */
	scheduleMaintenanceCheck: function () {
		const self = this;

		// Check every minute if it's maintenance time
		setInterval(() => {
			self.checkMaintenanceTime();
		}, 60000);

		// Also check immediately
		this.checkMaintenanceTime();
	},

	/**
	 * Check if it's time for maintenance
	 */
	checkMaintenanceTime: function () {
		if (!this.config.autoRestart) return;
		if (this.maintenanceScheduled) return;

		const now = new Date();
		const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

		// Check if today is a maintenance day
		if (this.config.maintenanceDays.length > 0) {
			if (!this.config.maintenanceDays.includes(now.getDay())) {
				return;
			}
		}

		if (currentTime === this.config.maintenanceTime) {
			Log.info(`[${this.name}] Maintenance time reached: ${currentTime}`);
			this.initiateRestart("scheduled");
		}
	},

	/**
	 * Start health monitoring
	 */
	startHealthMonitoring: function () {
		const self = this;

		setInterval(() => {
			self.checkHealth();
		}, this.config.checkInterval);

		// Initial check
		this.checkHealth();
	},

	/**
	 * Check system health
	 */
	checkHealth: function () {
		// Request memory stats from node_helper
		this.sendSocketNotification("GET_MEMORY_STATS");

		// Run memory optimization if enabled
		if (this.config.enableMemoryOptimization) {
			this.optimizeMemory();
		}
	},

	/**
	 * Optimize memory usage
	 */
	optimizeMemory: function () {
		// Clear any cached data that can be regenerated
		this.clearExpiredCaches();

		// Hint to garbage collector (if available)
		if (typeof gc === "function") {
			gc();
		}

		// Clear image cache for modules that support it
		this.sendNotification("CLEAR_IMAGE_CACHE");

		// Log optimization
		const uptime = Math.round((Date.now() - this.startTime) / 1000 / 60);
		Log.debug(`[${this.name}] Memory optimization run (uptime: ${uptime} minutes)`);
	},

	/**
	 * Clear expired caches
	 */
	clearExpiredCaches: function () {
		// Clear old notification history
		if (window.notificationHistory && window.notificationHistory.length > 100) {
			window.notificationHistory = window.notificationHistory.slice(-50);
		}

		// Clear old module data caches
		this.sendNotification("MAINTENANCE_CLEAR_CACHES");
	},

	/**
	 * Handle socket notifications from node_helper
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "MEMORY_STATS":
				this.handleMemoryStats(payload);
				break;

			case "RESTART_CONFIRMED":
				Log.info(`[${this.name}] Restart confirmed by node_helper`);
				break;

			case "MAINTENANCE_STATUS":
				this.lastStatus = payload;
				if (this.config.showStatus) {
					this.updateDom();
				}
				break;
		}
	},

	/**
	 * Handle memory statistics
	 */
	handleMemoryStats: function (stats) {
		this.lastMemoryCheck = stats;
		this.memoryHistory.push({
			timestamp: Date.now(),
			heapUsed: stats.heapUsed
		});

		// Keep last hour of history
		const oneHourAgo = Date.now() - 3600000;
		this.memoryHistory = this.memoryHistory.filter((m) => m.timestamp > oneHourAgo);

		// Check thresholds
		const memoryMB = stats.heapUsed / 1024 / 1024;

		if (memoryMB > this.config.memoryRestartThreshold) {
			Log.warn(
				`[${this.name}] Memory threshold exceeded: ${memoryMB.toFixed(0)}MB > ${this.config.memoryRestartThreshold}MB`
			);
			this.initiateRestart("memory");
		} else if (memoryMB > this.config.memoryWarningThreshold) {
			Log.warn(
				`[${this.name}] Memory warning: ${memoryMB.toFixed(0)}MB > ${this.config.memoryWarningThreshold}MB`
			);
			// Aggressive memory optimization
			this.optimizeMemory();
		}

		// Update UI if showing status
		if (this.config.showStatus) {
			this.updateDom();
		}
	},

	/**
	 * Initiate restart
	 */
	initiateRestart: function (reason) {
		if (this.maintenanceScheduled) return;

		this.maintenanceScheduled = true;
		Log.info(`[${this.name}] Initiating restart (reason: ${reason})`);

		// Notify all modules
		this.sendNotification("MAINTENANCE_RESTART_PENDING", {
			reason: reason,
			gracePeriod: this.config.restartGracePeriod
		});

		// Show maintenance message
		this.sendNotification("SHOW_ALERT", {
			type: "notification",
			title: "System Maintenance",
			message: "Restarting in 5 seconds...",
			timer: this.config.restartGracePeriod
		});

		// Schedule restart
		setTimeout(() => {
			this.performRestart(reason);
		}, this.config.restartGracePeriod);
	},

	/**
	 * Perform the actual restart
	 */
	performRestart: function (reason) {
		Log.info(`[${this.name}] Performing restart...`);

		// Send restart command to node_helper
		this.sendSocketNotification("PERFORM_RESTART", {
			reason: reason,
			timestamp: Date.now()
		});
	},

	/**
	 * Get DOM content (if showStatus enabled)
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "maintenance-status";

		if (!this.config.showStatus) {
			wrapper.style.display = "none";
			return wrapper;
		}

		const uptime = Math.round((Date.now() - this.startTime) / 1000 / 60);
		const memory = this.lastMemoryCheck
			? (this.lastMemoryCheck.heapUsed / 1024 / 1024).toFixed(0)
			: "?";

		wrapper.innerHTML = `
			<div class="xsmall dimmed">
				<i class="fa fa-cog"></i>
				Uptime: ${uptime}m |
				Memory: ${memory}MB |
				Next: ${this.config.maintenanceTime}
			</div>
		`;

		return wrapper;
	},

	/**
	 * Handle notifications from other modules
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "MAINTENANCE_FORCE_RESTART":
				this.initiateRestart("manual");
				break;

			case "MAINTENANCE_GET_STATUS":
				this.sendNotification("MAINTENANCE_STATUS", {
					uptime: Date.now() - this.startTime,
					memory: this.lastMemoryCheck,
					nextMaintenance: this.config.maintenanceTime,
					autoRestart: this.config.autoRestart
				});
				break;
		}
	}
});
