/**
 * Node Helper for Fitness Module
 *
 * Handles server-side operations for fitness data providers:
 * - OAuth token management
 * - API requests with proper credentials
 * - Data caching
 * - Provider initialization
 */

const NodeHelper = require("node_helper");
const path = require("path");
const fs = require("fs");

// Load providers
const FitnessProvider = require("./providers/fitnessprovider");
require("./providers/fitbit");
require("./providers/garmin");
require("./providers/applehealth");
require("./providers/strava");

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start() {
		console.log(`[Fitness] Node helper started`);
		this.providers = {};
		this.cache = {};
		this.cacheExpiry = {};
	},

	/**
	 * Handle socket notifications from the module
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived(notification, payload) {
		switch (notification) {
			case "FITNESS_INIT":
				this.initProvider(payload);
				break;

			case "FITNESS_REFRESH":
				this.refreshData(payload);
				break;

			case "FITNESS_GET_AUTH_URL":
				this.getAuthUrl(payload);
				break;

			case "FITNESS_EXCHANGE_TOKEN":
				this.exchangeToken(payload);
				break;
		}
	},

	/**
	 * Initialize a fitness provider
	 * @param {object} payload - Provider configuration
	 */
	async initProvider(payload) {
		const { provider, config, moduleId } = payload;

		try {
			// Check if provider is already initialized
			if (this.providers[moduleId]) {
				console.log(`[Fitness] Provider already initialized for module ${moduleId}`);
				await this.refreshData(payload);
				return;
			}

			// Merge saved tokens if available
			const savedConfig = this.loadSavedConfig(provider);
			const mergedConfig = { ...config, ...savedConfig };

			// Create provider instance
			const providerInstance = FitnessProvider.getInstance(provider, mergedConfig, null);
			this.providers[moduleId] = providerInstance;

			console.log(`[Fitness] Initialized ${provider} provider`);

			// Fetch initial data
			await this.fetchProviderData(moduleId, providerInstance);
		} catch (error) {
			console.error(`[Fitness] Init error: ${error.message}`);
			this.sendSocketNotification("FITNESS_ERROR", {
				error: error.message,
				provider: provider
			});
		}
	},

	/**
	 * Refresh data from provider
	 * @param {object} payload - Provider configuration
	 */
	async refreshData(payload) {
		const { provider, config, moduleId } = payload;

		try {
			let providerInstance = this.providers[moduleId];

			// Initialize if not already
			if (!providerInstance) {
				await this.initProvider(payload);
				return;
			}

			// Check cache
			const cacheKey = `${moduleId}-${provider}`;
			if (this.isCacheValid(cacheKey)) {
				console.log(`[Fitness] Returning cached data for ${provider}`);
				this.sendSocketNotification("FITNESS_DATA", this.cache[cacheKey]);
				return;
			}

			await this.fetchProviderData(moduleId, providerInstance);
		} catch (error) {
			console.error(`[Fitness] Refresh error: ${error.message}`);
			this.sendSocketNotification("FITNESS_ERROR", {
				error: error.message,
				provider: provider
			});
		}
	},

	/**
	 * Fetch data from a provider instance
	 * @param {string} moduleId - Module identifier
	 * @param {object} provider - Provider instance
	 */
	async fetchProviderData(moduleId, provider) {
		try {
			const data = await provider.fetchData();

			// Cache the data
			const cacheKey = `${moduleId}-${provider.providerName}`;
			this.cache[cacheKey] = data;
			this.cacheExpiry[cacheKey] = Date.now() + 60000; // 1 minute cache

			// Save tokens if they were refreshed
			if (provider.config.accessToken) {
				this.saveConfig(provider.providerName.toLowerCase(), {
					accessToken: provider.config.accessToken,
					refreshToken: provider.config.refreshToken,
					tokenExpiry: provider.config.tokenExpiry
				});
			}

			this.sendSocketNotification("FITNESS_DATA", data);
		} catch (error) {
			throw error;
		}
	},

	/**
	 * Check if cached data is still valid
	 * @param {string} key - Cache key
	 * @returns {boolean}
	 */
	isCacheValid(key) {
		return this.cache[key] && this.cacheExpiry[key] > Date.now();
	},

	/**
	 * Load saved configuration (tokens) for a provider
	 * @param {string} provider - Provider name
	 * @returns {object}
	 */
	loadSavedConfig(provider) {
		const configPath = path.join(__dirname, `.${provider}_config.json`);

		try {
			if (fs.existsSync(configPath)) {
				const data = fs.readFileSync(configPath, "utf-8");
				return JSON.parse(data);
			}
		} catch (error) {
			console.warn(`[Fitness] Could not load saved config: ${error.message}`);
		}

		return {};
	},

	/**
	 * Save configuration (tokens) for a provider
	 * @param {string} provider - Provider name
	 * @param {object} config - Configuration to save
	 */
	saveConfig(provider, config) {
		const configPath = path.join(__dirname, `.${provider}_config.json`);

		try {
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
			console.log(`[Fitness] Saved config for ${provider}`);
		} catch (error) {
			console.warn(`[Fitness] Could not save config: ${error.message}`);
		}
	},

	/**
	 * Get OAuth authorization URL for a provider
	 * @param {object} payload - Provider details
	 */
	getAuthUrl(payload) {
		const { provider, clientId, redirectUri } = payload;

		let authUrl = "";

		switch (provider) {
			case "fitbit":
				authUrl = `https://www.fitbit.com/oauth2/authorize?` +
					`response_type=code&client_id=${clientId}` +
					`&redirect_uri=${encodeURIComponent(redirectUri)}` +
					`&scope=activity%20heartrate%20sleep%20profile`;
				break;

			case "strava":
				authUrl = `https://www.strava.com/oauth/authorize?` +
					`client_id=${clientId}` +
					`&redirect_uri=${encodeURIComponent(redirectUri)}` +
					`&response_type=code` +
					`&scope=activity:read_all`;
				break;

			case "garmin":
				// Garmin doesn't have a public OAuth flow for consumer devices
				this.sendSocketNotification("FITNESS_AUTH_ERROR", {
					error: "Garmin requires email/password authentication",
					provider: provider
				});
				return;
		}

		this.sendSocketNotification("FITNESS_AUTH_URL", {
			url: authUrl,
			provider: provider
		});
	},

	/**
	 * Exchange authorization code for tokens
	 * @param {object} payload - Auth code and provider details
	 */
	async exchangeToken(payload) {
		const { provider, code, clientId, clientSecret, redirectUri } = payload;

		try {
			let tokenUrl = "";
			let body = {};

			switch (provider) {
				case "fitbit":
					tokenUrl = "https://api.fitbit.com/oauth2/token";
					body = {
						grant_type: "authorization_code",
						code: code,
						redirect_uri: redirectUri
					};
					break;

				case "strava":
					tokenUrl = "https://www.strava.com/oauth/token";
					body = {
						client_id: clientId,
						client_secret: clientSecret,
						code: code,
						grant_type: "authorization_code"
					};
					break;
			}

			const headers = {
				"Content-Type": "application/x-www-form-urlencoded"
			};

			// Fitbit requires Basic auth
			if (provider === "fitbit") {
				const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
				headers.Authorization = `Basic ${auth}`;
			}

			const response = await fetch(tokenUrl, {
				method: "POST",
				headers: headers,
				body: new URLSearchParams(body)
			});

			if (!response.ok) {
				throw new Error(`Token exchange failed: ${response.statusText}`);
			}

			const data = await response.json();

			// Save tokens
			this.saveConfig(provider, {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				tokenExpiry: Date.now() + (data.expires_in * 1000)
			});

			this.sendSocketNotification("FITNESS_TOKEN_SAVED", {
				provider: provider,
				success: true
			});
		} catch (error) {
			console.error(`[Fitness] Token exchange error: ${error.message}`);
			this.sendSocketNotification("FITNESS_AUTH_ERROR", {
				error: error.message,
				provider: provider
			});
		}
	}
});
