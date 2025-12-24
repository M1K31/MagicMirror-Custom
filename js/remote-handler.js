/**
 * Remote Control Handler for MagicMirror
 *
 * Handles remote actions from mobile apps and API calls.
 * Listens for REMOTE_ACTION events via Socket.IO and executes them.
 */

/* global Log, MM, io */

const RemoteHandler = {
	/**
	 * Initialize remote control handling.
	 */
	init () {
		Log.info("[RemoteHandler] Initializing remote control handler");

		// Listen for remote actions from Socket.IO
		if (typeof io !== "undefined") {
			const socket = io();
			socket.on("REMOTE_ACTION", (data) => this.handleAction(data));
			Log.info("[RemoteHandler] Socket.IO connection established");
		}

		// Also listen for keyboard shortcuts
		this.initKeyboardShortcuts();
	},

	/**
	 * Handle remote action
	 * @param {object} data - Action data
	 */
	handleAction(data) {
		Log.info(`[RemoteHandler] Received action: ${data.action}`);

		switch (data.action) {
			case "SHOW_MODULE":
				this.showModule(data.module);
				break;

			case "HIDE_MODULE":
				this.hideModule(data.module);
				break;

			case "REFRESH_MODULE":
				this.refreshModule(data.module);
				break;

			case "UPDATE_CONFIG":
				this.updateModuleConfig(data.module, data.config);
				break;

			case "UPDATE_DISPLAY":
				this.updateDisplay(data.settings);
				break;

			case "REFRESH_PAGE":
				this.refreshPage();
				break;

			case "SCREENSHOT":
				this.captureScreenshot();
				break;

			case "SHOW_ALERT":
				this.showAlert(data.alert);
				break;

			case "HIDE_ALERT":
				this.hideAlert();
				break;

			case "SERVICE_UPDATED":
				this.serviceUpdated(data.service, data.config);
				break;

			case "TEST_SERVICE":
				this.testService(data.service, data.config);
				break;

			case "CUSTOM_COMMAND":
				this.customCommand(data.command, data.payload);
				break;

			case "RESTART":
				this.restart();
				break;

			default:
				Log.warn(`[RemoteHandler] Unknown action: ${data.action}`);
		}
	},

	/**
	 * Show a module
	 */
	showModule(moduleName) {
		MM.getModules().enumerate((module) => {
			if (module.name === moduleName) {
				module.show(1000);
				Log.info(`[RemoteHandler] Showing module: ${moduleName}`);
			}
		});
	},

	/**
	 * Hide a module
	 */
	hideModule(moduleName) {
		MM.getModules().enumerate((module) => {
			if (module.name === moduleName) {
				module.hide(1000);
				Log.info(`[RemoteHandler] Hiding module: ${moduleName}`);
			}
		});
	},

	/**
	 * Refresh a module
	 */
	refreshModule(moduleName) {
		MM.getModules().enumerate((module) => {
			if (module.name === moduleName) {
				module.updateDom();
				Log.info(`[RemoteHandler] Refreshed module: ${moduleName}`);
			}
		});
	},

	/**
	 * Update module configuration
	 */
	updateModuleConfig(moduleName, newConfig) {
		MM.getModules().enumerate((module) => {
			if (module.name === moduleName) {
				Object.assign(module.config, newConfig);
				module.updateDom();
				Log.info(`[RemoteHandler] Updated config for: ${moduleName}`);
			}
		});
	},

	/**
	 * Update display settings
	 */
	updateDisplay(settings) {
		if (settings.brightness !== undefined) {
			document.body.style.filter = `brightness(${settings.brightness / 100})`;
		}

		if (settings.zoom !== undefined) {
			document.body.style.zoom = `${settings.zoom}%`;
		}

		if (settings.colorScheme !== undefined) {
			document.body.dataset.colorScheme = settings.colorScheme;
			// Could toggle dark/light mode here
		}

		if (settings.screenOn === false) {
			document.body.style.opacity = "0";
		} else if (settings.screenOn === true) {
			document.body.style.opacity = "1";
		}

		Log.info("[RemoteHandler] Display settings updated");
	},

	/**
	 * Refresh the entire page
	 */
	refreshPage() {
		Log.info("[RemoteHandler] Refreshing page");
		window.location.reload();
	},

	/**
	 * Capture screenshot (if supported)
	 */
	captureScreenshot() {
		// This would require html2canvas or similar library
		Log.info("[RemoteHandler] Screenshot requested (not implemented)");

		// Notify that screenshot was attempted
		this.showAlert({
			title: "Screenshot",
			message: "Screenshot capture not yet implemented",
			timer: 3000
		});
	},

	/**
	 * Show alert notification
	 */
	showAlert(alert) {
		MM.sendNotification("SHOW_ALERT", {
			type: alert.type || "notification",
			title: alert.title,
			message: alert.message,
			timer: alert.timer || 5000
		});
	},

	/**
	 * Hide current alert
	 */
	hideAlert() {
		MM.sendNotification("HIDE_ALERT");
	},

	/**
	 * Handle service configuration update
	 */
	serviceUpdated(service, config) {
		MM.sendNotification("SERVICE_UPDATED", { service, config });
		Log.info(`[RemoteHandler] Service updated: ${service}`);
	},

	/**
	 * Test service connection
	 */
	testService(service, config) {
		MM.sendNotification("TEST_SERVICE", { service, config });
		Log.info(`[RemoteHandler] Testing service: ${service}`);
	},

	/**
	 * Execute custom command
	 */
	customCommand(command, payload) {
		MM.sendNotification(command, payload);
		Log.info(`[RemoteHandler] Custom command: ${command}`);
	},

	/**
	 * Restart MagicMirror
	 */
	restart() {
		Log.info("[RemoteHandler] Restart requested");
		this.showAlert({
			title: "Restarting",
			message: "MagicMirror is restarting...",
			timer: 3000
		});

		setTimeout(() => {
			window.location.reload();
		}, 2000);
	},

	/**
	 * Initialize keyboard shortcuts
	 */
	initKeyboardShortcuts() {
		document.addEventListener("keydown", (e) => {
			// Only process if not in an input field
			if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
				return;
			}

			// Escape - Close any open modals/settings
			if (e.key === "Escape") {
				MM.sendNotification("KEYPRESS_ESCAPE");
			}

			// F5 - Refresh
			if (e.key === "F5") {
				e.preventDefault();
				this.refreshPage();
			}

			// Ctrl+S - Open settings
			if (e.ctrlKey && e.key === "s") {
				e.preventDefault();
				MM.sendNotification("TOGGLE_SETTINGS");
			}

			// Arrow keys for navigation
			if (e.key === "ArrowLeft") {
				MM.sendNotification("KEYPRESS_LEFT");
			}
			if (e.key === "ArrowRight") {
				MM.sendNotification("KEYPRESS_RIGHT");
			}
			if (e.key === "ArrowUp") {
				MM.sendNotification("KEYPRESS_UP");
			}
			if (e.key === "ArrowDown") {
				MM.sendNotification("KEYPRESS_DOWN");
			}

			// Enter/Space for selection
			if (e.key === "Enter" || e.key === " ") {
				MM.sendNotification("KEYPRESS_SELECT");
			}
		});

		Log.info("[RemoteHandler] Keyboard shortcuts initialized");
	}
};

// Initialize when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => RemoteHandler.init());
} else {
	RemoteHandler.init();
}
