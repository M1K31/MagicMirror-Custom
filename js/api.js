/**
 * MagicMirror REST API
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Provides RESTful API endpoints for mobile apps and external control.
 * Supports iOS, Android, and web-based remote control.
 *
 * Authentication: Bearer token (configured in config.js)
 *
 * @see https://github.com/M1K31/MagicMirror-Custom
 */

const express = require("express");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const Log = require("logger");

/**
 * API Router Factory
 * @param {object} config - MagicMirror configuration
 * @param {object} io - Socket.IO instance for real-time updates
 * @returns {express.Router} Express router with API endpoints
 */
function createApiRouter(config, io) {
	const router = express.Router();

	// API configuration
	const apiConfig = config.api || {};
	const apiEnabled = apiConfig.enabled !== false;
	const apiToken = apiConfig.token || generateToken();
	const apiPrefix = apiConfig.prefix || "/api/v1";

	if (!apiEnabled) {
		Log.info("[API] REST API disabled in config");
		return router;
	}

	Log.info(`[API] REST API enabled at ${apiPrefix}`);

	// Store for module states and settings
	let moduleStates = new Map();
	let displaySettings = {
		brightness: 100,
		zoom: 100,
		colorScheme: "dark",
		screenOn: true
	};

	// Middleware: JSON parsing
	router.use(express.json());

	// Middleware: Authentication
	router.use((req, res, next) => {
		// Skip auth for health check
		if (req.path === "/health") {
			return next();
		}

		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return res.status(401).json({
				success: false,
				error: "Missing or invalid authorization header"
			});
		}

		const token = authHeader.substring(7);
		if (token !== apiToken) {
			Log.warn(`[API] Invalid token attempt from ${req.ip}`);
			return res.status(403).json({
				success: false,
				error: "Invalid API token"
			});
		}

		next();
	});

	// Middleware: Request logging
	router.use((req, res, next) => {
		Log.info(`[API] ${req.method} ${req.path} from ${req.ip}`);
		next();
	});

	// ==================== Health & Info ====================

	/**
	 * GET /health - Health check (no auth required)
	 */
	router.get("/health", (req, res) => {
		res.json({
			success: true,
			status: "online",
			timestamp: new Date().toISOString()
		});
	});

	/**
	 * GET /info - System information
	 */
	router.get("/info", (req, res) => {
		res.json({
			success: true,
			data: {
				version: global.version || "2.32.0",
				platform: process.platform,
				nodeVersion: process.version,
				uptime: process.uptime(),
				memory: process.memoryUsage(),
				display: displaySettings
			}
		});
	});

	// ==================== Modules ====================

	/**
	 * GET /modules - List all modules
	 */
	router.get("/modules", (req, res) => {
		const modules = config.modules.map((mod, index) => ({
			id: index,
			name: mod.module,
			position: mod.position,
			header: mod.header,
			hidden: moduleStates.get(mod.module)?.hidden || false,
			config: mod.config ? Object.keys(mod.config) : []
		}));

		res.json({
			success: true,
			data: modules
		});
	});

	/**
	 * GET /modules/:name - Get module details
	 */
	router.get("/modules/:name", (req, res) => {
		const mod = config.modules.find((m) => m.module === req.params.name);
		if (!mod) {
			return res.status(404).json({
				success: false,
				error: "Module not found"
			});
		}

		res.json({
			success: true,
			data: {
				name: mod.module,
				position: mod.position,
				header: mod.header,
				config: mod.config,
				hidden: moduleStates.get(mod.module)?.hidden || false
			}
		});
	});

	/**
	 * POST /modules/:name/show - Show a module
	 */
	router.post("/modules/:name/show", (req, res) => {
		const moduleName = req.params.name;
		moduleStates.set(moduleName, { hidden: false });

		// Broadcast to connected clients
		io.emit("REMOTE_ACTION", {
			action: "SHOW_MODULE",
			module: moduleName
		});

		res.json({
			success: true,
			message: `Module ${moduleName} shown`
		});
	});

	/**
	 * POST /modules/:name/hide - Hide a module
	 */
	router.post("/modules/:name/hide", (req, res) => {
		const moduleName = req.params.name;
		moduleStates.set(moduleName, { hidden: true });

		io.emit("REMOTE_ACTION", {
			action: "HIDE_MODULE",
			module: moduleName
		});

		res.json({
			success: true,
			message: `Module ${moduleName} hidden`
		});
	});

	/**
	 * POST /modules/:name/refresh - Refresh a module
	 */
	router.post("/modules/:name/refresh", (req, res) => {
		const moduleName = req.params.name;

		io.emit("REMOTE_ACTION", {
			action: "REFRESH_MODULE",
			module: moduleName
		});

		res.json({
			success: true,
			message: `Module ${moduleName} refreshed`
		});
	});

	/**
	 * PUT /modules/:name/config - Update module config
	 */
	router.put("/modules/:name/config", async (req, res) => {
		const moduleName = req.params.name;
		const newConfig = req.body;

		if (!newConfig || typeof newConfig !== "object") {
			return res.status(400).json({
				success: false,
				error: "Invalid configuration object"
			});
		}

		// Broadcast config update
		io.emit("REMOTE_ACTION", {
			action: "UPDATE_CONFIG",
			module: moduleName,
			config: newConfig
		});

		res.json({
			success: true,
			message: `Module ${moduleName} config updated`
		});
	});

	// ==================== Display ====================

	/**
	 * GET /display - Get display settings
	 */
	router.get("/display", (req, res) => {
		res.json({
			success: true,
			data: displaySettings
		});
	});

	/**
	 * PUT /display - Update display settings
	 */
	router.put("/display", (req, res) => {
		const { brightness, zoom, colorScheme, screenOn } = req.body;

		if (brightness !== undefined) {
			displaySettings.brightness = Math.max(0, Math.min(100, brightness));
		}
		if (zoom !== undefined) {
			displaySettings.zoom = Math.max(50, Math.min(200, zoom));
		}
		if (colorScheme !== undefined) {
			displaySettings.colorScheme = colorScheme;
		}
		if (screenOn !== undefined) {
			displaySettings.screenOn = screenOn;
		}

		io.emit("REMOTE_ACTION", {
			action: "UPDATE_DISPLAY",
			settings: displaySettings
		});

		res.json({
			success: true,
			data: displaySettings
		});
	});

	/**
	 * POST /display/refresh - Refresh the entire display
	 */
	router.post("/display/refresh", (req, res) => {
		io.emit("REMOTE_ACTION", {
			action: "REFRESH_PAGE"
		});

		res.json({
			success: true,
			message: "Display refresh triggered"
		});
	});

	/**
	 * POST /display/screenshot - Capture screenshot (if supported)
	 */
	router.post("/display/screenshot", (req, res) => {
		io.emit("REMOTE_ACTION", {
			action: "SCREENSHOT"
		});

		res.json({
			success: true,
			message: "Screenshot request sent"
		});
	});

	// ==================== Alerts & Notifications ====================

	/**
	 * POST /alert - Show an alert on the display
	 */
	router.post("/alert", (req, res) => {
		const { title, message, type = "notification", timer = 5000 } = req.body;

		if (!message) {
			return res.status(400).json({
				success: false,
				error: "Message is required"
			});
		}

		io.emit("REMOTE_ACTION", {
			action: "SHOW_ALERT",
			alert: { title, message, type, timer }
		});

		res.json({
			success: true,
			message: "Alert sent"
		});
	});

	/**
	 * DELETE /alert - Dismiss current alert
	 */
	router.delete("/alert", (req, res) => {
		io.emit("REMOTE_ACTION", {
			action: "HIDE_ALERT"
		});

		res.json({
			success: true,
			message: "Alert dismissed"
		});
	});

	// ==================== Services ====================

	/**
	 * GET /services - Get service connection status
	 */
	router.get("/services", (req, res) => {
		res.json({
			success: true,
			data: {
				openeye: { connected: false },
				homeassistant: { connected: false },
				spotify: { connected: false },
				googlecalendar: { connected: false },
				openweathermap: { connected: false }
			}
		});
	});

	/**
	 * PUT /services/:name - Update service configuration
	 */
	router.put("/services/:name", async (req, res) => {
		const serviceName = req.params.name;
		const serviceConfig = req.body;

		try {
			// Save to secrets file
			const secretsPath = path.join(global.root_path, "config", "secrets.json");
			let secrets = {};

			try {
				const data = await fs.readFile(secretsPath, "utf8");
				secrets = JSON.parse(data);
			} catch (e) {
				// File doesn't exist yet
			}

			secrets[serviceName] = {
				...secrets[serviceName],
				...serviceConfig,
				updatedAt: new Date().toISOString()
			};

			await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));

			// Notify settings module
			io.emit("REMOTE_ACTION", {
				action: "SERVICE_UPDATED",
				service: serviceName,
				config: serviceConfig
			});

			res.json({
				success: true,
				message: `Service ${serviceName} updated`
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error.message
			});
		}
	});

	/**
	 * POST /services/:name/test - Test service connection
	 */
	router.post("/services/:name/test", (req, res) => {
		const serviceName = req.params.name;

		io.emit("REMOTE_ACTION", {
			action: "TEST_SERVICE",
			service: serviceName,
			config: req.body
		});

		res.json({
			success: true,
			message: `Testing ${serviceName} connection`
		});
	});

	// ==================== Commands ====================

	/**
	 * POST /command - Send a custom command
	 */
	router.post("/command", (req, res) => {
		const { command, payload } = req.body;

		if (!command) {
			return res.status(400).json({
				success: false,
				error: "Command is required"
			});
		}

		io.emit("REMOTE_ACTION", {
			action: "CUSTOM_COMMAND",
			command,
			payload
		});

		res.json({
			success: true,
			message: `Command ${command} sent`
		});
	});

	/**
	 * POST /shutdown - Shutdown MagicMirror
	 */
	router.post("/shutdown", (req, res) => {
		res.json({
			success: true,
			message: "Shutdown initiated"
		});

		setTimeout(() => {
			process.exit(0);
		}, 1000);
	});

	/**
	 * POST /restart - Restart MagicMirror
	 */
	router.post("/restart", (req, res) => {
		io.emit("REMOTE_ACTION", {
			action: "RESTART"
		});

		res.json({
			success: true,
			message: "Restart initiated"
		});

		// Use PM2 or similar for actual restart
		setTimeout(() => {
			process.exit(0);
		}, 1000);
	});

	return router;
}

/**
 * Generate a random API token
 */
function generateToken() {
	return crypto.randomBytes(32).toString("hex");
}

/**
 * Print API token for initial setup
 */
function logApiToken(token) {
	Log.info("═══════════════════════════════════════════════════════════");
	Log.info("  MagicMirror API Token (save this for mobile app setup):");
	Log.info(`  ${token}`);
	Log.info("═══════════════════════════════════════════════════════════");
}

module.exports = {
	createApiRouter,
	generateToken,
	logApiToken
};
