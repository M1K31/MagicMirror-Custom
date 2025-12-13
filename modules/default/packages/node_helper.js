/**
 * Package Tracking Node Helper
 *
 * Handles server-side API integration for package tracking:
 * - AfterShip API (supports 900+ carriers)
 * - USPS Web Tools API
 * - FedEx Track API
 * - UPS Tracking API
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const path = require("path");
const { createDefaultStorage } = require("../../shared/secure-storage");
const { RateLimiter } = require("../../shared/rate-limiter");

// Initialize secure storage for OAuth tokens
const secureStorage = createDefaultStorage();

// Rate limiters per provider
const rateLimiters = {
	aftership: new RateLimiter(10, 1000, { name: "AfterShip" }), // 10/sec
	usps: new RateLimiter(5, 1000, { name: "USPS" }), // Conservative
	fedex: new RateLimiter(30, 60 * 1000, { name: "FedEx" }),
	ups: new RateLimiter(30, 60 * 1000, { name: "UPS" })
};

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.providers = {};
		this.cache = new Map();
		this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
	},

	/**
	 * Load saved tokens from encrypted storage
	 * @param {string} provider - Provider name
	 * @returns {object} Saved tokens
	 */
	loadTokens: function (provider) {
		const configPath = path.join(__dirname, `.${provider}_tokens.encrypted`);
		try {
			return secureStorage.loadSecure(configPath) || {};
		} catch (error) {
			Log.warn(`[${this.name}] Could not load tokens for ${provider}: ${error.message}`);
			return {};
		}
	},

	/**
	 * Save tokens to encrypted storage
	 * @param {string} provider - Provider name
	 * @param {object} tokens - Tokens to save
	 */
	saveTokens: function (provider, tokens) {
		const configPath = path.join(__dirname, `.${provider}_tokens.encrypted`);
		try {
			secureStorage.saveSecure(configPath, tokens);
			Log.info(`[${this.name}] Saved encrypted tokens for ${provider}`);
		} catch (error) {
			Log.warn(`[${this.name}] Could not save tokens for ${provider}: ${error.message}`);
		}
	},

	/**
	 * Handle socket notifications from frontend
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "PACKAGES_INIT":
				this.initProvider(payload);
				break;
			case "PACKAGES_REFRESH":
				this.refreshPackages(payload);
				break;
			case "PACKAGES_ADD":
				this.addPackage(payload);
				break;
			case "PACKAGES_REMOVE":
				this.removePackage(payload);
				break;
		}
	},

	/**
	 * Initialize provider
	 * @param {object} payload - Init payload
	 */
	initProvider: async function (payload) {
		const { provider, config, packages } = payload;

		try {
			switch (provider) {
				case "aftership":
					this.initAfterShip(config);
					break;
				case "usps":
					this.initUSPS(config);
					break;
				case "fedex":
					this.initFedEx(config);
					break;
				case "ups":
					this.initUPS(config);
					break;
			}

			// Fetch initial data
			await this.refreshPackages(payload);
		} catch (error) {
			Log.error(`[${this.name}] Failed to init ${provider}:`, error.message);
			this.sendSocketNotification("PACKAGES_ERROR", {
				error: `Failed to initialize: ${error.message}`
			});
		}
	},

	// ==========================================
	// AFTERSHIP
	// ==========================================

	/**
	 * Initialize AfterShip
	 * @param {object} config - AfterShip config
	 */
	initAfterShip: function (config) {
		this.providers.aftership = {
			apiKey: config.apiKey,
			baseUrl: "https://api.aftership.com/v4"
		};
		Log.info(`[${this.name}] AfterShip initialized`);
	},

	/**
	 * Make AfterShip API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>} Response data
	 */
	aftershipRequest: async function (endpoint, options = {}) {
		const provider = this.providers.aftership;
		if (!provider) throw new Error("AfterShip not initialized");

		// Wrap API call with rate limiting
		const limiter = rateLimiters.aftership;
		return limiter.throttle(async () => {
			const response = await fetch(`${provider.baseUrl}${endpoint}`, {
				...options,
				headers: {
					"aftership-api-key": provider.apiKey,
					"Content-Type": "application/json",
					...options.headers
				}
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.meta?.message || `API error: ${response.status}`);
			}

			return response.json();
		});
	},

	/**
	 * Get all trackings from AfterShip
	 * @returns {Promise<object[]>} Array of trackings
	 */
	getAfterShipTrackings: async function () {
		try {
			const data = await this.aftershipRequest("/trackings");
			return data.data?.trackings || [];
		} catch (error) {
			Log.error(`[${this.name}] AfterShip error:`, error.message);
			throw error;
		}
	},

	/**
	 * Add tracking to AfterShip
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug (optional)
	 * @param {string} title - Title (optional)
	 */
	addAfterShipTracking: async function (trackingNumber, carrier = null, title = null) {
		const body = {
			tracking: {
				tracking_number: trackingNumber
			}
		};

		if (carrier) body.tracking.slug = carrier;
		if (title) body.tracking.title = title;

		await this.aftershipRequest("/trackings", {
			method: "POST",
			body: JSON.stringify(body)
		});
	},

	/**
	 * Remove tracking from AfterShip
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug
	 */
	removeAfterShipTracking: async function (trackingNumber, carrier) {
		await this.aftershipRequest(`/trackings/${carrier}/${trackingNumber}`, {
			method: "DELETE"
		});
	},

	// ==========================================
	// USPS
	// ==========================================

	/**
	 * Initialize USPS
	 * @param {object} config - USPS config
	 */
	initUSPS: function (config) {
		this.providers.usps = {
			userId: config.userId,
			baseUrl: "https://secure.shippingapis.com/ShippingAPI.dll"
		};
		Log.info(`[${this.name}] USPS initialized`);
	},

	/**
	 * Track package via USPS (rate-limited)
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>} Tracking info
	 */
	trackUSPS: async function (trackingNumber) {
		const provider = this.providers.usps;
		if (!provider) throw new Error("USPS not initialized");

		const xml = `
			<TrackFieldRequest USERID="${provider.userId}">
				<TrackID ID="${trackingNumber}"></TrackID>
			</TrackFieldRequest>
		`;

		// Wrap API call with rate limiting
		const limiter = rateLimiters.usps;
		return limiter.throttle(async () => {
			const response = await fetch(`${provider.baseUrl}?API=TrackV2&XML=${encodeURIComponent(xml)}`);

			if (!response.ok) {
				throw new Error(`USPS API error: ${response.status}`);
			}

			const text = await response.text();
			return this.parseUSPSResponse(text, trackingNumber);
		});
	},

	/**
	 * Parse USPS XML response
	 * @param {string} xml - XML response
	 * @param {string} trackingNumber - Tracking number
	 * @returns {object} Parsed tracking info
	 */
	parseUSPSResponse: function (xml, trackingNumber) {
		// Simple XML parsing for USPS response
		const getTagContent = (tag) => {
			const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
			return match ? match[1] : null;
		};

		const status = getTagContent("Event") || "Unknown";
		const eventDate = getTagContent("EventDate");
		const eventTime = getTagContent("EventTime");
		const city = getTagContent("EventCity");
		const state = getTagContent("EventState");

		return {
			tracking_number: trackingNumber,
			carrier: "usps",
			carrier_name: "USPS",
			status_text: status,
			tag: this.mapUSPSStatus(status),
			checkpoints: [
				{
					message: status,
					location: city && state ? `${city}, ${state}` : null,
					checkpoint_time: eventDate && eventTime ? `${eventDate} ${eventTime}` : null
				}
			]
		};
	},

	/**
	 * Map USPS status to standard status
	 * @param {string} status - USPS status
	 * @returns {string} Standard status
	 */
	mapUSPSStatus: function (status) {
		const statusLower = status.toLowerCase();

		if (statusLower.includes("delivered")) return "Delivered";
		if (statusLower.includes("out for delivery")) return "OutForDelivery";
		if (statusLower.includes("in transit") || statusLower.includes("departed") || statusLower.includes("arrived")) return "InTransit";
		if (statusLower.includes("accepted") || statusLower.includes("picked up")) return "InfoReceived";

		return "InTransit";
	},

	// ==========================================
	// FEDEX
	// ==========================================

	/**
	 * Initialize FedEx
	 * @param {object} config - FedEx config
	 */
	initFedEx: function (config) {
		this.providers.fedex = {
			apiKey: config.apiKey,
			secretKey: config.secretKey,
			accountNumber: config.accountNumber,
			baseUrl: "https://apis.fedex.com"
		};
		Log.info(`[${this.name}] FedEx initialized`);
	},

	/**
	 * Get FedEx OAuth token
	 * @returns {Promise<string>} Access token
	 */
	getFedExToken: async function () {
		const provider = this.providers.fedex;

		const response = await fetch(`${provider.baseUrl}/oauth/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: provider.apiKey,
				client_secret: provider.secretKey
			})
		});

		if (!response.ok) {
			throw new Error("FedEx authentication failed");
		}

		const data = await response.json();
		provider.accessToken = data.access_token;
		provider.tokenExpiry = Date.now() + data.expires_in * 1000;

		return data.access_token;
	},

	/**
	 * Track package via FedEx (rate-limited)
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>} Tracking info
	 */
	trackFedEx: async function (trackingNumber) {
		const provider = this.providers.fedex;
		if (!provider) throw new Error("FedEx not initialized");

		// Get token if needed
		if (!provider.accessToken || Date.now() > provider.tokenExpiry - 60000) {
			await this.getFedExToken();
		}

		// Wrap API call with rate limiting
		const limiter = rateLimiters.fedex;
		return limiter.throttle(async () => {
			const response = await fetch(`${provider.baseUrl}/track/v1/trackingnumbers`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${provider.accessToken}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					trackingInfo: [
						{
							trackingNumberInfo: {
								trackingNumber: trackingNumber
							}
						}
					],
					includeDetailedScans: true
				})
			});

			if (!response.ok) {
				throw new Error(`FedEx API error: ${response.status}`);
			}

			const data = await response.json();
			return this.parseFedExResponse(data, trackingNumber);
		});
	},

	/**
	 * Parse FedEx response
	 * @param {object} data - API response
	 * @param {string} trackingNumber - Tracking number
	 * @returns {object} Parsed tracking info
	 */
	parseFedExResponse: function (data, trackingNumber) {
		const result = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
		if (!result) {
			return {
				tracking_number: trackingNumber,
				carrier: "fedex",
				carrier_name: "FedEx",
				tag: "Pending"
			};
		}

		const latestStatus = result.latestStatusDetail;

		return {
			tracking_number: trackingNumber,
			carrier: "fedex",
			carrier_name: "FedEx",
			status_text: latestStatus?.description || "Unknown",
			tag: this.mapFedExStatus(latestStatus?.code),
			expected_delivery: result.estimatedDeliveryTimeWindow?.window?.ends,
			checkpoints:
				result.scanEvents?.map((event) => ({
					message: event.eventDescription,
					location: event.scanLocation?.city ? `${event.scanLocation.city}, ${event.scanLocation.stateOrProvinceCode}` : null,
					checkpoint_time: event.date
				})) || []
		};
	},

	/**
	 * Map FedEx status code
	 * @param {string} code - FedEx status code
	 * @returns {string} Standard status
	 */
	mapFedExStatus: function (code) {
		const statusMap = {
			DL: "Delivered",
			OD: "OutForDelivery",
			IT: "InTransit",
			PU: "InfoReceived",
			DE: "Exception"
		};
		return statusMap[code] || "InTransit";
	},

	// ==========================================
	// UPS
	// ==========================================

	/**
	 * Initialize UPS
	 * @param {object} config - UPS config
	 */
	initUPS: function (config) {
		this.providers.ups = {
			accessKey: config.accessKey,
			userId: config.userId,
			password: config.password,
			baseUrl: "https://onlinetools.ups.com/track/v1"
		};
		Log.info(`[${this.name}] UPS initialized`);
	},

	/**
	 * Track package via UPS (rate-limited)
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>} Tracking info
	 */
	trackUPS: async function (trackingNumber) {
		const provider = this.providers.ups;
		if (!provider) throw new Error("UPS not initialized");

		// Wrap API call with rate limiting
		const limiter = rateLimiters.ups;
		return limiter.throttle(async () => {
			const response = await fetch(`${provider.baseUrl}/details/${trackingNumber}`, {
				headers: {
					AccessLicenseNumber: provider.accessKey,
					Username: provider.userId,
					Password: provider.password,
					transId: Date.now().toString(),
					transactionSrc: "MagicMirror"
				}
			});

			if (!response.ok) {
				throw new Error(`UPS API error: ${response.status}`);
			}

			const data = await response.json();
			return this.parseUPSResponse(data, trackingNumber);
		});
	},

	/**
	 * Parse UPS response
	 * @param {object} data - API response
	 * @param {string} trackingNumber - Tracking number
	 * @returns {object} Parsed tracking info
	 */
	parseUPSResponse: function (data, trackingNumber) {
		const pkg = data.trackResponse?.shipment?.[0]?.package?.[0];
		if (!pkg) {
			return {
				tracking_number: trackingNumber,
				carrier: "ups",
				carrier_name: "UPS",
				tag: "Pending"
			};
		}

		const currentStatus = pkg.currentStatus;
		const deliveryDate = pkg.deliveryDate?.[0]?.date;

		return {
			tracking_number: trackingNumber,
			carrier: "ups",
			carrier_name: "UPS",
			status_text: currentStatus?.description || "Unknown",
			tag: this.mapUPSStatus(currentStatus?.code),
			expected_delivery: deliveryDate,
			checkpoints:
				pkg.activity?.map((event) => ({
					message: event.status?.description,
					location: event.location?.address?.city ? `${event.location.address.city}, ${event.location.address.stateProvince}` : null,
					checkpoint_time: `${event.date} ${event.time}`
				})) || []
		};
	},

	/**
	 * Map UPS status code
	 * @param {string} code - UPS status code
	 * @returns {string} Standard status
	 */
	mapUPSStatus: function (code) {
		const statusMap = {
			D: "Delivered",
			O: "OutForDelivery",
			I: "InTransit",
			P: "InfoReceived",
			X: "Exception",
			M: "InfoReceived"
		};
		return statusMap[code] || "InTransit";
	},

	// ==========================================
	// COMMON METHODS
	// ==========================================

	/**
	 * Refresh all packages
	 * @param {object} payload - Request payload
	 */
	refreshPackages: async function (payload) {
		try {
			let packages = [];

			switch (payload.provider) {
				case "aftership":
					packages = await this.getAfterShipTrackings();
					break;

				case "usps":
				case "fedex":
				case "ups":
					// For direct carrier APIs, track each configured package
					if (payload.packages && payload.packages.length > 0) {
						packages = await Promise.all(
							payload.packages.map(async (pkg) => {
								try {
									switch (payload.provider) {
										case "usps":
											return await this.trackUSPS(pkg.trackingNumber);
										case "fedex":
											return await this.trackFedEx(pkg.trackingNumber);
										case "ups":
											return await this.trackUPS(pkg.trackingNumber);
									}
								} catch (error) {
									Log.warn(`[${this.name}] Failed to track ${pkg.trackingNumber}:`, error.message);
									return {
										tracking_number: pkg.trackingNumber,
										carrier: payload.provider,
										tag: "Exception",
										status_text: "Unable to track"
									};
								}
							})
						);
					}
					break;
			}

			this.sendSocketNotification("PACKAGES_DATA", { packages });
		} catch (error) {
			Log.error(`[${this.name}] Failed to refresh packages:`, error.message);
			this.sendSocketNotification("PACKAGES_ERROR", {
				error: error.message
			});
		}
	},

	/**
	 * Add a new package
	 * @param {object} payload - Add payload
	 */
	addPackage: async function (payload) {
		try {
			if (payload.provider === "aftership") {
				await this.addAfterShipTracking(payload.trackingNumber, payload.carrier, payload.title);
			}

			// Refresh to get updated list
			await this.refreshPackages(payload);
		} catch (error) {
			Log.error(`[${this.name}] Failed to add package:`, error.message);
			this.sendSocketNotification("PACKAGES_ERROR", {
				error: `Failed to add package: ${error.message}`
			});
		}
	},

	/**
	 * Remove a package
	 * @param {object} payload - Remove payload
	 */
	removePackage: async function (payload) {
		try {
			if (payload.provider === "aftership") {
				// Need to get the carrier slug first
				const trackings = await this.getAfterShipTrackings();
				const tracking = trackings.find((t) => t.tracking_number === payload.trackingNumber);
				if (tracking) {
					await this.removeAfterShipTracking(payload.trackingNumber, tracking.slug);
				}
			}

			// Refresh to get updated list
			await this.refreshPackages(payload);
		} catch (error) {
			Log.error(`[${this.name}] Failed to remove package:`, error.message);
			this.sendSocketNotification("PACKAGES_ERROR", {
				error: `Failed to remove package: ${error.message}`
			});
		}
	}
});
