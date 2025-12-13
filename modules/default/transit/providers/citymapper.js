/**
 * Citymapper Transit Provider
 *
 * Fetches transit data using Citymapper API
 * Provides excellent real-time transit information for supported cities
 *
 * Setup:
 * 1. Apply for API access at https://citymapper.com/enterprise
 * 2. Get API key
 *
 * Note: Citymapper API requires enterprise agreement
 * This implementation uses the public routes for basic functionality
 */

const TransitProvider = require("./transitprovider");

TransitProvider.register("citymapper", {
	providerName: "Citymapper",

	defaults: {
		apiKey: "",
		baseUrl: "https://api.external.citymapper.com/api/1"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.apiKey) {
			this.setError("Citymapper API key is required");
			return false;
		}
		return true;
	},

	/**
	 * Make authenticated request to Citymapper API
	 * @param {string} endpoint - API endpoint
	 * @param {object} params - Query parameters
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, params = {}) {
		const url = new URL(`${this.config.baseUrl}${endpoint}`);
		url.searchParams.append("Citymapper-Partner-Key", this.config.apiKey);

		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, value);
			}
		});

		const response = await fetch(url.toString());

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Citymapper API error: ${response.status} - ${error}`);
		}

		return response.json();
	},

	/**
	 * Fetch arrivals for a stop
	 * @param {object} stop - Stop configuration
	 * @returns {Promise<Array>}
	 */
	async fetchArrivals(stop) {
		if (!this.validateConfig()) return [];

		try {
			// Citymapper uses coordinates for stop lookup
			const params = {
				coords: `${stop.lat},${stop.lon}`
			};

			const data = await this.apiRequest("/departures", params);

			const arrivals = [];

			for (const station of data.stations || []) {
				for (const line of station.lines || []) {
					for (const departure of line.departures || []) {
						// Filter by requested routes if specified
						if (stop.routes && stop.routes.length > 0) {
							if (!stop.routes.includes(line.id) && !stop.routes.includes(line.name)) {
								continue;
							}
						}

						arrivals.push({
							routeId: line.id || line.name,
							routeName: line.name,
							routeColor: line.color ? `#${line.color}` : null,
							destination: departure.headsign || line.direction,
							vehicleType: this.mapVehicleType(line.vehicle_type),
							arrivalTime: departure.time
								? new Date(departure.time)
								: new Date(Date.now() + (departure.minutes || 0) * 60000),
							departureTime: departure.time
								? new Date(departure.time)
								: new Date(Date.now() + (departure.minutes || 0) * 60000),
							isRealtime: departure.live || false,
							delay: departure.delay_seconds || 0,
							platform: departure.platform || station.name,
							status: this.mapStatus(departure)
						});
					}
				}
			}

			// Sort by arrival time
			arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);

			return arrivals;
		} catch (error) {
			this.setError(`Citymapper arrivals error: ${error.message}`);
			return [];
		}
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
			const params = {
				start: `${origin.lat},${origin.lon}`,
				end: `${destination.lat},${destination.lon}`,
				time_type: options.departureTime ? "arrive" : "depart",
				time: options.departureTime || new Date().toISOString()
			};

			const data = await this.apiRequest("/directions/transit", params);

			if (!data.routes || data.routes.length === 0) {
				return null;
			}

			const route = data.routes[0];

			return {
				origin: {
					name: origin.address || route.start?.name || `${origin.lat}, ${origin.lon}`,
					lat: origin.lat,
					lon: origin.lon
				},
				destination: {
					name: destination.address || route.end?.name || `${destination.lat}, ${destination.lon}`,
					lat: destination.lat,
					lon: destination.lon
				},
				duration: route.duration_seconds
					? Math.round(route.duration_seconds / 60)
					: 0,
				distance: route.distance_meters || 0,
				departureTime: new Date(route.start_time || Date.now()),
				arrivalTime: new Date(route.end_time || Date.now()),
				legs: this.parseLegs(route.legs),
				fare: route.price
					? {
						amount: route.price.amount,
						currency: route.price.currency,
						text: route.price.formatted
					}
					: null,
				shareUrl: this.getShareUrl({ origin, destination })
			};
		} catch (error) {
			this.setError(`Citymapper route error: ${error.message}`);
			return null;
		}
	},

	/**
	 * Parse route legs
	 * @param {Array} legs - Route legs
	 * @returns {Array}
	 */
	parseLegs(legs) {
		if (!legs) return [];

		return legs.map((leg) => ({
			mode: this.mapLegMode(leg.travel_mode),
			duration: leg.duration_seconds
				? Math.round(leg.duration_seconds / 60)
				: 0,
			distance: leg.distance_meters || 0,
			instructions: leg.instruction || "",
			startLocation: leg.path?.[0]
				? { lat: leg.path[0].lat, lon: leg.path[0].lon }
				: null,
			endLocation: leg.path?.[leg.path.length - 1]
				? { lat: leg.path[leg.path.length - 1].lat, lon: leg.path[leg.path.length - 1].lon }
				: null,
			transit: leg.line
				? {
					line: leg.line.id || leg.line.name,
					lineName: leg.line.name,
					lineColor: leg.line.color ? `#${leg.line.color}` : null,
					vehicleType: this.mapVehicleType(leg.line.vehicle_type),
					departureStop: leg.stops?.[0]?.name,
					arrivalStop: leg.stops?.[leg.stops.length - 1]?.name,
					headsign: leg.line.headsign,
					numStops: leg.stops?.length || 0
				}
				: null
		}));
	},

	/**
	 * Fetch service alerts
	 * @param {Array} routes - Route IDs to filter
	 * @returns {Promise<Array>}
	 */
	async fetchAlerts(routes = []) {
		if (!this.validateConfig()) return [];

		try {
			const data = await this.apiRequest("/alerts");

			const alerts = [];

			for (const alert of data.alerts || []) {
				// Filter by routes if specified
				if (routes.length > 0) {
					const alertRoutes = alert.affected_lines?.map((l) => l.id) || [];
					if (!alertRoutes.some((r) => routes.includes(r))) {
						continue;
					}
				}

				alerts.push({
					id: alert.id,
					title: alert.header || alert.title,
					description: alert.description || "",
					severity: this.mapSeverity(alert.severity),
					routes: alert.affected_lines?.map((l) => l.name) || [],
					startTime: alert.start_time ? new Date(alert.start_time) : null,
					endTime: alert.end_time ? new Date(alert.end_time) : null
				});
			}

			return alerts;
		} catch (error) {
			this.setError(`Citymapper alerts error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Generate Citymapper share URL
	 * @param {object} route - Route data
	 * @returns {string}
	 */
	getShareUrl(route) {
		if (!route.origin || !route.destination) return null;

		const start = `${route.origin.lat},${route.origin.lon}`;
		const end = `${route.destination.lat},${route.destination.lon}`;

		return `https://citymapper.com/directions?startcoord=${start}&endcoord=${end}`;
	},

	/**
	 * Map Citymapper vehicle type to standard type
	 * @param {string} type - Citymapper vehicle type
	 * @returns {string}
	 */
	mapVehicleType(type) {
		const mapping = {
			bus: "bus",
			subway: "subway",
			metro: "subway",
			underground: "subway",
			rail: "rail",
			train: "rail",
			tram: "tram",
			light_rail: "tram",
			ferry: "ferry",
			boat: "ferry",
			cable_car: "tram"
		};
		return mapping[type?.toLowerCase()] || "bus";
	},

	/**
	 * Map Citymapper leg mode
	 * @param {string} mode - Travel mode
	 * @returns {string}
	 */
	mapLegMode(mode) {
		const mapping = {
			transit: "transit",
			walk: "walk",
			walking: "walk",
			bike: "bike",
			cycling: "bike",
			taxi: "car",
			rideshare: "car"
		};
		return mapping[mode?.toLowerCase()] || mode;
	},

	/**
	 * Map departure status
	 * @param {object} departure - Departure object
	 * @returns {string}
	 */
	mapStatus(departure) {
		if (departure.cancelled) return "cancelled";
		if (departure.delay_seconds > 300) return "delayed";
		if (departure.minutes === 0 || departure.arriving) return "arriving";
		return "scheduled";
	},

	/**
	 * Map alert severity
	 * @param {string} severity - Citymapper severity
	 * @returns {string}
	 */
	mapSeverity(severity) {
		const mapping = {
			high: "severe",
			medium: "warning",
			low: "info"
		};
		return mapping[severity?.toLowerCase()] || "info";
	}
});

module.exports = TransitProvider;
