/**
 * Apple Maps Transit Provider
 *
 * Fetches transit data using Apple MapKit JS
 * Provides directions and estimated travel times
 *
 * Setup:
 * 1. Enroll in Apple Developer Program
 * 2. Create a Maps ID and private key
 * 3. Generate JWT token for authorization
 *
 * Note: Apple Maps doesn't provide real-time transit arrivals
 * This provider focuses on route planning and estimated times
 */

const TransitProvider = require("./transitprovider");
const jwt = require("jsonwebtoken");

TransitProvider.register("apple", {
	providerName: "Apple",

	defaults: {
		teamId: "",
		keyId: "",
		privateKey: "", // PEM format or path to .p8 file
		token: null,
		tokenExpiry: 0,
		baseUrl: "https://maps-api.apple.com/v1"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.teamId || !this.config.keyId || !this.config.privateKey) {
			this.setError("Apple Maps team ID, key ID, and private key are required");
			return false;
		}
		return true;
	},

	/**
	 * Generate JWT token for Apple Maps
	 * @returns {string}
	 */
	generateToken() {
		// Check if existing token is valid
		if (this.config.token && Date.now() < this.config.tokenExpiry - 60000) {
			return this.config.token;
		}

		const now = Math.floor(Date.now() / 1000);
		const payload = {
			iss: this.config.teamId,
			iat: now,
			exp: now + 3600 // 1 hour
		};

		const token = jwt.sign(payload, this.config.privateKey, {
			algorithm: "ES256",
			header: {
				alg: "ES256",
				kid: this.config.keyId,
				typ: "JWT"
			}
		});

		this.config.token = token;
		this.config.tokenExpiry = (now + 3600) * 1000;

		return token;
	},

	/**
	 * Make authenticated request to Apple Maps API
	 * @param {string} endpoint - API endpoint
	 * @param {object} params - Query parameters
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, params = {}) {
		const token = this.generateToken();

		const url = new URL(`${this.config.baseUrl}${endpoint}`);
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, value);
			}
		});

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Apple Maps API error: ${response.status} - ${error}`);
		}

		return response.json();
	},

	/**
	 * Fetch arrivals for a stop
	 * Note: Apple Maps doesn't provide real-time arrivals
	 * @param {object} stop - Stop configuration
	 * @returns {Promise<Array>}
	 */
	async fetchArrivals(stop) {
		// Apple Maps API doesn't support real-time transit arrivals
		// Return empty array - would need to integrate with local transit APIs
		console.warn("[Apple Transit] Real-time arrivals not available from Apple Maps");
		return [];
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
				origin: `${origin.lat},${origin.lon}`,
				destination: `${destination.lat},${destination.lon}`,
				transportType: this.mapTransportType(options.mode || "transit"),
				departureDate: options.departureTime
					? new Date(options.departureTime).toISOString()
					: new Date().toISOString()
			};

			const data = await this.apiRequest("/directions", params);

			if (!data.routes || data.routes.length === 0) {
				return null;
			}

			const route = data.routes[0];

			return {
				origin: {
					name: origin.address || `${origin.lat}, ${origin.lon}`,
					lat: origin.lat,
					lon: origin.lon
				},
				destination: {
					name: destination.address || `${destination.lat}, ${destination.lon}`,
					lat: destination.lat,
					lon: destination.lon
				},
				duration: Math.round(route.expectedTravelTimeSeconds / 60),
				distance: route.distanceMeters,
				departureTime: new Date(route.steps[0]?.startTime || Date.now()),
				arrivalTime: new Date(Date.now() + route.expectedTravelTimeSeconds * 1000),
				legs: this.parseSteps(route.steps),
				fare: null, // Apple Maps doesn't provide fare info
				shareUrl: this.getShareUrl({
					origin,
					destination
				})
			};
		} catch (error) {
			this.setError(`Apple route error: ${error.message}`);
			return null;
		}
	},

	/**
	 * Parse route steps into legs
	 * @param {Array} steps - Route steps
	 * @returns {Array}
	 */
	parseSteps(steps) {
		if (!steps) return [];

		return steps.map((step) => ({
			mode: this.mapTransitMode(step.transportType),
			duration: Math.round((step.durationSeconds || 0) / 60),
			distance: step.distanceMeters || 0,
			instructions: step.instructions || "",
			startLocation: step.startLocation
				? { lat: step.startLocation.latitude, lon: step.startLocation.longitude }
				: null,
			endLocation: step.endLocation
				? { lat: step.endLocation.latitude, lon: step.endLocation.longitude }
				: null,
			transit: step.transitInfo
				? {
					line: step.transitInfo.lineShortName || step.transitInfo.lineName,
					lineName: step.transitInfo.lineName,
					lineColor: step.transitInfo.lineColor,
					vehicleType: this.mapTransitMode(step.transitInfo.vehicleType),
					departureStop: step.transitInfo.departureStopName,
					arrivalStop: step.transitInfo.arrivalStopName,
					headsign: step.transitInfo.headsign
				}
				: null
		}));
	},

	/**
	 * Fetch service alerts
	 * Note: Apple Maps doesn't provide transit alerts API
	 * @param {Array} routes - Route IDs to filter
	 * @returns {Promise<Array>}
	 */
	async fetchAlerts(routes = []) {
		return [];
	},

	/**
	 * Generate Apple Maps share URL
	 * @param {object} route - Route data
	 * @returns {string}
	 */
	getShareUrl(route) {
		if (!route.origin || !route.destination) return null;

		// Apple Maps URL scheme
		const saddr = `${route.origin.lat},${route.origin.lon}`;
		const daddr = `${route.destination.lat},${route.destination.lon}`;

		// Universal link that works on web and iOS
		return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=r`;
	},

	/**
	 * Map transport type to Apple Maps format
	 * @param {string} mode - Transport mode
	 * @returns {string}
	 */
	mapTransportType(mode) {
		const mapping = {
			transit: "Transit",
			walking: "Walking",
			driving: "Automobile",
			cycling: "Bicycle"
		};
		return mapping[mode] || "Transit";
	},

	/**
	 * Map Apple transit mode to standard type
	 * @param {string} appleType - Apple vehicle type
	 * @returns {string}
	 */
	mapTransitMode(appleType) {
		const mapping = {
			Bus: "bus",
			Subway: "subway",
			LightRail: "tram",
			CommuterRail: "rail",
			HeavyRail: "rail",
			Ferry: "ferry",
			Walking: "walk"
		};
		return mapping[appleType] || "bus";
	}
});

module.exports = TransitProvider;
