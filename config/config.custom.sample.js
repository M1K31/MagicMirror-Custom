/* Custom Modules Config Sample
 *
 * This file contains sample configurations for all custom MagicMirror modules.
 * Copy relevant sections to your config.js file and update with your credentials.
 *
 * All modules support three interaction modes:
 * - "display": Read-only display
 * - "touch": Touch-enabled controls
 * - "voice": Voice command support
 */

// ============================================================================
// TIMER MODULE
// Simple countdown timer with touch/voice control
// ============================================================================
const timerConfig = {
	module: "timer",
	position: "top_right",
	config: {
		mode: "touch",              // "display", "touch", or "voice"
		defaultMinutes: 5,          // Default timer duration
		showSeconds: true,          // Show seconds in display
		showControls: true,         // Show start/pause/reset buttons
		sound: "chime.mp3",         // Sound file on completion
		soundVolume: 0.7,           // Volume 0-1
		animateLastMinute: true,    // Pulse animation in final minute
		presets: [                  // Quick timer presets
			{ name: "Tea", minutes: 3 },
			{ name: "Eggs", minutes: 7 },
			{ name: "Workout", minutes: 30 }
		]
	}
};

// ============================================================================
// COUNTDOWN MODULE
// Countdown to events/dates
// ============================================================================
const countdownConfig = {
	module: "countdown",
	position: "top_left",
	header: "Upcoming",
	config: {
		mode: "display",
		events: [
			{
				name: "Christmas",
				date: "2025-12-25",
				icon: "fa-tree",
				color: "#c41e3a"
			},
			{
				name: "New Year",
				date: "2026-01-01T00:00:00",
				icon: "fa-champagne-glasses",
				color: "#ffd700"
			},
			{
				name: "Birthday",
				date: "2025-06-15",
				recurring: "yearly"        // "yearly", "monthly", or null
			}
		],
		showDays: true,
		showHours: true,
		showMinutes: true,
		showSeconds: false,            // Usually too fast for glanceable
		maxEvents: 3,                  // Maximum events to display
		hideExpired: true,             // Hide events after they pass
		compact: false                 // Compact display mode
	}
};

// ============================================================================
// QUOTES MODULE
// Inspirational quotes with categories
// ============================================================================
const quotesConfig = {
	module: "quotes",
	position: "lower_third",
	config: {
		mode: "display",
		categories: ["inspirational", "wisdom", "motivation"],
		updateInterval: 30000,         // 30 seconds
		fadeSpeed: 4000,               // Fade transition speed
		showAuthor: true,
		showCategory: false,
		random: true,
		textAlign: "center",
		customQuotes: [
			{ text: "Your custom quote here.", author: "You" }
		],
		// Optional: load quotes from external JSON file
		// remoteFile: "modules/quotes/data/quotes.json"
	}
};

// ============================================================================
// TRANSIT MODULE
// Real-time transit arrivals and route planning
// ============================================================================
const transitConfig = {
	module: "transit",
	position: "bottom_left",
	header: "Transit",
	config: {
		mode: "touch",
		provider: "google",            // "google", "apple", "citymapper"
		apiKey: "YOUR_GOOGLE_MAPS_API_KEY",

		home: {
			lat: 40.7128,
			lon: -74.0060,
			address: "123 Main St, New York, NY"
		},

		stops: [
			{
				id: "stop_123",
				name: "Broadway & 42nd",
				routes: ["1", "2", "3"],
				walkTime: 3                // Minutes to walk to stop
			}
		],

		routes: [
			{
				name: "To Work",
				from: "home",
				to: { lat: 40.7580, lon: -73.9855 },
				mode: "transit"            // "transit", "driving", "walking", "bicycling"
			}
		],

		showAlerts: true,
		maxArrivals: 5,
		showWalkTime: true,
		showShareLinks: true,          // Show deep links for maps apps
		timeFormat: "relative"         // "relative" or "absolute"
	}
};

// ============================================================================
// MUSIC MODULE
// Now playing with controls
// ============================================================================
const musicConfig = {
	module: "music",
	position: "bottom_right",
	config: {
		mode: "touch",
		provider: "spotify",           // "spotify", "applemusic", "youtube", "airplay"

		// Spotify configuration
		spotify: {
			clientId: "YOUR_SPOTIFY_CLIENT_ID",
			clientSecret: "YOUR_SPOTIFY_CLIENT_SECRET",
			refreshToken: "YOUR_REFRESH_TOKEN"
			// Get refresh token via OAuth flow - see documentation
		},

		// Apple Music configuration
		applemusic: {
			developerToken: "YOUR_DEVELOPER_TOKEN",
			musicUserToken: "USER_MUSIC_TOKEN"
		},

		// AirPlay configuration (detects local AirPlay devices)
		airplay: {
			deviceName: "Living Room"
		},

		showAlbumArt: true,
		showProgress: true,
		showControls: true,
		hideWhenIdle: false,
		idleTimeout: 300000            // Hide after 5 min of no music
	}
};

