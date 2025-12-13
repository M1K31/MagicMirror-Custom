/**
 * Base Fitness Provider
 *
 * Abstract base class for all fitness data providers.
 * Extends the BaseProvider pattern for fitness-specific functionality.
 */

const BaseProvider = require("../../../shared/baseprovider");

const FitnessProvider = BaseProvider.extend({
	providerName: "FitnessProvider",

	// Standard fitness data structure
	defaults: {
		updateInterval: 300000 // 5 minutes
	},

	/**
	 * Parse provider data into standard fitness format
	 * @returns {object} Standardized fitness data
	 */
	getStandardData() {
		return {
			steps: 0,
			distance: 0, // in meters
			calories: 0, // active calories
			activeMinutes: 0,
			floors: 0,
			heartRate: null, // { current, resting, min, max }
			sleep: null, // { duration (mins), quality, startTime, endTime }
			weekData: [], // Array of daily data for past 7 days
			goals: null // { steps, distance, calories, activeMinutes, floors }
		};
	},

	/**
	 * Validate required configuration
	 * Override in implementations
	 * @returns {boolean}
	 */
	validateConfig() {
		return true;
	},

	/**
	 * Authenticate with the provider
	 * Override in implementations that require OAuth
	 * @returns {Promise<boolean>}
	 */
	async authenticate() {
		return true;
	},

	/**
	 * Refresh the authentication token
	 * Override in implementations that require OAuth
	 * @returns {Promise<boolean>}
	 */
	async refreshToken() {
		return true;
	}
});

// Provider registry
FitnessProvider.providers = {};

/**
 * Register a fitness provider
 * @param {string} id - Provider identifier
 * @param {object} provider - Provider implementation
 */
FitnessProvider.register = function (id, provider) {
	FitnessProvider.providers[id.toLowerCase()] = FitnessProvider.extend(provider);
};

/**
 * Get a provider instance
 * @param {string} id - Provider identifier
 * @param {object} config - Provider configuration
 * @param {object} module - Parent module reference
 * @returns {FitnessProvider}
 */
FitnessProvider.getInstance = function (id, config, module) {
	const Provider = FitnessProvider.providers[id.toLowerCase()];
	if (!Provider) {
		throw new Error(`Unknown fitness provider: ${id}`);
	}
	const instance = new Provider();
	instance.init(config, module);
	return instance;
};

/**
 * List available providers
 * @returns {string[]}
 */
FitnessProvider.getAvailableProviders = function () {
	return Object.keys(FitnessProvider.providers);
};

module.exports = FitnessProvider;
