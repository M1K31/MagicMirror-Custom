/**
 * Network Node Helper
 *
 * Copyright (c) 2025 Mikel Smart
 * Licensed under the MIT License
 *
 * Handles server-side network operations:
 * - ARP scanning for device discovery
 * - Speed tests
 * - Connectivity monitoring
 * - MAC vendor lookup
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const path = require("path");
const fs = require("fs");
const { exec, spawn } = require("child_process");
const os = require("os");

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.config = null;
		this.devices = new Map(); // MAC -> device info
		this.previousDevices = new Set(); // Track for new device detection
		this.scanInterval = null;
		this.speedTestInterval = null;
		this.connectivityInterval = null;
		this.knownDevicesPath = path.join(__dirname, ".known_devices.json");
		this.macVendorCache = new Map();
	},

	/**
	 * Handle socket notifications from frontend
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "NETWORK_INIT":
				this.initialize(payload);
				break;

			case "NETWORK_SCAN_NOW":
				this.scanNetwork();
				break;

			case "NETWORK_SPEED_TEST_NOW":
				this.runSpeedTest();
				break;

			case "NETWORK_SAVE_KNOWN_DEVICE":
				this.saveKnownDevice(payload);
				break;
		}
	},

	/**
	 * Initialize network monitoring
	 * @param {object} config - Configuration
	 */
	initialize: async function (config) {
		this.config = config;

		// Detect network interface and CIDR if auto
		if (config.networkInterface === "auto" || config.networkCIDR === "auto") {
			const networkInfo = this.detectNetworkInfo();
			if (config.networkInterface === "auto") {
				this.config.networkInterface = networkInfo.interface;
			}
			if (config.networkCIDR === "auto") {
				this.config.networkCIDR = networkInfo.cidr;
			}
		}

		Log.info(`[${this.name}] Network: ${this.config.networkInterface} (${this.config.networkCIDR})`);

		// Load known devices
		this.loadKnownDevices();

		// Start scanning
		await this.scanNetwork();

		// Set up intervals
		if (this.scanInterval) clearInterval(this.scanInterval);
		this.scanInterval = setInterval(() => this.scanNetwork(), config.scanInterval);

		// Speed test
		if (config.speedTestInterval > 0) {
			this.runSpeedTest();
			if (this.speedTestInterval) clearInterval(this.speedTestInterval);
			this.speedTestInterval = setInterval(() => this.runSpeedTest(), config.speedTestInterval);
		}

		// Connectivity check
		if (config.connectivityCheckInterval > 0) {
			this.checkConnectivity();
			if (this.connectivityInterval) clearInterval(this.connectivityInterval);
			this.connectivityInterval = setInterval(() => this.checkConnectivity(), config.connectivityCheckInterval);
		}
	},

	/**
	 * Detect network interface and CIDR
	 * @returns {object} Network info
	 */
	detectNetworkInfo: function () {
		const interfaces = os.networkInterfaces();
		let result = { interface: "eth0", cidr: "192.168.1.0/24" };

		for (const [name, addrs] of Object.entries(interfaces)) {
			// Skip loopback and virtual interfaces
			if (name === "lo" || name.startsWith("docker") || name.startsWith("veth") || name.startsWith("br-")) {
				continue;
			}

			for (const addr of addrs) {
				if (addr.family === "IPv4" && !addr.internal) {
					const ip = addr.address;
					const netmask = addr.netmask;

					// Calculate network CIDR
					const ipParts = ip.split(".").map(Number);
					const maskParts = netmask.split(".").map(Number);
					const networkParts = ipParts.map((p, i) => p & maskParts[i]);

					// Count bits in netmask
					const bits = maskParts.reduce((sum, part) => {
						let count = 0;
						let n = part;
						while (n) {
							count += n & 1;
							n >>= 1;
						}
						return sum + count;
					}, 0);

					result = {
						interface: name,
						cidr: `${networkParts.join(".")}/${bits}`,
						gateway: `${networkParts[0]}.${networkParts[1]}.${networkParts[2]}.1`
					};

					// Prefer wireless or common interfaces
					if (name.startsWith("wl") || name === "wlan0" || name === "en0") {
						return result;
					}
				}
			}
		}

		return result;
	},

	/**
	 * Scan network for devices using ARP
	 */
	scanNetwork: async function () {
		const cidr = this.config.networkCIDR;

		try {
			// Try different scanning methods based on platform
			let devices = [];

			if (process.platform === "linux") {
				devices = await this.scanWithArpScan(cidr);
				if (devices.length === 0) {
					devices = await this.scanWithNmap(cidr);
				}
			} else if (process.platform === "darwin") {
				devices = await this.scanWithArp();
			} else {
				devices = await this.scanWithArp();
			}

			// Enrich with vendor info
			for (const device of devices) {
				device.vendor = await this.lookupMacVendor(device.mac);
				device.online = true;

				// Check if new device
				if (!this.previousDevices.has(device.mac.toLowerCase())) {
					this.sendSocketNotification("NETWORK_NEW_DEVICE", { device });
				}
			}

			// Update device map
			const currentMacs = new Set(devices.map((d) => d.mac.toLowerCase()));

			// Mark offline devices
			for (const [mac, device] of this.devices) {
				if (!currentMacs.has(mac)) {
					device.online = false;
				}
			}

			// Update with new devices
			for (const device of devices) {
				this.devices.set(device.mac.toLowerCase(), device);
			}

			// Update previous devices set
			this.previousDevices = currentMacs;

			// Detect gateway
			const gatewayIp = this.detectGateway();
			for (const device of this.devices.values()) {
				if (device.ip === gatewayIp) {
					device.isGateway = true;
				}
			}

			// Send to frontend
			this.sendSocketNotification("NETWORK_DEVICES", {
				devices: Array.from(this.devices.values())
			});
		} catch (error) {
			Log.error(`[${this.name}] Scan error: ${error.message}`);
			this.sendSocketNotification("NETWORK_ERROR", {
				message: `Scan failed: ${error.message}`
			});
		}
	},

	/**
	 * Scan using arp-scan (Linux)
	 * @param {string} cidr - Network CIDR
	 * @returns {Promise<Array>} Devices
	 */
	scanWithArpScan: function (cidr) {
		return new Promise((resolve) => {
			exec(`sudo arp-scan --localnet --quiet 2>/dev/null || arp-scan --localnet --quiet 2>/dev/null`, (error, stdout) => {
				if (error) {
					resolve([]);
					return;
				}

				const devices = [];
				const lines = stdout.split("\n");

				for (const line of lines) {
					const match = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]{17})\s+(.*)$/);
					if (match) {
						devices.push({
							ip: match[1],
							mac: match[2].toLowerCase(),
							vendor: match[3] || null
						});
					}
				}

				resolve(devices);
			});
		});
	},

	/**
	 * Scan using nmap (fallback)
	 * @param {string} cidr - Network CIDR
	 * @returns {Promise<Array>} Devices
	 */
	scanWithNmap: function (cidr) {
		return new Promise((resolve) => {
			exec(`nmap -sn ${cidr} 2>/dev/null | grep -B2 "Host is up"`, (error, stdout) => {
				if (error) {
					resolve([]);
					return;
				}

				const devices = [];
				const blocks = stdout.split("--");

				for (const block of blocks) {
					const ipMatch = block.match(/(\d+\.\d+\.\d+\.\d+)/);
					const macMatch = block.match(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/);

					if (ipMatch) {
						devices.push({
							ip: ipMatch[1],
							mac: macMatch ? macMatch[0].toLowerCase() : this.generateLocalMac(ipMatch[1]),
							vendor: null
						});
					}
				}

				resolve(devices);
			});
		});
	},

	/**
	 * Scan using arp command (cross-platform)
	 * @returns {Promise<Array>} Devices
	 */
	scanWithArp: function () {
		return new Promise((resolve) => {
			exec("arp -a", (error, stdout) => {
				if (error) {
					resolve([]);
					return;
				}

				const devices = [];
				const lines = stdout.split("\n");

				for (const line of lines) {
					// Different formats for different OS
					// Linux: hostname (ip) at mac [ether] on interface
					// macOS: hostname (ip) at mac on interface
					// Windows: ip mac type

					let ip, mac, hostname;

					// Try Linux/macOS format
					const linuxMatch = line.match(/(\S+)\s+\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})/);
					if (linuxMatch) {
						hostname = linuxMatch[1] !== "?" ? linuxMatch[1] : null;
						ip = linuxMatch[2];
						mac = linuxMatch[3].toLowerCase();
					}

					// Try Windows format
					const windowsMatch = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})/);
					if (!linuxMatch && windowsMatch) {
						ip = windowsMatch[1];
						mac = windowsMatch[2].replace(/-/g, ":").toLowerCase();
					}

					if (ip && mac && mac !== "ff:ff:ff:ff:ff:ff" && !mac.startsWith("01:00:5e")) {
						devices.push({ ip, mac, hostname });
					}
				}

				resolve(devices);
			});
		});
	},

	/**
	 * Generate pseudo MAC for local device
	 * @param {string} ip - IP address
	 * @returns {string} Generated MAC
	 */
	generateLocalMac: function (ip) {
		// Create a deterministic pseudo-MAC based on IP
		const parts = ip.split(".").map(Number);
		return `local:${parts.map((p) => p.toString(16).padStart(2, "0")).join(":")}`;
	},

	/**
	 * Detect default gateway IP
	 * @returns {string} Gateway IP
	 */
	detectGateway: function () {
		try {
			const result = require("child_process").execSync("ip route | grep default | awk '{print $3}'", { encoding: "utf8" });
			return result.trim();
		} catch {
			// Fallback: assume .1 on the network
			const cidr = this.config.networkCIDR;
			const networkParts = cidr.split("/")[0].split(".");
			networkParts[3] = "1";
			return networkParts.join(".");
		}
	},

	/**
	 * Lookup MAC vendor from OUI database
	 * @param {string} mac - MAC address
	 * @returns {Promise<string>} Vendor name
	 */
	lookupMacVendor: async function (mac) {
		if (!mac || mac.startsWith("local:")) return null;

		const macLower = mac.toLowerCase();
		const oui = macLower.replace(/[:-]/g, "").substring(0, 6);

		// Check cache
		if (this.macVendorCache.has(oui)) {
			return this.macVendorCache.get(oui);
		}

		try {
			// Use local OUI lookup or API
			const vendor = await this.lookupOuiLocal(oui) || await this.lookupOuiApi(oui);
			this.macVendorCache.set(oui, vendor);
			return vendor;
		} catch {
			return null;
		}
	},

	/**
	 * Local OUI lookup
	 * @param {string} oui - OUI prefix
	 * @returns {Promise<string>} Vendor
	 */
	lookupOuiLocal: function (oui) {
		return new Promise((resolve) => {
			// Check common vendors first
			const commonVendors = {
				"000c29": "VMware",
				"001c42": "Parallels",
				"0050c2": "IEEE",
				"080027": "VirtualBox",
				"00155d": "Microsoft Hyper-V",
				"001e68": "Quanta",
				"0021e9": "Apple",
				"002332": "Apple",
				"002436": "Apple",
				"002500": "Apple",
				"0025bc": "Apple",
				"002608": "Apple",
				"0026b0": "Apple",
				"0026bb": "Apple",
				"003065": "Apple",
				"00c610": "Apple",
				"041552": "Apple",
				"04f7e4": "Apple",
				"086d41": "Apple",
				"10417f": "Apple",
				"109add": "Apple",
				"14109f": "Apple",
				"18af8f": "Apple",
				"1c1ac0": "Apple",
				"208486": "Samsung",
				"2c4401": "Samsung",
				"304a26": "Samsung",
				"3c5a37": "Samsung",
				"40b0fa": "Samsung",
				"5ce8eb": "Samsung",
				"3c2eff": "Google",
				"54600a": "Google",
				"f4f5d8": "Google",
				"fcecda": "Amazon",
				"40b4cd": "Amazon",
				"747548": "Amazon"
			};

			if (commonVendors[oui]) {
				resolve(commonVendors[oui]);
				return;
			}

			// Try /usr/share/nmap/nmap-mac-prefixes if available
			exec(`grep -i "^${oui}" /usr/share/nmap/nmap-mac-prefixes 2>/dev/null | cut -d' ' -f2-`, (error, stdout) => {
				if (!error && stdout.trim()) {
					resolve(stdout.trim());
				} else {
					resolve(null);
				}
			});
		});
	},

	/**
	 * API-based OUI lookup (fallback)
	 * @param {string} oui - OUI prefix
	 * @returns {Promise<string>} Vendor
	 */
	lookupOuiApi: async function (oui) {
		try {
			const response = await fetch(`https://api.macvendors.com/${oui}`);
			if (response.ok) {
				return await response.text();
			}
		} catch {
			// Ignore API errors
		}
		return null;
	},

	/**
	 * Run internet speed test
	 */
	runSpeedTest: async function () {
		Log.info(`[${this.name}] Running speed test...`);

		try {
			// Try speedtest-cli first
			const result = await this.runSpeedTestCli();
			this.sendSocketNotification("NETWORK_SPEED_TEST", result);
		} catch (error) {
			Log.error(`[${this.name}] Speed test error: ${error.message}`);

			// Fall back to simple download test
			try {
				const result = await this.runSimpleSpeedTest();
				this.sendSocketNotification("NETWORK_SPEED_TEST", result);
			} catch (fallbackError) {
				this.sendSocketNotification("NETWORK_ERROR", {
					message: `Speed test failed: ${fallbackError.message}`
				});
			}
		}
	},

	/**
	 * Run speedtest-cli
	 * @returns {Promise<object>} Speed test results
	 */
	runSpeedTestCli: function () {
		return new Promise((resolve, reject) => {
			exec("speedtest-cli --json", { timeout: 120000 }, (error, stdout) => {
				if (error) {
					reject(error);
					return;
				}

				try {
					const data = JSON.parse(stdout);
					resolve({
						download: data.download / 1000000, // bits to Mbps
						upload: data.upload / 1000000,
						ping: data.ping,
						server: data.server?.sponsor,
						timestamp: new Date().toISOString()
					});
				} catch (parseError) {
					reject(parseError);
				}
			});
		});
	},

	/**
	 * Simple speed test (download a test file)
	 * @returns {Promise<object>} Speed test results
	 */
	runSimpleSpeedTest: function () {
		return new Promise((resolve, reject) => {
			const testUrl = "http://speedtest.tele2.net/1MB.zip";
			const startTime = Date.now();

			exec(`curl -o /dev/null -w "%{speed_download}" ${testUrl} 2>/dev/null`, { timeout: 60000 }, (error, stdout) => {
				if (error) {
					reject(error);
					return;
				}

				const bytesPerSecond = parseFloat(stdout);
				const mbps = (bytesPerSecond * 8) / 1000000;

				resolve({
					download: mbps,
					upload: null, // Simple test doesn't measure upload
					ping: null,
					server: "speedtest.tele2.net",
					timestamp: new Date().toISOString()
				});
			});
		});
	},

	/**
	 * Check internet connectivity
	 */
	checkConnectivity: async function () {
		const hosts = this.config.connectivityHosts || ["8.8.8.8", "1.1.1.1"];
		let online = false;

		for (const host of hosts) {
			try {
				const isReachable = await this.ping(host);
				if (isReachable) {
					online = true;
					break;
				}
			} catch {
				// Continue to next host
			}
		}

		this.sendSocketNotification("NETWORK_STATUS", { online });
	},

	/**
	 * Ping a host
	 * @param {string} host - Host to ping
	 * @returns {Promise<boolean>} Is reachable
	 */
	ping: function (host) {
		return new Promise((resolve) => {
			const cmd = process.platform === "win32"
				? `ping -n 1 -w 2000 ${host}`
				: `ping -c 1 -W 2 ${host}`;

			exec(cmd, { timeout: 5000 }, (error) => {
				resolve(!error);
			});
		});
	},

	/**
	 * Load known devices from file
	 */
	loadKnownDevices: function () {
		try {
			if (fs.existsSync(this.knownDevicesPath)) {
				const data = fs.readFileSync(this.knownDevicesPath, "utf8");
				const devices = JSON.parse(data);
				Log.info(`[${this.name}] Loaded ${devices.length} known devices`);
			}
		} catch (error) {
			Log.warn(`[${this.name}] Could not load known devices: ${error.message}`);
		}
	},

	/**
	 * Save a known device
	 * @param {object} device - Device to save
	 */
	saveKnownDevice: function (device) {
		try {
			let devices = [];

			if (fs.existsSync(this.knownDevicesPath)) {
				const data = fs.readFileSync(this.knownDevicesPath, "utf8");
				devices = JSON.parse(data);
			}

			// Update or add device
			const index = devices.findIndex((d) => d.mac.toLowerCase() === device.mac.toLowerCase());
			if (index !== -1) {
				devices[index] = device;
			} else {
				devices.push(device);
			}

			fs.writeFileSync(this.knownDevicesPath, JSON.stringify(devices, null, 2));
			Log.info(`[${this.name}] Saved known device: ${device.name} (${device.mac})`);
		} catch (error) {
			Log.error(`[${this.name}] Could not save known device: ${error.message}`);
		}
	},

	/**
	 * Stop the helper
	 */
	stop: function () {
		if (this.scanInterval) clearInterval(this.scanInterval);
		if (this.speedTestInterval) clearInterval(this.speedTestInterval);
		if (this.connectivityInterval) clearInterval(this.connectivityInterval);
	}
});