// ============================================================================
// SMARTHOME MODULE
// Smart home device control
// ============================================================================
const smarthomeConfig = {
	module: "smarthome",
	position: "middle_center",
	header: "Home",
	config: {
		mode: "touch",
		provider: "homeassistant",     // "homeassistant", "homekit", "google", "smartthings"

		// Home Assistant configuration
		homeassistant: {
			url: "http://homeassistant.local:8123",
			accessToken: "YOUR_LONG_LIVED_ACCESS_TOKEN",
			// Filter entities to display
			entities: [
				"light.living_room",
				"switch.fan",
				"climate.thermostat",
				"sensor.temperature"
			]
		},

		// HomeKit configuration (via Homebridge)
		homekit: {
			homebridgeUrl: "http://localhost:8581",
			username: "admin",
			password: "admin"
		},

		// SmartThings configuration
		smartthings: {
			accessToken: "YOUR_SMARTTHINGS_TOKEN"
		},

		// Display options
		showRooms: true,               // Group by room
		showScenes: true,              // Show scene buttons
		scenes: ["Good Morning", "Movie Time", "Bedtime"],
		compactMode: false,
		showTemperature: true,
		showHumidity: true
	}
};

// ============================================================================
// FITNESS MODULE
// Health and fitness tracking
// ============================================================================
const fitnessConfig = {
	module: "fitness",
	position: "top_right",
	header: "Today's Activity",
	config: {
		mode: "display",
		provider: "fitbit",            // "fitbit", "garmin", "applehealth", "strava"

		// Fitbit configuration
		fitbit: {
			clientId: "YOUR_FITBIT_CLIENT_ID",
			clientSecret: "YOUR_FITBIT_CLIENT_SECRET",
			refreshToken: "YOUR_REFRESH_TOKEN"
		},

		// Garmin configuration
		garmin: {
			email: "your@email.com",
			password: "your_password"
		},

		// Apple Health (via exported data)
		applehealth: {
			dataPath: "/path/to/export.xml"
		},

		// Strava configuration
		strava: {
			clientId: "YOUR_STRAVA_CLIENT_ID",
			clientSecret: "YOUR_STRAVA_CLIENT_SECRET",
			refreshToken: "YOUR_REFRESH_TOKEN"
		},

		// Display options
		metrics: ["steps", "distance", "calories", "activeMinutes"],
		showGoals: true,
		showRings: true,               // Apple-style activity rings
		showSleep: false,
		showHeartRate: false,
		showWeekSummary: false,
		compactMode: false,

		// Goals (overrides provider defaults)
		goals: {
			steps: 10000,
			distance: 8,               // km
			calories: 500,
			activeMinutes: 30
		},

		units: {
			distance: "km"             // "km" or "mi"
		},

		updateInterval: 300000         // 5 minutes
	}
};

// ============================================================================
// PACKAGES MODULE
// Package tracking
// ============================================================================
const packagesConfig = {
	module: "packages",
	position: "bottom_left",
	header: "Packages",
	config: {
		mode: "display",
		provider: "aftership",         // "aftership", "usps", "fedex", "ups"

		// AfterShip configuration (recommended - supports 900+ carriers)
		aftership: {
			apiKey: "YOUR_AFTERSHIP_API_KEY"
		},

		// USPS configuration
		usps: {
			userId: "YOUR_USPS_USER_ID"
		},

		// FedEx configuration
		fedex: {
			clientId: "YOUR_FEDEX_CLIENT_ID",
			clientSecret: "YOUR_FEDEX_CLIENT_SECRET"
		},

		// UPS configuration
		ups: {
			clientId: "YOUR_UPS_CLIENT_ID",
			clientSecret: "YOUR_UPS_CLIENT_SECRET"
		},

		// Packages to track
		packages: [
			{
				trackingNumber: "1Z999AA10123456784",
				carrier: "ups",
				name: "New Phone"          // Custom friendly name
			},
			{
				trackingNumber: "9400111899223456789012",
				carrier: "usps",
				name: "Books"
			}
		],

		// Display options
		maxPackages: 5,
		showDelivered: true,           // Show delivered packages
		hideDeliveredAfter: 86400000,  // Hide 24h after delivery (ms)
		showCarrierIcon: true,
		compact: false,
		updateInterval: 900000         // 15 minutes
	}
};

// ============================================================================
// COMPLETE EXAMPLE CONFIG
// Full config.js with all modules
// ============================================================================
/*
let config = {
	address: "localhost",
	port: 8080,
	basePath: "/",
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],
	language: "en",
	locale: "en-US",
	timeFormat: 24,
	units: "metric",

	modules: [
		{ module: "alert" },
		{ module: "clock", position: "top_left" },
		timerConfig,
		countdownConfig,
		quotesConfig,
		transitConfig,
		musicConfig,
		smarthomeConfig,
		fitnessConfig,
		packagesConfig
	]
};

if (typeof module !== "undefined") { module.exports = config; }
*/
