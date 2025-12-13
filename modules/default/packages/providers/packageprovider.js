/**
 * Base Package Provider
 *
 * Abstract base class for all package tracking providers.
 * Provides standardized data structures for shipments and tracking events.
 */

const BaseProvider = require("../../../shared/baseprovider");

const PackageProvider = BaseProvider.extend({
	providerName: "PackageProvider",

	defaults: {
		updateInterval: 1800000 // 30 minutes
	},

	/**
	 * Shipment statuses
	 */
	statuses: {
		PENDING: "pending",
		INFO_RECEIVED: "info_received",
		IN_TRANSIT: "in_transit",
		OUT_FOR_DELIVERY: "out_for_delivery",
		DELIVERED: "delivered",
		EXCEPTION: "exception",
		EXPIRED: "expired",
		UNKNOWN: "unknown"
	},

	/**
	 * Standard shipment data structure
	 * @returns {object}
	 */
	getShipmentTemplate() {
		return {
			trackingNumber: "",
			carrier: "",
			carrierCode: "",
			status: "unknown",
			statusText: "",
			origin: null,
			destination: null,
			estimatedDelivery: null,
			deliveredAt: null,
			signedBy: null,
			weight: null,
			events: [],
			lastUpdate: null,
			customName: "" // User-defined name for the package
		};
	},

	/**
	 * Standard tracking event structure
	 * @returns {object}
	 */
	getEventTemplate() {
		return {
			timestamp: null,
			status: "",
			description: "",
			location: null
		};
	},

	/**
	 * Track a package
	 * @param {string} trackingNumber - Tracking number
	 * @param {string} carrier - Carrier code (optional for auto-detect)
	 * @returns {Promise<object>}
	 */
	async trackPackage(trackingNumber, carrier = null) {
		throw new Error("trackPackage() must be implemented by provider");
	},

	/**
	 * Track multiple packages
	 * @param {Array} packages - Array of { trackingNumber, carrier }
	 * @returns {Promise<Array>}
	 */
	async trackMultiple(packages) {
		const results = [];
		for (const pkg of packages) {
			try {
				const result = await this.trackPackage(pkg.trackingNumber, pkg.carrier);
				results.push({ ...result, customName: pkg.name });
			} catch (error) {
				results.push({
					...this.getShipmentTemplate(),
					trackingNumber: pkg.trackingNumber,
					carrier: pkg.carrier,
					customName: pkg.name,
					status: "exception",
					statusText: error.message
				});
			}
		}
		return results;
	},

	/**
	 * Detect carrier from tracking number
	 * @param {string} trackingNumber - Tracking number
	 * @returns {string|null}
	 */
	detectCarrier(trackingNumber) {
		const patterns = {
			ups: [
				/^1Z[A-Z0-9]{16}$/i, // UPS
				/^T\d{10}$/i // UPS Mail Innovations
			],
			fedex: [
				/^\d{12}$/, // FedEx Express
				/^\d{15}$/, // FedEx Ground
				/^\d{20}$/, // FedEx SmartPost
				/^\d{22}$/ // FedEx Ground 96
			],
			usps: [
				/^\d{20,22}$/, // USPS 20/22
				/^[A-Z]{2}\d{9}US$/i, // USPS International
				/^94\d{20}$/, // USPS Tracking Plus
				/^92\d{20}$/ // USPS Registered
			],
			dhl: [
				/^\d{10}$/, // DHL Express
				/^[A-Z]{3}\d{7}$/i // DHL eCommerce
			],
			amazon: [
				/^TBA\d{12}$/i // Amazon Logistics
			]
		};

		for (const [carrier, regexList] of Object.entries(patterns)) {
			for (const regex of regexList) {
				if (regex.test(trackingNumber)) {
					return carrier;
				}
			}
		}

		return null;
	},

	/**
	 * Get carrier icon
	 * @param {string} carrier - Carrier code
	 * @returns {string}
	 */
	getCarrierIcon(carrier) {
		const icons = {
			ups: "fa-ups",
			fedex: "fa-fedex",
			usps: "fa-usps",
			dhl: "fa-dhl",
			amazon: "fa-amazon"
		};
		return icons[carrier?.toLowerCase()] || "fa-box";
	},

	/**
	 * Get status icon
	 * @param {string} status - Shipment status
	 * @returns {string}
	 */
	getStatusIcon(status) {
		const icons = {
			pending: "fa-clock",
			info_received: "fa-file-alt",
			in_transit: "fa-truck",
			out_for_delivery: "fa-truck-fast",
			delivered: "fa-check-circle",
			exception: "fa-exclamation-triangle",
			expired: "fa-calendar-xmark",
			unknown: "fa-question-circle"
		};
		return icons[status] || icons.unknown;
	},

	/**
	 * Get human-readable status text
	 * @param {string} status - Status code
	 * @returns {string}
	 */
	getStatusText(status) {
		const texts = {
			pending: "Pending",
			info_received: "Label Created",
			in_transit: "In Transit",
			out_for_delivery: "Out for Delivery",
			delivered: "Delivered",
			exception: "Exception",
			expired: "Expired",
			unknown: "Unknown"
		};
		return texts[status] || status;
	},

	/**
	 * Format estimated delivery date
	 * @param {Date} date - Estimated delivery date
	 * @returns {string}
	 */
	formatDeliveryDate(date) {
		if (!date) return "Unknown";

		const now = new Date();
		const delivery = new Date(date);
		const diffDays = Math.ceil((delivery - now) / (1000 * 60 * 60 * 24));

		if (diffDays < 0) return "Delayed";
		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Tomorrow";

		return delivery.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric"
		});
	}
});

// Provider registry
PackageProvider.providers = {};

/**
 * Register a package provider
 * @param {string} id - Provider identifier
 * @param {object} provider - Provider implementation
 */
PackageProvider.register = function (id, provider) {
	PackageProvider.providers[id.toLowerCase()] = PackageProvider.extend(provider);
};

/**
 * Get a provider instance
 * @param {string} id - Provider identifier
 * @param {object} config - Provider configuration
 * @param {object} module - Parent module reference
 * @returns {PackageProvider}
 */
PackageProvider.getInstance = function (id, config, module) {
	const Provider = PackageProvider.providers[id.toLowerCase()];
	if (!Provider) {
		throw new Error(`Unknown package provider: ${id}`);
	}
	const instance = new Provider();
	instance.init(config, module);
	return instance;
};

/**
 * List available providers
 * @returns {string[]}
 */
PackageProvider.getAvailableProviders = function () {
	return Object.keys(PackageProvider.providers);
};

module.exports = PackageProvider;
