/**
 * Base Provider Class for MagicMirror Modules
 *
 * Provides a consistent pattern for implementing pluggable data providers.
 * Based on the WeatherProvider pattern from the weather module.
 *
 * Usage:
 *   const BaseProvider = require("../../shared/baseprovider");
 *
 *   BaseProvider.register("myprovider", {
 *     providerName: "My Provider",
 *     defaults: { apiKey: "", updateInterval: 60000 },
 *     start() { this.fetchData(); },
 *     fetchData() { ... }
 *   });
 */

/* global Class, Log */

const BaseProvider = Class.extend({
	// Provider identifier
	providerName: "BaseProvider",

	// Default configuration (override in implementations)
	defaults: {},

	// Reference to the parent module
	module: null,

	// Provider configuration (merged with defaults)
	config: null,

	// Current data
	currentData: null,

	// Loading state
	loading: false,

	// Error state
	error: null,

	// Last update timestamp
	lastUpdate: null,

	/**
	 * Initialize the provider
	 * Called automatically when provider is created
	 * @param {object} config - Provider configuration
	 * @param {object} module - Parent module reference
	 */
	init(config, module) {
		this.config = Object.assign({}, this.defaults, config);
		this.module = module;
		this.currentData = null;
		this.loading = false;
		this.error = null;
		this.lastUpdate = null;
	},

	/**
	 * Start the provider
	 * Override in implementations to begin fetching data
	 */
	start() {
		Log.info(`[${this.providerName}] Provider started`);
	},

	/**
	 * Stop the provider
	 * Override in implementations to clean up resources
	 */
	stop() {
		Log.info(`[${this.providerName}] Provider stopped`);
	},

	/**
	 * Fetch data from the provider
	 * Override in implementations
	 * @returns {Promise} - Resolves with data or rejects with error
	 */
	async fetchData() {
		throw new Error("fetchData() must be implemented by provider");
	},

	/**
	 * Set the current data and notify the module
	 * @param {*} data - The data to set
	 */
	setData(data) {
		this.currentData = data;
		this.lastUpdate = Date.now();
		this.loading = false;
		this.error = null;
		this.updateAvailable();
	},

	/**
	 * Set an error state
	 * @param {string|Error} error - The error message or object
	 */
	setError(error) {
		this.error = error instanceof Error ? error.message : error;
		this.loading = false;
		Log.error(`[${this.providerName}] ${this.error}`);
		this.updateAvailable();
	},

	/**
	 * Notify the module that new data is available
	 * Triggers a DOM update in the parent module
	 */
	updateAvailable() {
		if (this.module) {
			this.module.updateDom(this.module.config.animationSpeed || 1000);
		}
	},

	/**
	 * Get the current data
	 * @returns {*} - The current data
	 */
	getData() {
		return this.currentData;
	},

	/**
	 * Check if data is available
	 * @returns {boolean}
	 */
	hasData() {
		return this.currentData !== null;
	},

	/**
	 * Check if provider is loading
	 * @returns {boolean}
	 */
	isLoading() {
		return this.loading;
	},

	/**
	 * Check if provider has an error
	 * @returns {boolean}
	 */
	hasError() {
		return this.error !== null;
	},

	/**
	 * Get error message
	 * @returns {string|null}
	 */
	getError() {
		return this.error;
	},

	/**
	 * Make an HTTP request with error handling
	 * @param {string} url - The URL to fetch
	 * @param {object} options - Fetch options
	 * @returns {Promise<Response>}
	 */
	async fetch(url, options = {}) {
		this.loading = true;

		const defaultOptions = {
			headers: {
				"User-Agent": `MagicMirror/${global.version || "2.0"}`
			},
			timeout: this.config.timeout || 30000
		};

		const mergedOptions = {
			...defaultOptions,
			...options,
			headers: { ...defaultOptions.headers, ...options.headers }
		};

		try {
			const response = await fetch(url, mergedOptions);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response;
		} catch (error) {
			this.setError(error);
			throw error;
		}
	},

	/**
	 * Fetch JSON data
	 * @param {string} url - The URL to fetch
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>}
	 */
	async fetchJson(url, options = {}) {
		const response = await this.fetch(url, options);
		return response.json();
	},

	/**
	 * Fetch text data
	 * @param {string} url - The URL to fetch
	 * @param {object} options - Fetch options
	 * @returns {Promise<string>}
	 */
	async fetchText(url, options = {}) {
		const response = await this.fetch(url, options);
		return response.text();
	},

	/**
	 * Schedule the next data fetch
	 * @param {number} interval - Interval in milliseconds (defaults to config.updateInterval)
	 */
	scheduleUpdate(interval) {
		const updateInterval = interval || this.config.updateInterval || 60000;

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		this.updateTimer = setTimeout(() => {
			this.fetchData();
		}, updateInterval);
	},

	/**
	 * Clear the update schedule
	 */
	clearSchedule() {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = null;
		}
	}
});

/**
 * Provider Registry
 * Stores all registered providers by type
 */
BaseProvider.providers = {};

/**
 * Register a new provider
 * @param {string} providerType - The type/category of provider (e.g., "transit", "smarthome")
 * @param {string} providerIdentifier - Unique identifier for this provider
 * @param {object} providerDetails - Provider implementation
 */
BaseProvider.register = function (providerType, providerIdentifier, providerDetails) {
	if (!BaseProvider.providers[providerType]) {
		BaseProvider.providers[providerType] = {};
	}

	BaseProvider.providers[providerType][providerIdentifier] = BaseProvider.extend(providerDetails);

	Log.info(`[BaseProvider] Registered ${providerType} provider: ${providerIdentifier}`);
};

/**
 * Initialize a provider instance
 * @param {string} providerType - The type/category of provider
 * @param {string} providerIdentifier - The provider identifier
 * @param {object} config - Provider configuration
 * @param {object} module - Parent module reference
 * @returns {BaseProvider} - Provider instance
 */
BaseProvider.initialize = function (providerType, providerIdentifier, config, module) {
	const providers = BaseProvider.providers[providerType];

	if (!providers) {
		throw new Error(`Unknown provider type: ${providerType}`);
	}

	const ProviderClass = providers[providerIdentifier];

	if (!ProviderClass) {
		const available = Object.keys(providers).join(", ");
		throw new Error(`Unknown ${providerType} provider: ${providerIdentifier}. Available: ${available}`);
	}

	const provider = new ProviderClass();
	provider.init(config, module);

	return provider;
};

/**
 * Get all registered providers for a type
 * @param {string} providerType - The type/category of provider
 * @returns {object} - Map of provider identifiers to classes
 */
BaseProvider.getProviders = function (providerType) {
	return BaseProvider.providers[providerType] || {};
};

/**
 * Check if a provider is registered
 * @param {string} providerType - The type/category of provider
 * @param {string} providerIdentifier - The provider identifier
 * @returns {boolean}
 */
BaseProvider.isRegistered = function (providerType, providerIdentifier) {
	const providers = BaseProvider.providers[providerType];
	return providers && providerIdentifier in providers;
};

// Export for use in modules
if (typeof module !== "undefined") {
	module.exports = BaseProvider;
}
