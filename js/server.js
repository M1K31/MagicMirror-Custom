const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const express = require("express");
const ipfilter = require("express-ipfilter").IpFilter;
const helmet = require("helmet");
const socketio = require("socket.io");
const Log = require("logger");
const {
	cors,
	getConfig,
	getHtml,
	getVersion,
	getStartup,
	getEnvVars
} = require("./server_functions");
const { createApiRouter, logApiToken, generateToken } = require("./api");

const vendor = require(`${__dirname}/vendor`);

/**
 * Server
 * @param {object} config The MM config
 * @class
 */
function Server (config) {
	const app = express();
	const port = process.env.MM_PORT || config.port;
	const serverSockets = new Set();
	let server = null;

	/**
	 * Opens the server for incoming connections
	 * @returns {Promise} A promise that is resolved when the server listens to connections
	 */
	this.open = function () {
		return new Promise((resolve) => {
			if (config.useHttps) {
				const options = {
					key: fs.readFileSync(config.httpsPrivateKey),
					cert: fs.readFileSync(config.httpsCertificate)
				};
				server = https.Server(options, app);
			} else {
				server = http.Server(app);
			}
			const io = socketio(server, {
				cors: {
					// Build secure origin list based on config
					// By default, only allow localhost origins
					origin: function (origin, callback) {
						// Allow requests with no origin (like curl, or same-origin requests)
						if (!origin) return callback(null, true);
						
						// Build list of allowed origins
						const allowedOrigins = [];
						const address = config.address || "localhost";
						
						// Add common localhost origins
						allowedOrigins.push(`http://localhost:${port}`);
						allowedOrigins.push(`http://127.0.0.1:${port}`);
						allowedOrigins.push(`https://localhost:${port}`);
						allowedOrigins.push(`https://127.0.0.1:${port}`);
						
						// Add configured address
						if (address !== "localhost" && address !== "127.0.0.1" && address !== "0.0.0.0") {
							allowedOrigins.push(`http://${address}:${port}`);
							allowedOrigins.push(`https://${address}:${port}`);
						}
						
						// If address is 0.0.0.0, it's bound to all interfaces
						// In production, consider adding config.allowedCorsOrigins array
						if (config.corsOrigins && Array.isArray(config.corsOrigins)) {
							allowedOrigins.push(...config.corsOrigins);
						}
						
						if (allowedOrigins.includes(origin)) {
							callback(null, true);
						} else {
							Log.warn(`Blocked CORS request from origin: ${origin}`);
							callback(new Error("Not allowed by CORS"));
						}
					},
					credentials: true
				},
				allowEIO3: true
			});

			server.on("connection", (socket) => {
				serverSockets.add(socket);
				socket.on("close", () => {
					serverSockets.delete(socket);
				});
			});

			Log.log(`Starting server on port ${port} ... `);
			server.listen(port, config.address || "localhost");

			if (
				config.ipWhitelist instanceof Array
				&& config.ipWhitelist.length === 0
			) {
				Log.warn(
					"You're using a full whitelist configuration to allow for all IPs"
				);
			}

			app.use(function (req, res, next) {
				ipfilter(config.ipWhitelist, {
					mode: config.ipWhitelist.length === 0 ? "deny" : "allow",
					log: false
				})(req, res, function (err) {
					if (err === undefined) {
						// Set CORS header based on request origin for security
						// Only allow origins that would pass Socket.IO CORS check
						const origin = req.headers.origin;
						if (origin) {
							const allowedOrigins = [];
							const address = config.address || "localhost";
							
							allowedOrigins.push(`http://localhost:${port}`);
							allowedOrigins.push(`http://127.0.0.1:${port}`);
							allowedOrigins.push(`https://localhost:${port}`);
							allowedOrigins.push(`https://127.0.0.1:${port}`);
							
							if (address !== "localhost" && address !== "127.0.0.1" && address !== "0.0.0.0") {
								allowedOrigins.push(`http://${address}:${port}`);
								allowedOrigins.push(`https://${address}:${port}`);
							}
							
							if (config.corsOrigins && Array.isArray(config.corsOrigins)) {
								allowedOrigins.push(...config.corsOrigins);
							}
							
							if (allowedOrigins.includes(origin)) {
								res.header("Access-Control-Allow-Origin", origin);
								res.header("Access-Control-Allow-Credentials", "true");
							}
							// If origin not allowed, don't set CORS headers at all
						}
						return next();
					}
					Log.log(err.message);
					res
						.status(403)
						.send(
							"This device is not allowed to access your mirror. <br> Please check your config.js or config.js.sample to change this."
						);
				});
			});

			app.use(helmet(config.httpHeaders));
			app.use("/js", express.static(__dirname));

			let directories = [
				"/config",
				"/css",
				"/modules",
				"/node_modules/animate.css",
				"/node_modules/@fontsource",
				"/node_modules/@fortawesome",
				"/translations",
				"/tests/configs",
				"/tests/mocks"
			];
			for (const [key, value] of Object.entries(vendor)) {
				const dirArr = value.split("/");
				if (dirArr[0] === "node_modules") directories.push(`/${dirArr[0]}/${dirArr[1]}`);
			}
			const uniqDirs = [...new Set(directories)];
			for (const directory of uniqDirs) {
				app.use(
					directory,
					express.static(path.resolve(global.root_path + directory))
				);
			}

			app.get("/cors", async (req, res) => await cors(req, res));

			app.get("/version", (req, res) => getVersion(req, res));

			app.get("/config", (req, res) => getConfig(req, res));

			app.get("/startup", (req, res) => getStartup(req, res));

			app.get("/env", (req, res) => getEnvVars(req, res));

			app.get("/", (req, res) => getHtml(req, res));

			// REST API for mobile apps and remote control
			const apiPrefix = config.api?.prefix || "/api/v1";
			const apiToken = config.api?.token || generateToken();
			app.use(apiPrefix, createApiRouter(config, io));
			
			// Log API token on first startup for setup and save to file for Settings module
			if (config.api?.enabled !== false) {
				logApiToken(apiToken);
				// Save token to file so Settings module can display it
				const tokenFilePath = path.join(__dirname, "..", "config", ".api_token");
				const tokenData = JSON.stringify({
					token: apiToken,
					host: `${config.address || "localhost"}:${port}`,
					prefix: apiPrefix,
					createdAt: new Date().toISOString()
				});
				fs.writeFileSync(tokenFilePath, tokenData);
				Log.info("[API] Token saved for companion app setup");
			}

			server.on("listening", () => {
				resolve({
					app,
					io
				});
			});
		});
	};

	/**
	 * Closes the server and destroys all lingering connections to it.
	 * @returns {Promise} A promise that resolves when server has successfully shut down
	 */
	this.close = function () {
		return new Promise((resolve) => {
			for (const socket of serverSockets.values()) {
				socket.destroy();
			}
			server.close(resolve);
		});
	};
}

module.exports = Server;
