/**
 * Transit Module Node Helper
 *
 * Handles server-side operations for the transit module:
 * - API calls to transit providers
 * - Data parsing and normalization
 * - Caching to reduce API calls
 */

const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	/**
	 * Start the node helper
	 */
	start() {
		console.log(`[${this.name}] Node helper started`);
		this.cache = {};
		this.cacheTimeout = 30000; // 30 seconds
	},

	/**
	 * Handle socket notifications from the module
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived(notification, payload) {
		switch (notification) {
			case "GET_ARRIVALS":
				this.getArrivals(payload);
				break;
			case "GET_ROUTE":
				this.getRoute(payload);
				break;
			case "GET_ALERTS":
				this.getAlerts(payload);
				break;
		}
	},

	/**
	 * Get arrivals for a stop
	 * @param {object} config - Request configuration
	 */
	async getArrivals(config) {
		const cacheKey = `arrivals_${config.stopId}`;

		// Check cache
		if (this.isCacheValid(cacheKey)) {
			this.sendSocketNotification("ARRIVALS_DATA", {
				stopId: config.stopId,
				arrivals: this.cache[cacheKey].data
			});
			return;
		}

		try {
			let arrivals;

			switch (config.provider) {
				case "google":
					arrivals = await this.getGoogleArrivals(config);
					break;
				case "apple":
					arrivals = await this.getAppleArrivals(config);
					break;
				default:
					arrivals = await this.getMockArrivals(config);
			}

			// Cache and send
			this.setCache(cacheKey, arrivals);
			this.sendSocketNotification("ARRIVALS_DATA", {
				stopId: config.stopId,
				arrivals
			});
		} catch (error) {
			console.error(`[${this.name}] Error fetching arrivals:`, error.message);
			this.sendSocketNotification("TRANSIT_ERROR", {
				error: error.message,
				stopId: config.stopId
			});
		}
	},

	/**
	 * Get route information
	 * @param {object} config - Request configuration
	 */
	async getRoute(config) {
		const cacheKey = `route_${config.routeName}`;

		// Check cache
		if (this.isCacheValid(cacheKey)) {
			this.sendSocketNotification("ROUTE_DATA", {
				routeName: config.routeName,
				route: this.cache[cacheKey].data
			});
			return;
		}

		try {
			let route;

			switch (config.provider) {
				case "google":
					route = await this.getGoogleRoute(config);
					break;
				case "apple":
					route = await this.getAppleRoute(config);
					break;
				default:
					route = await this.getMockRoute(config);
			}

			// Cache and send
			this.setCache(cacheKey, route);
			this.sendSocketNotification("ROUTE_DATA", {
				routeName: config.routeName,
				route
			});
		} catch (error) {
			console.error(`[${this.name}] Error fetching route:`, error.message);
			this.sendSocketNotification("TRANSIT_ERROR", {
				error: error.message,
				routeName: config.routeName
			});
		}
	},

	/**
	 * Get service alerts
	 * @param {object} config - Request configuration
	 */
	async getAlerts(config) {
		try {
			let alerts;

			switch (config.provider) {
				case "google":
					alerts = await this.getGoogleAlerts(config);
					break;
				default:
					alerts = [];
			}

			this.sendSocketNotification("ALERTS_DATA", { alerts });
		} catch (error) {
			console.error(`[${this.name}] Error fetching alerts:`, error.message);
			this.sendSocketNotification("ALERTS_DATA", { alerts: [] });
		}
	},

	/**
	 * Get arrivals from Google Maps API
	 * @param {object} config - Request configuration
	 * @returns {Promise<Array>} Arrivals
	 */
	async getGoogleArrivals(config) {
		if (!config.apiKey) {
			throw new Error("Google Maps API key required");
		}

		// Google doesn't have a direct real-time transit API for arrivals
		// You would need to use a GTFS feed or transit agency API
		// This is a placeholder that would be replaced with actual implementation

		// For demonstration, return mock data
		return this.getMockArrivals(config);
	},

	/**
	 * Get route from Google Maps Directions API
	 * @param {object} config - Request configuration
	 * @returns {Promise<object>} Route data
	 */
	async getGoogleRoute(config) {
		if (!config.apiKey) {
			throw new Error("Google Maps API key required");
		}

		const origin = this.formatLocation(config.origin);
		const destination = this.formatLocation(config.destination);

		const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=transit&key=${config.apiKey}`;

		const response = await fetch(url);
		const data = await response.json();

		if (data.status !== "OK") {
			throw new Error(data.error_message || `Google API error: ${data.status}`);
		}

		const route = data.routes[0];
		const leg = route.legs[0];

		return {
			duration: leg.duration.text,
			durationValue: leg.duration.value,
			distance: leg.distance.text,
			distanceValue: leg.distance.value,
			summary: route.summary,
			steps: leg.steps.map((step) => ({
				instruction: step.html_instructions.replace(/<[^>]*>/g, ""),
				duration: step.duration.text,
				distance: step.distance.text,
				mode: step.travel_mode.toLowerCase(),
				transitDetails: step.transit_details
					? {
							line: step.transit_details.line.short_name || step.transit_details.line.name,
							vehicle: step.transit_details.line.vehicle.type.toLowerCase(),
							departureStop: step.transit_details.departure_stop.name,
							arrivalStop: step.transit_details.arrival_stop.name,
							numStops: step.transit_details.num_stops,
							color: step.transit_details.line.color
						}
					: null
			})),
			origin: { lat: leg.start_location.lat, lon: leg.start_location.lng },
			destination: { lat: leg.end_location.lat, lon: leg.end_location.lng },
			originAddress: leg.start_address,
			destinationAddress: leg.end_address,
			departureTime: leg.departure_time?.text,
			arrivalTime: leg.arrival_time?.text
		};
	},

	/**
	 * Get arrivals from Apple Maps (via MapKit JS requires client-side)
	 * @param {object} config - Request configuration
	 * @returns {Promise<Array>} Arrivals
	 */
	async getAppleArrivals(config) {
		// Apple Maps doesn't provide real-time transit arrivals API
		// Would need to use local transit agency GTFS feeds
		return this.getMockArrivals(config);
	},

	/**
	 * Get route from Apple Maps
	 * @param {object} config - Request configuration
	 * @returns {Promise<object>} Route data
	 */
	async getAppleRoute(config) {
		// Apple MapKit requires client-side authentication
		// Server-side would require Apple Maps Server API (limited)
		return this.getMockRoute(config);
	},

	/**
	 * Get alerts from Google (placeholder)
	 * @param {object} config - Request configuration
	 * @returns {Promise<Array>} Alerts
	 */
	async getGoogleAlerts(config) {
		// Google doesn't provide transit alerts directly
		// Would need to use GTFS-RT feeds from transit agencies
		return [];
	},

	/**
	 * Get mock arrivals for testing
	 * @param {object} config - Request configuration
	 * @returns {Array} Mock arrivals
	 */
	getMockArrivals(config) {
		const now = Date.now();
		const routes = config.routes || ["1", "2", "A"];

		return routes.flatMap((route, i) => [
			{
				routeName: route,
				destination: "Downtown",
				type: i % 2 === 0 ? "bus" : "subway",
				time: new Date(now + (3 + i * 2) * 60000),
				minutesUntil: 3 + i * 2,
				isRealtime: true,
				color: i % 2 === 0 ? "#0039A6" : "#EE352E"
			},
			{
				routeName: route,
				destination: "Uptown",
				type: i % 2 === 0 ? "bus" : "subway",
				time: new Date(now + (12 + i * 3) * 60000),
				minutesUntil: 12 + i * 3,
				isRealtime: false,
				color: i % 2 === 0 ? "#0039A6" : "#EE352E"
			}
		]);
	},

	/**
	 * Get mock route for testing
	 * @param {object} config - Request configuration
	 * @returns {object} Mock route
	 */
	getMockRoute(config) {
		return {
			duration: "25 min",
			durationValue: 1500,
			distance: "5.2 mi",
			distanceValue: 8369,
			summary: "via A Train",
			steps: [
				{
					instruction: "Walk to 42nd Street Station",
					duration: "5 min",
					distance: "0.3 mi",
					mode: "walking"
				},
				{
					instruction: "Take the A train toward Far Rockaway",
					duration: "15 min",
					distance: "4.5 mi",
					mode: "transit",
					transitDetails: {
						line: "A",
						vehicle: "subway",
						departureStop: "42nd Street",
						arrivalStop: "14th Street",
						numStops: 5,
						color: "#0039A6"
					}
				},
				{
					instruction: "Walk to destination",
					duration: "5 min",
					distance: "0.4 mi",
					mode: "walking"
				}
			],
			origin: config.origin,
			destination: config.destination,
			originAddress: "Times Square, New York, NY",
			destinationAddress: "Union Square, New York, NY",
			departureTime: "Now",
			arrivalTime: "in 25 min"
		};
	},

	/**
	 * Format location for API request
	 * @param {object} location - Location object
	 * @returns {string} Formatted location string
	 */
	formatLocation(location) {
		if (!location) return "";

		if (location.query) {
			return encodeURIComponent(location.query);
		}

		if (location.lat && location.lon) {
			return `${location.lat},${location.lon}`;
		}

		if (location.address) {
			return encodeURIComponent(location.address);
		}

		return "";
	},

	/**
	 * Check if cache is valid
	 * @param {string} key - Cache key
	 * @returns {boolean}
	 */
	isCacheValid(key) {
		const cached = this.cache[key];
		if (!cached) return false;
		return Date.now() - cached.timestamp < this.cacheTimeout;
	},

	/**
	 * Set cache value
	 * @param {string} key - Cache key
	 * @param {*} data - Data to cache
	 */
	setCache(key, data) {
		this.cache[key] = {
			data,
			timestamp: Date.now()
		};
	},

	/**
	 * Clear cache
	 */
	clearCache() {
		this.cache = {};
	}
});
