/**
 * FedEx Provider for Package Tracking
 *
 * Uses FedEx Track API
 *
 * Setup:
 * 1. Create account at https://developer.fedex.com
 * 2. Create a project and get API credentials
 * 3. Request access to Track API
 */

const PackageProvider = require("./packageprovider");

PackageProvider.register("fedex", {
	providerName: "FedEx",

	defaults: {
		clientId: "",
		clientSecret: "",
		baseUrl: "https://apis.fedex.com",
		sandbox: false
	},

	accessToken: null,
	tokenExpiry: null,

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.clientId) {
			this.setError("FedEx Client ID is required");
			return false;
		}
		if (!this.config.clientSecret) {
			this.setError("FedEx Client Secret is required");
			return false;
		}
		return true;
	},

	/**
	 * Get OAuth access token
	 * @returns {Promise<string>}
	 */
	async getAccessToken() {
		// Return cached token if still valid
		if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
			return this.accessToken;
		}

		const baseUrl = this.config.sandbox
			? "https://apis-sandbox.fedex.com"
			: this.config.baseUrl;

		const response = await fetch(`${baseUrl}/oauth/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret
			})
		});

		if (!response.ok) {
			throw new Error(`FedEx auth failed: ${response.statusText}`);
		}

		const data = await response.json();
		this.accessToken = data.access_token;
		// Token expires in 1 hour, refresh 5 minutes early
		this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

		return this.accessToken;
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} body - Request body
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, body) {
		const token = await this.getAccessToken();
		const baseUrl = this.config.sandbox
			? "https://apis-sandbox.fedex.com"
			: this.config.baseUrl;

		const response = await fetch(`${baseUrl}${endpoint}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"X-locale": "en_US"
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		if (!response.ok) {
			const error = data.errors?.[0]?.message || response.statusText;
			throw new Error(error);
		}

		return data;
	},

	/**
	 * Track a package
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>}
	 */
	async trackPackage(trackingNumber) {
		if (!this.validateConfig()) return this.getShipmentTemplate();

		try {
			const data = await this.apiRequest("/track/v1/trackingnumbers", {
				includeDetailedScans: true,
				trackingInfo: [
					{
						trackingNumberInfo: {
							trackingNumber
						}
					}
				]
			});

			const result = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
			if (!result) {
				throw new Error("No tracking information found");
			}

			return this.parseTrackResult(result, trackingNumber);
		} catch (error) {
			this.setError(`FedEx error: ${error.message}`);
			return this.getShipmentTemplate();
		}
	},

	/**
	 * Parse FedEx track result
	 * @param {object} result - FedEx track result
	 * @param {string} trackingNumber - Tracking number
	 * @returns {object}
	 */
	parseTrackResult(result, trackingNumber) {
		// Check for errors in result
		if (result.error) {
			throw new Error(result.error.message);
		}

		const latestStatus = result.latestStatusDetail || {};
		const dateAndTimes = result.dateAndTimes || [];
		const scanEvents = result.scanEvents || [];
		const shipperAddress = result.shipperInformation?.address || {};
		const recipientAddress = result.recipientInformation?.address || {};

		// Parse dates
		const estimatedDelivery = dateAndTimes.find((d) =>
			d.type === "ESTIMATED_DELIVERY" || d.type === "ACTUAL_DELIVERY"
		);
		const actualDelivery = dateAndTimes.find((d) => d.type === "ACTUAL_DELIVERY");

		// Parse weight
		const weight = result.packageDetails?.weightAndDimensions?.weight?.[0];
		const weightStr = weight
			? `${weight.value} ${weight.unit?.toLowerCase() || "lbs"}`
			: null;

		return {
			trackingNumber,
			carrier: "fedex",
			carrierCode: "fedex",
			status: this.mapStatus(latestStatus.code),
			statusText: latestStatus.description || this.getStatusText(this.mapStatus(latestStatus.code)),
			origin: this.formatAddress(shipperAddress),
			destination: this.formatAddress(recipientAddress),
			estimatedDelivery: estimatedDelivery?.dateTime
				? new Date(estimatedDelivery.dateTime)
				: null,
			deliveredAt: actualDelivery?.dateTime
				? new Date(actualDelivery.dateTime)
				: null,
			signedBy: result.deliveryDetails?.receivedByName || null,
			weight: weightStr,
			events: this.parseScanEvents(scanEvents),
			lastUpdate: scanEvents.length > 0 && scanEvents[0].date
				? new Date(scanEvents[0].date)
				: null,
			customName: ""
		};
	},

	/**
	 * Parse scan events
	 * @param {Array} scanEvents - FedEx scan events
	 * @returns {Array}
	 */
	parseScanEvents(scanEvents) {
		return scanEvents.map((event) => ({
			timestamp: new Date(event.date),
			status: this.mapStatus(event.derivedStatusCode || event.eventType),
			description: event.eventDescription || event.eventType,
			location: this.formatAddress(event.scanLocation)
		}));
	},

	/**
	 * Format address object to string
	 * @param {object} address - Address object
	 * @returns {string|null}
	 */
	formatAddress(address) {
		if (!address) return null;

		const parts = [
			address.city,
			address.stateOrProvinceCode,
			address.postalCode,
			address.countryCode
		].filter(Boolean);

		return parts.length > 0 ? parts.join(", ") : null;
	},

	/**
	 * Map FedEx status code to standard status
	 * @param {string} code - FedEx status code
	 * @returns {string}
	 */
	mapStatus(code) {
		if (!code) return "unknown";

		const mapping = {
			// Delivered
			DL: "delivered",
			DELIVERED: "delivered",

			// Out for delivery
			OD: "out_for_delivery",
			"OUT FOR DELIVERY": "out_for_delivery",
			OC: "out_for_delivery",

			// In transit
			IT: "in_transit",
			IN_TRANSIT: "in_transit",
			AR: "in_transit",
			DP: "in_transit",
			PU: "in_transit",
			"PICKED UP": "in_transit",
			"IN TRANSIT": "in_transit",
			"ARRIVED AT FEDEX LOCATION": "in_transit",
			"DEPARTED FEDEX LOCATION": "in_transit",
			"AT LOCAL FEDEX FACILITY": "in_transit",
			"AT DESTINATION SORT FACILITY": "in_transit",
			"PACKAGE RECEIVED": "in_transit",

			// Pending/Label created
			PX: "pending",
			SF: "pending",
			"SHIPMENT INFORMATION SENT TO FEDEX": "pending",
			"LABEL CREATED": "pending",

			// Exception
			DE: "exception",
			CA: "exception",
			SE: "exception",
			EXCEPTION: "exception",
			"DELIVERY EXCEPTION": "exception",
			"CUSTOMER NOT AVAILABLE": "exception",
			"DELIVERY REFUSED": "exception"
		};

		return mapping[code.toUpperCase()] || "in_transit";
	},

	/**
	 * Track multiple packages
	 * @param {Array<string>} trackingNumbers - Array of tracking numbers
	 * @returns {Promise<Array>}
	 */
	async trackMultiple(trackingNumbers) {
		if (!this.validateConfig()) return [];

		try {
			// FedEx allows up to 30 tracking numbers per request
			const data = await this.apiRequest("/track/v1/trackingnumbers", {
				includeDetailedScans: true,
				trackingInfo: trackingNumbers.map((tn) => ({
					trackingNumberInfo: {
						trackingNumber: tn
					}
				}))
			});

			const results = [];
			const completeResults = data.output?.completeTrackResults || [];

			for (const complete of completeResults) {
				const trackResult = complete.trackResults?.[0];
				if (trackResult) {
					try {
						results.push(this.parseTrackResult(
							trackResult,
							complete.trackingNumber
						));
					} catch (error) {
						results.push({
							...this.getShipmentTemplate(),
							trackingNumber: complete.trackingNumber,
							carrier: "fedex",
							statusText: error.message
						});
					}
				}
			}

			return results;
		} catch (error) {
			this.setError(`FedEx error: ${error.message}`);
			return [];
		}
	}
});

module.exports = PackageProvider;
