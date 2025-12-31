/**
 * MagicMirror Maintenance Module - Node Helper
 *
 * Handles server-side maintenance operations:
 * - Process restart
 * - Memory monitoring
 * - System health checks
 *
 * Copyright (c) 2025 Mikel Smart
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.config = null;
		this.memoryCheckInterval = null;
		this.restartLockFile = path.join(__dirname, ".restart_lock");
	},

	/**
	 * Handle socket notifications from frontend
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "MAINTENANCE_INIT":
				this.config = payload;
				this.startMemoryMonitoring();
				this.checkRestartLock();
				break;

			case "GET_MEMORY_STATS":
				this.sendMemoryStats();
				break;

			case "PERFORM_RESTART":
				this.performRestart(payload);
				break;
		}
	},

	/**
	 * Start memory monitoring
	 */
	startMemoryMonitoring: function () {
		const self = this;

		// Clear any existing interval
		if (this.memoryCheckInterval) {
			clearInterval(this.memoryCheckInterval);
		}

		// Check memory every minute
		this.memoryCheckInterval = setInterval(() => {
			self.sendMemoryStats();
		}, 60000);

		// Initial check
		this.sendMemoryStats();
	},

	/**
	 * Send memory statistics to frontend
	 */
	sendMemoryStats: function () {
		const memUsage = process.memoryUsage();

		this.sendSocketNotification("MEMORY_STATS", {
			rss: memUsage.rss,
			heapTotal: memUsage.heapTotal,
			heapUsed: memUsage.heapUsed,
			external: memUsage.external,
			arrayBuffers: memUsage.arrayBuffers,
			timestamp: Date.now()
		});

		// Log if memory is high
		const heapMB = memUsage.heapUsed / 1024 / 1024;
		if (heapMB > 200) {
			Log.warn(`[${this.name}] Memory usage: ${heapMB.toFixed(0)}MB`);
		}
	},

	/**
	 * Check for restart lock file (indicates successful restart)
	 */
	checkRestartLock: function () {
		if (fs.existsSync(this.restartLockFile)) {
			try {
				const lockData = JSON.parse(fs.readFileSync(this.restartLockFile, "utf8"));
				const restartTime = new Date(lockData.timestamp);
				const now = new Date();
				const minutesAgo = Math.round((now - restartTime) / 1000 / 60);

				Log.info(
					`[${this.name}] Restart completed (initiated ${minutesAgo} minutes ago, reason: ${lockData.reason})`
				);

				// Remove lock file
				fs.unlinkSync(this.restartLockFile);
			} catch (error) {
				Log.warn(`[${this.name}] Could not read restart lock: ${error.message}`);
				fs.unlinkSync(this.restartLockFile);
			}
		}
	},

	/**
	 * Perform restart
	 */
	performRestart: function (payload) {
		Log.info(`[${this.name}] Performing restart (reason: ${payload.reason})`);

		// Create restart lock file
		try {
			fs.writeFileSync(
				this.restartLockFile,
				JSON.stringify({
					reason: payload.reason,
					timestamp: new Date().toISOString()
				})
			);
		} catch (error) {
			Log.warn(`[${this.name}] Could not create restart lock: ${error.message}`);
		}

		// Notify frontend
		this.sendSocketNotification("RESTART_CONFIRMED", {
			reason: payload.reason,
			timestamp: Date.now()
		});

		// Determine restart method
		const mmPath = path.resolve(__dirname, "..", "..");

		// Check if running under PM2
		if (process.env.PM2_HOME || process.env.pm_id) {
			Log.info(`[${this.name}] Restarting via PM2`);
			exec("pm2 restart MagicMirror", (error) => {
				if (error) {
					Log.error(`[${this.name}] PM2 restart failed: ${error.message}`);
					this.fallbackRestart(mmPath);
				}
			});
		} else {
			// Standard restart using the restart script
			this.scriptRestart(mmPath);
		}
	},

	/**
	 * Restart using the restart script
	 */
	scriptRestart: function (mmPath) {
		const restartScript = path.join(mmPath, "restart-mirror.sh");

		if (fs.existsSync(restartScript)) {
			Log.info(`[${this.name}] Restarting via restart-mirror.sh`);

			// Execute restart script in background
			exec(`"${restartScript}"`, { cwd: mmPath }, (error) => {
				if (error) {
					Log.error(`[${this.name}] Restart script failed: ${error.message}`);
					this.fallbackRestart(mmPath);
				}
			});

			// Exit current process after a short delay
			setTimeout(() => {
				Log.info(`[${this.name}] Exiting for restart...`);
				process.exit(0);
			}, 1000);
		} else {
			Log.warn(`[${this.name}] Restart script not found, using fallback`);
			this.fallbackRestart(mmPath);
		}
	},

	/**
	 * Fallback restart method
	 */
	fallbackRestart: function (mmPath) {
		Log.info(`[${this.name}] Using fallback restart method`);

		// Simply exit - the user's init system should restart the process
		// This works with systemd, Docker restart policies, etc.
		setTimeout(() => {
			Log.info(`[${this.name}] Exiting process for restart...`);
			process.exit(0);
		}, 500);
	},

	/**
	 * Stop the helper
	 */
	stop: function () {
		if (this.memoryCheckInterval) {
			clearInterval(this.memoryCheckInterval);
		}
	}
});
