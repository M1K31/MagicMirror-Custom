/**
 * Transit Module for MagicMirror
 *
 * Displays real-time transit arrivals, route planning, and service alerts.
 * Supports multiple providers including Google Maps and Apple Maps.
 *
 * Features:
 * - Real-time arrival predictions
 * - Route planning with turn-by-turn
 * - Route sharing (deep links)
 * - Service alerts
 * - Walking time adjustment
 * - Multiple stops/routes
 * - Touch/voice control support
 */

/* global Module, Log */

Module.register("transit", {
	/**
	 * Default module configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Transit provider: "google", "apple", "citymapper"
		provider: "google",

		// API key (required for most providers)
		apiKey: "",

		// Home location (for route planning)
		home: {
			lat: null,
			lon: null,
			address: ""
		},

		// Favorite stops to monitor
		stops: [
			// { id: "stop_id", name: "Station Name", routes: ["1", "2"], walkTime: 5 }
		],

		// Saved routes
		routes: [
			// { name: "To Work", from: "home", to: { lat: 0, lon: 0 }, mode: "transit" }
		],

		// Show service alerts
		showAlerts: true,

		// Maximum arrivals per stop
		maxArrivals: 5,

		// Maximum routes to display
		maxRoutes: 3,

		// Update interval (ms)
		updateInterval: 60000,

		// Show walking time to stop
		showWalkTime: true,

		// Default walking speed (m/s)
		walkingSpeed: 1.4,

		// Show route sharing links
		showShareLinks: true,

		// Compact display mode
		compact: false,

		// Animation speed (ms)
		animationSpeed: 1000,

		// Time format: "relative" or "absolute"
		timeFormat: "relative",

		// Show vehicle icons
		showVehicleIcons: true,

		// Filter by transit type: "all", "bus", "subway", "rail", "tram", "ferry"
		transitTypes: "all"
	},

	/**
	 * Vehicle type icons
	 */
	vehicleIcons: {
		bus: "fa-bus",
		subway: "fa-train-subway",
		rail: "fa-train",
		tram: "fa-train-tram",
		ferry: "fa-ferry",
		walk: "fa-person-walking",
		bike: "fa-bicycle",
		car: "fa-car",
		default: "fa-route"
	},

	/**
	 * Required scripts
	 */
	getScripts() {
		return ["moment.js", "modules/shared/utils.js"];
	},

	/**
	 * Required styles
	 */
	getStyles() {
		return ["transit.css", "font-awesome.css"];
	},

	/**
	 * Module start
	 */
	start() {
		Log.info(`[${this.name}] Starting module`);

		// Initialize state
		this.arrivals = {};
		this.routeInfo = {};
		this.alerts = [];
		this.loaded = false;
		this.error = null;

		// Start fetching data
		this.getData();
		this.scheduleUpdate();

		// Register voice commands
		if (this.config.mode === "voice") {
			this.registerVoiceCommands();
		}
	},

	/**
	 * Register voice commands
	 */
	registerVoiceCommands() {
		if (typeof VoiceHandler === "undefined") return;

		VoiceHandler.registerModuleCommands(this.identifier, {
			"next bus": () => this.announceNextArrival("bus"),
			"next train": () => this.announceNextArrival("subway"),
			"transit alerts": () => this.announceAlerts(),
			"how do I get to": (data) => {
				const destination = data.transcript.replace("how do I get to", "").trim();
				this.planRoute(destination);
			},
			"directions to work": () => this.announceRoute("To Work"),
			"directions home": () => this.announceRoute("To Home")
		});
	},

	/**
	 * Schedule data updates
	 */
	scheduleUpdate() {
		setInterval(() => {
			this.getData();
		}, this.config.updateInterval);
	},

	/**
	 * Fetch transit data
	 */
	getData() {
		// Request arrivals for each stop
		this.config.stops.forEach((stop) => {
			this.sendSocketNotification("GET_ARRIVALS", {
				provider: this.config.provider,
				apiKey: this.config.apiKey,
				stopId: stop.id,
				routes: stop.routes,
				maxArrivals: this.config.maxArrivals
			});
		});

		// Request route info for saved routes
		this.config.routes.forEach((route) => {
			const origin = route.from === "home" ? this.config.home : route.from;
			this.sendSocketNotification("GET_ROUTE", {
				provider: this.config.provider,
				apiKey: this.config.apiKey,
				origin,
				destination: route.to,
				mode: route.mode || "transit",
				routeName: route.name
			});
		});

		// Request alerts if enabled
		if (this.config.showAlerts) {
			this.sendSocketNotification("GET_ALERTS", {
				provider: this.config.provider,
				apiKey: this.config.apiKey,
				stops: this.config.stops.map((s) => s.id)
			});
		}
	},

	/**
	 * Handle socket notifications from node_helper
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	socketNotificationReceived(notification, payload) {
		switch (notification) {
			case "ARRIVALS_DATA":
				this.arrivals[payload.stopId] = payload.arrivals;
				this.loaded = true;
				this.error = null;
				this.updateDom(this.config.animationSpeed);
				break;

			case "ROUTE_DATA":
				this.routeInfo[payload.routeName] = payload.route;
				this.updateDom(this.config.animationSpeed);
				break;

			case "ALERTS_DATA":
				this.alerts = payload.alerts || [];
				this.updateDom(this.config.animationSpeed);
				break;

			case "TRANSIT_ERROR":
				this.error = payload.error;
				Log.error(`[${this.name}] Error:`, payload.error);
				this.updateDom(this.config.animationSpeed);
				break;
		}
	},

	/**
	 * Announce next arrival (voice)
	 * @param {string} type - Transit type
	 */
	announceNextArrival(type) {
		let nextArrival = null;
		let stopName = "";

		for (const [stopId, arrivals] of Object.entries(this.arrivals)) {
			const stop = this.config.stops.find((s) => s.id === stopId);
			const filtered = arrivals.filter((a) => !type || a.type === type);

			if (filtered.length > 0) {
				if (!nextArrival || filtered[0].minutesUntil < nextArrival.minutesUntil) {
					nextArrival = filtered[0];
					stopName = stop ? stop.name : stopId;
				}
			}
		}

		if (nextArrival) {
			const text = `The next ${nextArrival.routeName} arrives at ${stopName} in ${nextArrival.minutesUntil} minutes`;
			this.sendNotification("VOICE_SPEAK", { text });
		} else {
			this.sendNotification("VOICE_SPEAK", { text: "No upcoming arrivals found" });
		}
	},

	/**
	 * Announce service alerts (voice)
	 */
	announceAlerts() {
		if (this.alerts.length > 0) {
			const alertText = this.alerts
				.slice(0, 3)
				.map((a) => a.title)
				.join(". ");
			this.sendNotification("VOICE_SPEAK", { text: `Transit alerts: ${alertText}` });
		} else {
			this.sendNotification("VOICE_SPEAK", { text: "No service alerts" });
		}
	},

	/**
	 * Announce route info (voice)
	 * @param {string} routeName - Route name
	 */
	announceRoute(routeName) {
		const route = this.routeInfo[routeName];
		if (route) {
			const text = `${routeName}: ${route.duration} via ${route.summary}`;
			this.sendNotification("VOICE_SPEAK", { text });
		} else {
			this.sendNotification("VOICE_SPEAK", { text: `Route ${routeName} not found` });
		}
	},

	/**
	 * Plan a route to destination
	 * @param {string} destination - Destination query
	 */
	planRoute(destination) {
		this.sendSocketNotification("GET_ROUTE", {
			provider: this.config.provider,
			apiKey: this.config.apiKey,
			origin: this.config.home,
			destination: { query: destination },
			mode: "transit",
			routeName: `To ${destination}`
		});
	},

	/**
	 * Generate share URL for a route
	 * @param {object} route - Route data
	 * @returns {object} Share URLs for different platforms
	 */
	getShareUrls(route) {
		const origin = encodeURIComponent(route.originAddress || "");
		const dest = encodeURIComponent(route.destinationAddress || "");

		return {
			google: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`,
			apple: `https://maps.apple.com/?saddr=${origin}&daddr=${dest}&dirflg=r`,
			citymapper: `https://citymapper.com/directions?startcoord=${route.origin?.lat},${route.origin?.lon}&endcoord=${route.destination?.lat},${route.destination?.lon}`
		};
	},

	/**
	 * Format arrival time
	 * @param {object} arrival - Arrival data
	 * @returns {string} Formatted time
	 */
	formatArrivalTime(arrival) {
		if (this.config.timeFormat === "relative") {
			if (arrival.minutesUntil <= 0) {
				return "Now";
			} else if (arrival.minutesUntil < 60) {
				return `${arrival.minutesUntil} min`;
			} else {
				const hours = Math.floor(arrival.minutesUntil / 60);
				const mins = arrival.minutesUntil % 60;
				return `${hours}h ${mins}m`;
			}
		} else {
			return moment(arrival.time).format("h:mm A");
		}
	},

	/**
	 * Get vehicle icon
	 * @param {string} type - Vehicle type
	 * @returns {string} Font Awesome icon class
	 */
	getVehicleIcon(type) {
		return this.vehicleIcons[type] || this.vehicleIcons.default;
	},

	/**
	 * Get DOM
	 * @returns {HTMLElement}
	 */
	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = `transit-module ${this.config.compact ? "compact" : ""}`;

		// Error state
		if (this.error) {
			wrapper.innerHTML = `<div class="transit-error dimmed small"><i class="fa fa-exclamation-triangle"></i> ${this.error}</div>`;
			return wrapper;
		}

		// Loading state
		if (!this.loaded) {
			wrapper.innerHTML = '<div class="dimmed small">Loading transit data...</div>';
			return wrapper;
		}

		// Alerts section
		if (this.config.showAlerts && this.alerts.length > 0) {
			wrapper.appendChild(this.createAlertsSection());
		}

		// Stops/arrivals section
		if (this.config.stops.length > 0) {
			wrapper.appendChild(this.createArrivalsSection());
		}

		// Routes section
		if (Object.keys(this.routeInfo).length > 0) {
			wrapper.appendChild(this.createRoutesSection());
		}

		// Empty state
		if (wrapper.children.length === 0) {
			wrapper.innerHTML = '<div class="dimmed small">No transit data available</div>';
		}

		return wrapper;
	},

	/**
	 * Create alerts section
	 * @returns {HTMLElement}
	 */
	createAlertsSection() {
		const section = document.createElement("div");
		section.className = "transit-alerts";

		this.alerts.slice(0, 3).forEach((alert) => {
			const alertEl = document.createElement("div");
			alertEl.className = `transit-alert ${alert.severity || ""}`;
			alertEl.innerHTML = `
				<i class="fa fa-triangle-exclamation"></i>
				<span class="alert-title">${alert.title}</span>
			`;
			section.appendChild(alertEl);
		});

		return section;
	},

	/**
	 * Create arrivals section
	 * @returns {HTMLElement}
	 */
	createArrivalsSection() {
		const section = document.createElement("div");
		section.className = "transit-arrivals";

		this.config.stops.forEach((stop) => {
			const arrivals = this.arrivals[stop.id] || [];
			if (arrivals.length === 0) return;

			const stopEl = document.createElement("div");
			stopEl.className = "transit-stop";

			// Stop header
			const header = document.createElement("div");
			header.className = "stop-header";
			header.innerHTML = `
				<span class="stop-name">${stop.name}</span>
				${this.config.showWalkTime && stop.walkTime ? `<span class="stop-walk dimmed xsmall"><i class="fa fa-person-walking"></i> ${stop.walkTime} min</span>` : ""}
			`;
			stopEl.appendChild(header);

			// Arrivals list
			const list = document.createElement("div");
			list.className = "arrivals-list";

			arrivals.slice(0, this.config.maxArrivals).forEach((arrival) => {
				const arrivalEl = document.createElement("div");
				arrivalEl.className = `arrival-item ${arrival.isRealtime ? "realtime" : "scheduled"}`;

				// Vehicle icon
				if (this.config.showVehicleIcons) {
					const icon = document.createElement("span");
					icon.className = "arrival-icon";
					icon.innerHTML = `<i class="fa ${this.getVehicleIcon(arrival.type)}"></i>`;
					arrivalEl.appendChild(icon);
				}

				// Route name/number
				const route = document.createElement("span");
				route.className = "arrival-route";
				if (arrival.color) {
					route.style.backgroundColor = arrival.color;
					route.style.color = this.getContrastColor(arrival.color);
				}
				route.textContent = arrival.routeName;
				arrivalEl.appendChild(route);

				// Destination
				const dest = document.createElement("span");
				dest.className = "arrival-destination dimmed";
				dest.textContent = arrival.destination || "";
				arrivalEl.appendChild(dest);

				// Time
				const time = document.createElement("span");
				time.className = "arrival-time bright";
				time.textContent = this.formatArrivalTime(arrival);
				if (arrival.minutesUntil <= 5) {
					time.classList.add("imminent");
				}
				arrivalEl.appendChild(time);

				list.appendChild(arrivalEl);
			});

			stopEl.appendChild(list);
			section.appendChild(stopEl);
		});

		return section;
	},

	/**
	 * Create routes section
	 * @returns {HTMLElement}
	 */
	createRoutesSection() {
		const section = document.createElement("div");
		section.className = "transit-routes";

		Object.entries(this.routeInfo)
			.slice(0, this.config.maxRoutes)
			.forEach(([name, route]) => {
				const routeEl = document.createElement("div");
				routeEl.className = "transit-route";

				// Route name
				const header = document.createElement("div");
				header.className = "route-header";
				header.innerHTML = `<span class="route-name">${name}</span>`;
				routeEl.appendChild(header);

				// Route details
				const details = document.createElement("div");
				details.className = "route-details";

				// Duration
				const duration = document.createElement("span");
				duration.className = "route-duration bright";
				duration.innerHTML = `<i class="fa fa-clock"></i> ${route.duration}`;
				details.appendChild(duration);

				// Summary
				const summary = document.createElement("span");
				summary.className = "route-summary dimmed small";
				summary.textContent = route.summary;
				details.appendChild(summary);

				routeEl.appendChild(details);

				// Share links (touch mode)
				if (this.config.mode === "touch" && this.config.showShareLinks) {
					const shareUrls = this.getShareUrls(route);
					const links = document.createElement("div");
					links.className = "route-share";

					const googleLink = document.createElement("a");
					googleLink.href = shareUrls.google;
					googleLink.target = "_blank";
					googleLink.innerHTML = '<i class="fa fa-google"></i>';
					googleLink.title = "Open in Google Maps";
					links.appendChild(googleLink);

					const appleLink = document.createElement("a");
					appleLink.href = shareUrls.apple;
					appleLink.target = "_blank";
					appleLink.innerHTML = '<i class="fa fa-apple"></i>';
					appleLink.title = "Open in Apple Maps";
					links.appendChild(appleLink);

					routeEl.appendChild(links);
				}

				section.appendChild(routeEl);
			});

		return section;
	},

	/**
	 * Get contrast color for text on colored background
	 * @param {string} hexColor - Background color
	 * @returns {string} Contrast text color
	 */
	getContrastColor(hexColor) {
		const hex = hexColor.replace("#", "");
		const r = parseInt(hex.substr(0, 2), 16);
		const g = parseInt(hex.substr(2, 2), 16);
		const b = parseInt(hex.substr(4, 2), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? "#000000" : "#ffffff";
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived(notification, payload) {
		switch (notification) {
			case "TRANSIT_REFRESH":
				this.getData();
				break;
			case "TRANSIT_PLAN_ROUTE":
				this.planRoute(payload.destination);
				break;
		}
	}
});
