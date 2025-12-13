/**
 * Google Maps Transit Provider
 *
 * Fetches transit data using Google Maps Platform APIs:
 * - Directions API for route planning
 * - Places API for stop search
 * - Routes API for real-time transit info
 *
 * Setup:
 * 1. Enable APIs in Google Cloud Console
 * 2. Create API key with appropriate restrictions
 * 3. Enable billing (required for most transit features)
 */

const TransitProvider = require("./transitprovider");

TransitProvider.register("google", {
	providerName: "Google",

	defaults: {
		apiKey: "",
		baseUrl: "https://maps.googleapis.com/maps/api",
		transitModes: ["bus", "subway", "train", "tram", "rail"]
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.apiKey) {
			this.setError("Google Maps API key is required");
			return false;
		}
		return true;
	},

	/**
	 * Fetch arrivals for a stop
	 * Note: Google doesn't have a public real-time arrivals API
	 * This uses the Directions API as a workaround
	 * @param {object} stop - Stop configuration
	 * @returns {Promise<Array>}
	 */
	async fetchArrivals(stop) {
		if (!this.validateConfig()) return [];

		try {
			// Use nearby search to get transit station details
			const arrivals = [];

			// For each route the user wants to track
			for (const routeId of stop.routes || []) {
				// Get directions for the next departure
				const directions = await this.getDirectionsFromStop(stop, routeId);

				if (directions && directions.routes && directions.routes.length > 0) {
					const route = directions.routes[0];
					const leg = route.legs[0];

					// Extract transit details
					for (const step of leg.steps || []) {
						if (step.travel_mode === "TRANSIT" && step.transit_details) {
							const transit = step.transit_details;
							const line = transit.line;

							// Check if this matches requested route
							if (stop.routes && !stop.routes.includes(line.short_name) && !stop.routes.includes(line.name)) {
								continue;
							}

							arrivals.push({
								routeId: line.short_name || line.name,
								routeName: line.name,
								routeColor: line.color ? `#${line.color}` : null,
								destination: transit.headsign || transit.arrival_stop?.name,
								vehicleType: this.mapVehicleType(line.vehicle?.type),
								arrivalTime: new Date(transit.departure_time.value * 1000),
								departureTime: new Date(transit.departure_time.value * 1000),
								isRealtime: false, // Google doesn't provide real-time in basic API
								delay: 0,
								platform: transit.departure_stop?.name,
								status: "scheduled"
							});
						}
					}
				}
			}

			return arrivals;
		} catch (error) {
			this.setError(`Google arrivals error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Get directions from a transit stop
	 * @param {object} stop - Stop configuration
	 * @param {string} routeId - Route to track
	 * @returns {Promise<object>}
	 */
	async getDirectionsFromStop(stop, routeId) {
		const origin = stop.location || `${stop.lat},${stop.lon}`;
		// Use a destination far enough to ensure transit is used
		const destination = stop.destination || origin;

		const url = `${this.config.baseUrl}/directions/json?` +
			`origin=${encodeURIComponent(origin)}` +
			`&destination=${encodeURIComponent(destination)}` +
			`&mode=transit` +
			`&transit_mode=${this.config.transitModes.join("|")}` +
			`&departure_time=now` +
			`&alternatives=true` +
			`&key=${this.config.apiKey}`;

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Directions API error: ${response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Fetch route directions
	 * @param {object} origin - Origin location
	 * @param {object} destination - Destination location
	 * @param {object} options - Route options
	 * @returns {Promise<object>}
	 */
	async fetchRoute(origin, destination, options = {}) {
		if (!this.validateConfig()) return null;

		try {
			const originStr = origin.address || `${origin.lat},${origin.lon}`;
			const destStr = destination.address || `${destination.lat},${destination.lon}`;

			const url = `${this.config.baseUrl}/directions/json?` +
				`origin=${encodeURIComponent(originStr)}` +
				`&destination=${encodeURIComponent(destStr)}` +
				`&mode=${options.mode || "transit"}` +
				`&departure_time=${options.departureTime || "now"}` +
				`&alternatives=${options.alternatives !== false}` +
				`&key=${this.config.apiKey}`;

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Directions API error: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
				return null;
			}

			// Parse the first route
			const route = data.routes[0];
			const leg = route.legs[0];

			return {
				origin: {
					name: leg.start_address,
					lat: leg.start_location.lat,
					lon: leg.start_location.lng
				},
				destination: {
					name: leg.end_address,
					lat: leg.end_location.lat,
					lon: leg.end_location.lng
				},
				duration: Math.round(leg.duration.value / 60),
				distance: leg.distance.value,
				departureTime: new Date(leg.departure_time?.value * 1000 || Date.now()),
				arrivalTime: new Date(leg.arrival_time?.value * 1000 || Date.now() + leg.duration.value * 1000),
				legs: this.parseLegs(leg.steps),
				fare: leg.fare ? {
					amount: leg.fare.value,
					currency: leg.fare.currency,
					text: leg.fare.text
				} : null,
				shareUrl: this.getShareUrl({
					origin: { lat: leg.start_location.lat, lon: leg.start_location.lng },
					destination: { lat: leg.end_location.lat, lon: leg.end_location.lng }
				}),
				polyline: route.overview_polyline?.points
			};
		} catch (error) {
			this.setError(`Google route error: ${error.message}`);
			return null;
		}
	},

	/**
	 * Parse direction steps into legs
	 * @param {Array} steps - Direction steps
	 * @returns {Array}
	 */
	parseLegs(steps) {
		const legs = [];

		for (const step of steps) {
			const leg = {
				mode: step.travel_mode.toLowerCase(),
				duration: Math.round(step.duration.value / 60),
				distance: step.distance.value,
				instructions: step.html_instructions?.replace(/<[^>]*>/g, ""),
				startLocation: {
					lat: step.start_location.lat,
					lon: step.start_location.lng
				},
				endLocation: {
					lat: step.end_location.lat,
					lon: step.end_location.lng
				}
			};

			// Add transit details
			if (step.transit_details) {
				const transit = step.transit_details;
				leg.transit = {
					line: transit.line.short_name || transit.line.name,
					lineName: transit.line.name,
					lineColor: transit.line.color ? `#${transit.line.color}` : null,
					vehicleType: this.mapVehicleType(transit.line.vehicle?.type),
					departureStop: transit.departure_stop.name,
					arrivalStop: transit.arrival_stop.name,
					departureTime: new Date(transit.departure_time.value * 1000),
					arrivalTime: new Date(transit.arrival_time.value * 1000),
					headsign: transit.headsign,
					numStops: transit.num_stops
				};
			}

			legs.push(leg);
		}

		return legs;
	},

	/**
	 * Fetch service alerts
	 * Note: Google doesn't provide a public transit alerts API
	 * @param {Array} routes - Route IDs to filter
	 * @returns {Promise<Array>}
	 */
	async fetchAlerts(routes = []) {
		// Google Maps API doesn't provide transit alerts
		// Would need to integrate with local transit agency APIs
		return [];
	},

	/**
	 * Generate Google Maps share URL
	 * @param {object} route - Route data
	 * @returns {string}
	 */
	getShareUrl(route) {
		if (!route.origin || !route.destination) return null;

		const origin = `${route.origin.lat},${route.origin.lon}`;
		const dest = `${route.destination.lat},${route.destination.lon}`;

		return `https://www.google.com/maps/dir/?api=1` +
			`&origin=${origin}` +
			`&destination=${dest}` +
			`&travelmode=transit`;
	},

	/**
	 * Map Google vehicle type to standard type
	 * @param {string} googleType - Google vehicle type
	 * @returns {string}
	 */
	mapVehicleType(googleType) {
		const mapping = {
			BUS: "bus",
			SUBWAY: "subway",
			METRO_RAIL: "subway",
			RAIL: "rail",
			HEAVY_RAIL: "rail",
			COMMUTER_TRAIN: "rail",
			TRAM: "tram",
			LIGHT_RAIL: "tram",
			FERRY: "ferry",
			CABLE_CAR: "tram",
			GONDOLA_LIFT: "tram",
			FUNICULAR: "rail"
		};
		return mapping[googleType] || "bus";
	}
});

module.exports = TransitProvider;
