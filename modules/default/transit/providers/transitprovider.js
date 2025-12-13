/**
 * Base Transit Provider
 *
 * Abstract base class for all transit data providers.
 * Provides standardized data structures for arrivals, routes, and alerts.
 */

const BaseProvider = require("../../../shared/baseprovider");

const TransitProvider = BaseProvider.extend({
	providerName: "TransitProvider",

	defaults: {
		updateInterval: 60000, // 1 minute
		apiKey: ""
	},

	/**
	 * Standard arrival data structure
	 * @returns {object}
	 */
	getArrivalTemplate() {
		return {
			routeId: "",
			routeName: "",
			routeColor: null,
			destination: "",
			vehicleType: "bus", // bus, subway, rail, tram, ferry
			arrivalTime: null, // Date object
			departureTime: null,
			isRealtime: false,
			delay: 0, // seconds
			platform: null,
			status: "scheduled" // scheduled, arriving, delayed, cancelled
		};
	},

	/**
	 * Standard route data structure
	 * @returns {object}
	 */
	getRouteTemplate() {
		return {
			origin: { name: "", lat: 0, lon: 0 },
			destination: { name: "", lat: 0, lon: 0 },
			duration: 0, // minutes
			distance: 0, // meters
			departureTime: null,
			arrivalTime: null,
			legs: [],
			fare: null,
			shareUrl: null // Deep link for maps app
		};
	},

	/**
	 * Standard alert data structure
	 * @returns {object}
	 */
	getAlertTemplate() {
		return {
			id: "",
			title: "",
			description: "",
			severity: "info", // info, warning, severe
			routes: [],
			startTime: null,
			endTime: null
		};
	},

	/**
	 * Fetch arrivals for a stop
	 * @param {string} stopId - Stop identifier
	 * @returns {Promise<Array>}
	 */
	async fetchArrivals(stopId) {
		throw new Error("fetchArrivals() must be implemented by provider");
	},

	/**
	 * Fetch route directions
	 * @param {object} origin - Origin location
	 * @param {object} destination - Destination location
	 * @param {object} options - Route options
	 * @returns {Promise<object>}
	 */
	async fetchRoute(origin, destination, options = {}) {
		throw new Error("fetchRoute() must be implemented by provider");
	},

	/**
	 * Fetch service alerts
	 * @param {Array} routes - Route IDs to filter (optional)
	 * @returns {Promise<Array>}
	 */
	async fetchAlerts(routes = []) {
		throw new Error("fetchAlerts() must be implemented by provider");
	},

	/**
	 * Generate a share URL for a route
	 * @param {object} route - Route data
	 * @returns {string}
	 */
	getShareUrl(route) {
		return null;
	},

	/**
	 * Get vehicle type icon
	 * @param {string} type - Vehicle type
	 * @returns {string}
	 */
	getVehicleIcon(type) {
		const icons = {
			bus: "fa-bus",
			subway: "fa-train-subway",
			rail: "fa-train",
			tram: "fa-train-tram",
			ferry: "fa-ferry",
			walk: "fa-person-walking",
			bike: "fa-bicycle",
			car: "fa-car"
		};
		return icons[type] || "fa-route";
	},

	/**
	 * Format arrival time as relative string
	 * @param {Date} time - Arrival time
	 * @returns {string}
	 */
	formatRelativeTime(time) {
		if (!time) return "";

		const now = new Date();
		const diffMs = time - now;
		const diffMins = Math.round(diffMs / 60000);

		if (diffMins < 0) return "Departed";
		if (diffMins === 0) return "Now";
		if (diffMins === 1) return "1 min";
		if (diffMins < 60) return `${diffMins} min`;

		const hours = Math.floor(diffMins / 60);
		const mins = diffMins % 60;
		return `${hours}h ${mins}m`;
	}
});

// Provider registry
TransitProvider.providers = {};

/**
 * Register a transit provider
 * @param {string} id - Provider identifier
 * @param {object} provider - Provider implementation
 */
TransitProvider.register = function (id, provider) {
	TransitProvider.providers[id.toLowerCase()] = TransitProvider.extend(provider);
};

/**
 * Get a provider instance
 * @param {string} id - Provider identifier
 * @param {object} config - Provider configuration
 * @param {object} module - Parent module reference
 * @returns {TransitProvider}
 */
TransitProvider.getInstance = function (id, config, module) {
	const Provider = TransitProvider.providers[id.toLowerCase()];
	if (!Provider) {
		throw new Error(`Unknown transit provider: ${id}`);
	}
	const instance = new Provider();
	instance.init(config, module);
	return instance;
};

/**
 * List available providers
 * @returns {string[]}
 */
TransitProvider.getAvailableProviders = function () {
	return Object.keys(TransitProvider.providers);
};

module.exports = TransitProvider;
