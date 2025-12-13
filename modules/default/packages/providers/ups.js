/**
 * UPS Provider for Package Tracking
 *
 * Uses UPS Track API
 *
 * Setup:
 * 1. Create account at https://developer.ups.com
 * 2. Create an application to get Client ID and Secret
 * 3. Request access to Tracking API
 */

const PackageProvider = require("./packageprovider");

PackageProvider.register("ups", {
	providerName: "UPS",

	defaults: {
		clientId: "",
		clientSecret: "",
		baseUrl: "https://onlinetools.ups.com",
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
			this.setError("UPS Client ID is required");
			return false;
		}
		if (!this.config.clientSecret) {
			this.setError("UPS Client Secret is required");
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
			? "https://wwwcie.ups.com"
			: this.config.baseUrl;

		const credentials = Buffer.from(
			`${this.config.clientId}:${this.config.clientSecret}`
		).toString("base64");

		const response = await fetch(`${baseUrl}/security/v1/oauth/token`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${credentials}`,
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: "grant_type=client_credentials"
		});

		if (!response.ok) {
			throw new Error(`UPS auth failed: ${response.statusText}`);
		}

		const data = await response.json();
		this.accessToken = data.access_token;
		// Token expires in 4 hours, refresh 5 minutes early
		this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

		return this.accessToken;
	},

	/**
	 * Track a package
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>}
	 */
	async trackPackage(trackingNumber) {
		if (!this.validateConfig()) return this.getShipmentTemplate();

		try {
			const token = await this.getAccessToken();
			const baseUrl = this.config.sandbox
				? "https://wwwcie.ups.com"
				: this.config.baseUrl;

			const response = await fetch(
				`${baseUrl}/api/track/v1/details/${trackingNumber}?locale=en_US&returnSignature=true`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
						transId: Date.now().toString(),
						transactionSrc: "MagicMirror"
					}
				}
			);

			const data = await response.json();

			if (!response.ok) {
				const error = data.response?.errors?.[0]?.message || response.statusText;
				throw new Error(error);
			}

			const trackResponse = data.trackResponse;
			if (!trackResponse?.shipment?.[0]) {
				throw new Error("No tracking information found");
			}

			return this.parseShipment(trackResponse.shipment[0], trackingNumber);
		} catch (error) {
			this.setError(`UPS error: ${error.message}`);
			return this.getShipmentTemplate();
		}
	},

	/**
	 * Parse UPS shipment data
	 * @param {object} shipment - UPS shipment object
	 * @param {string} trackingNumber - Tracking number
	 * @returns {object}
	 */
	parseShipment(shipment, trackingNumber) {
		const pkg = shipment.package?.[0] || {};
		const currentStatus = pkg.currentStatus || {};
		const deliveryDate = pkg.deliveryDate?.[0] || shipment.deliveryDate?.[0];
		const deliveryTime = pkg.deliveryTime || shipment.deliveryTime;
		const activity = pkg.activity || [];
		const weight = pkg.weight;
		const signature = pkg.signature;

		// Parse shipper and recipient
		const shipper = shipment.shipperAddress || {};
		const recipient = shipment.shipToAddress || {};

		// Parse estimated delivery
		let estimatedDelivery = null;
		if (deliveryDate?.date) {
			const dateStr = deliveryDate.date;
			const timeStr = deliveryTime?.endTime || deliveryTime?.startTime || "120000";
			estimatedDelivery = this.parseUPSDateTime(dateStr, timeStr);
		}

		// Parse delivered at
		let deliveredAt = null;
		if (currentStatus.code === "011" && activity.length > 0) {
			const deliveryActivity = activity.find((a) => a.status?.code === "011");
			if (deliveryActivity) {
				deliveredAt = this.parseUPSDateTime(
					deliveryActivity.date,
					deliveryActivity.time
				);
			}
		}

		return {
			trackingNumber,
			carrier: "ups",
			carrierCode: "ups",
			status: this.mapStatus(currentStatus.code),
			statusText: currentStatus.description || this.getStatusText(this.mapStatus(currentStatus.code)),
			origin: this.formatAddress(shipper),
			destination: this.formatAddress(recipient),
			estimatedDelivery,
			deliveredAt,
			signedBy: signature?.name || null,
			weight: weight?.weight
				? `${weight.weight} ${weight.unitOfMeasurement?.toLowerCase() || "lbs"}`
				: null,
			events: this.parseActivity(activity),
			lastUpdate: activity.length > 0
				? this.parseUPSDateTime(activity[0].date, activity[0].time)
				: null,
			customName: ""
		};
	},

	/**
	 * Parse activity array to events
	 * @param {Array} activity - UPS activity array
	 * @returns {Array}
	 */
	parseActivity(activity) {
		return activity.map((act) => ({
			timestamp: this.parseUPSDateTime(act.date, act.time),
			status: this.mapStatus(act.status?.code),
			description: act.status?.description || act.status?.type,
			location: this.formatAddress(act.location?.address)
		}));
	},

	/**
	 * Parse UPS date/time format
	 * @param {string} date - Date string (YYYYMMDD)
	 * @param {string} time - Time string (HHMMSS)
	 * @returns {Date}
	 */
	parseUPSDateTime(date, time) {
		if (!date) return new Date();

		const year = date.slice(0, 4);
		const month = date.slice(4, 6);
		const day = date.slice(6, 8);

		const hour = time?.slice(0, 2) || "12";
		const minute = time?.slice(2, 4) || "00";
		const second = time?.slice(4, 6) || "00";

		return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
	},

	/**
	 * Format address to string
	 * @param {object} address - Address object
	 * @returns {string|null}
	 */
	formatAddress(address) {
		if (!address) return null;

		const parts = [
			address.city,
			address.stateProvince || address.stateProvinceCode,
			address.postalCode,
			address.country || address.countryCode
		].filter(Boolean);

		return parts.length > 0 ? parts.join(", ") : null;
	},

	/**
	 * Map UPS status code to standard status
	 * @param {string} code - UPS status code
	 * @returns {string}
	 */
	mapStatus(code) {
		if (!code) return "unknown";

		const mapping = {
			// Delivered
			"011": "delivered",
			KB: "delivered",
			D: "delivered",

			// Out for delivery
			"072": "out_for_delivery",
			O: "out_for_delivery",
			"008": "out_for_delivery",

			// In transit
			"021": "in_transit",
			I: "in_transit",
			"001": "in_transit",
			"002": "in_transit",
			"019": "in_transit",
			"042": "in_transit",
			"061": "in_transit",

			// Pending/Manifested
			M: "pending",
			"003": "pending",
			MP: "pending",

			// Exception
			X: "exception",
			"012": "exception",
			"013": "exception",
			"022": "exception",
			"023": "exception"
		};

		return mapping[code] || "in_transit";
	},

	/**
	 * Track multiple packages
	 * @param {Array<string>} trackingNumbers - Array of tracking numbers
	 * @returns {Promise<Array>}
	 */
	async trackMultiple(trackingNumbers) {
		// UPS API tracks one package at a time, so we parallelize
		const results = await Promise.all(
			trackingNumbers.map((tn) => this.trackPackage(tn))
		);
		return results;
	},

	/**
	 * Get signature proof of delivery
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>}
	 */
	async getProofOfDelivery(trackingNumber) {
		if (!this.validateConfig()) return null;

		try {
			const token = await this.getAccessToken();
			const baseUrl = this.config.sandbox
				? "https://wwwcie.ups.com"
				: this.config.baseUrl;

			const response = await fetch(
				`${baseUrl}/api/track/v1/details/${trackingNumber}?locale=en_US&returnPOD=true`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
						transId: Date.now().toString(),
						transactionSrc: "MagicMirror"
					}
				}
			);

			const data = await response.json();

			if (!response.ok) return null;

			const pkg = data.trackResponse?.shipment?.[0]?.package?.[0];
			return pkg?.pod || null;
		} catch {
			return null;
		}
	}
});

module.exports = PackageProvider;
