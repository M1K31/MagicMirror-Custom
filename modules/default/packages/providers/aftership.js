/**
 * AfterShip Provider for Package Tracking
 *
 * Universal tracking via AfterShip API
 * Supports 900+ carriers worldwide
 *
 * Setup:
 * 1. Create account at https://www.aftership.com
 * 2. Go to Settings > API Keys
 * 3. Create a new API key
 */

const PackageProvider = require("./packageprovider");

PackageProvider.register("aftership", {
	providerName: "AfterShip",

	defaults: {
		apiKey: "",
		baseUrl: "https://api.aftership.com/v4"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.apiKey) {
			this.setError("AfterShip API key is required");
			return false;
		}
		return true;
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, options = {}) {
		const url = `${this.config.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			...options,
			headers: {
				"aftership-api-key": this.config.apiKey,
				"Content-Type": "application/json",
				...options.headers
			}
		});

		const data = await response.json();

		if (!response.ok || data.meta?.code !== 200) {
			throw new Error(data.meta?.message || `AfterShip error: ${response.statusText}`);
		}

		return data.data;
	},

	/**
	 * Track a package
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug (optional)
	 * @returns {Promise<object>}
	 */
	async trackPackage(trackingNumber, carrier = null) {
		if (!this.validateConfig()) return this.getShipmentTemplate();

		try {
			// Try to get existing tracking
			let tracking = await this.getTracking(trackingNumber, carrier);

			// If not found, create it
			if (!tracking) {
				tracking = await this.createTracking(trackingNumber, carrier);
			}

			return this.parseTracking(tracking);
		} catch (error) {
			// If 404, try to create
			if (error.message.includes("4004")) {
				const tracking = await this.createTracking(trackingNumber, carrier);
				return this.parseTracking(tracking);
			}
			throw error;
		}
	},

	/**
	 * Get existing tracking
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug
	 * @returns {Promise<object>}
	 */
	async getTracking(trackingNumber, carrier) {
		const slug = carrier || "auto";
		const data = await this.apiRequest(`/trackings/${slug}/${trackingNumber}`);
		return data.tracking;
	},

	/**
	 * Create new tracking
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug
	 * @returns {Promise<object>}
	 */
	async createTracking(trackingNumber, carrier) {
		const body = {
			tracking: {
				tracking_number: trackingNumber
			}
		};

		if (carrier) {
			body.tracking.slug = carrier;
		}

		const data = await this.apiRequest("/trackings", {
			method: "POST",
			body: JSON.stringify(body)
		});

		return data.tracking;
	},

	/**
	 * Parse AfterShip tracking to standard format
	 * @param {object} tracking - AfterShip tracking object
	 * @returns {object}
	 */
	parseTracking(tracking) {
		return {
			trackingNumber: tracking.tracking_number,
			carrier: tracking.slug,
			carrierCode: tracking.slug,
			status: this.mapStatus(tracking.tag),
			statusText: tracking.subtag_message || tracking.tag,
			origin: tracking.origin_country_iso3,
			destination: tracking.destination_country_iso3,
			estimatedDelivery: tracking.expected_delivery
				? new Date(tracking.expected_delivery)
				: null,
			deliveredAt: tracking.tag === "Delivered" && tracking.checkpoints?.length > 0
				? new Date(tracking.checkpoints[0].checkpoint_time)
				: null,
			signedBy: tracking.signed_by,
			weight: null,
			events: this.parseCheckpoints(tracking.checkpoints || []),
			lastUpdate: tracking.updated_at ? new Date(tracking.updated_at) : null,
			customName: tracking.title || ""
		};
	},

	/**
	 * Parse checkpoints to events
	 * @param {Array} checkpoints - AfterShip checkpoints
	 * @returns {Array}
	 */
	parseCheckpoints(checkpoints) {
		return checkpoints.map((cp) => ({
			timestamp: new Date(cp.checkpoint_time),
			status: this.mapStatus(cp.tag),
			description: cp.message || cp.subtag_message,
			location: [cp.city, cp.state, cp.country_iso3]
				.filter(Boolean)
				.join(", ") || null
		}));
	},

	/**
	 * Map AfterShip tag to standard status
	 * @param {string} tag - AfterShip tag
	 * @returns {string}
	 */
	mapStatus(tag) {
		const mapping = {
			Pending: "pending",
			InfoReceived: "info_received",
			InTransit: "in_transit",
			OutForDelivery: "out_for_delivery",
			AttemptFail: "exception",
			Delivered: "delivered",
			AvailableForPickup: "out_for_delivery",
			Exception: "exception",
			Expired: "expired"
		};
		return mapping[tag] || "unknown";
	},

	/**
	 * Get all tracked packages
	 * @returns {Promise<Array>}
	 */
	async getAllTrackings() {
		if (!this.validateConfig()) return [];

		try {
			const data = await this.apiRequest("/trackings?limit=100");
			return (data.trackings || []).map((t) => this.parseTracking(t));
		} catch (error) {
			this.setError(`AfterShip error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Delete a tracking
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier slug
	 * @returns {Promise<boolean>}
	 */
	async deleteTracking(trackingNumber, carrier) {
		if (!this.validateConfig()) return false;

		try {
			const slug = carrier || "auto";
			await this.apiRequest(`/trackings/${slug}/${trackingNumber}`, {
				method: "DELETE"
			});
			return true;
		} catch (error) {
			this.setError(`AfterShip delete error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Detect carrier for tracking number
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<Array>}
	 */
	async detectCarrier(trackingNumber) {
		if (!this.validateConfig()) return [];

		try {
			const data = await this.apiRequest("/couriers/detect", {
				method: "POST",
				body: JSON.stringify({
					tracking: { tracking_number: trackingNumber }
				})
			});

			return data.couriers || [];
		} catch (error) {
			this.setError(`AfterShip detect error: ${error.message}`);
			return [];
		}
	}
});

module.exports = PackageProvider;
