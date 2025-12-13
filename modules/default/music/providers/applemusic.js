/**
 * Apple Music Provider for Music Module
 *
 * Fetches now playing info from Apple Music via MusicKit JS
 * Note: Full Apple Music API requires Apple Developer membership
 *
 * Setup:
 * 1. Enroll in Apple Developer Program
 * 2. Create MusicKit identifier
 * 3. Generate private key
 * 4. Create developer token (JWT)
 */

const MusicProvider = require("./musicprovider");
const jwt = require("jsonwebtoken");

MusicProvider.register("applemusic", {
	providerName: "Apple Music",

	defaults: {
		teamId: "",
		keyId: "",
		privateKey: "",
		developerToken: null,
		tokenExpiry: 0,
		musicUserToken: "", // User's music token from authorization
		baseUrl: "https://api.music.apple.com/v1"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.teamId || !this.config.keyId || !this.config.privateKey) {
			this.setError("Apple Music team ID, key ID, and private key are required");
			return false;
		}
		return true;
	},

	/**
	 * Generate developer token (JWT)
	 * @returns {string}
	 */
	generateDeveloperToken() {
		// Check if existing token is valid
		if (this.config.developerToken && Date.now() < this.config.tokenExpiry - 60000) {
			return this.config.developerToken;
		}

		const now = Math.floor(Date.now() / 1000);
		const payload = {
			iss: this.config.teamId,
			iat: now,
			exp: now + 15777000 // Max 6 months
		};

		const token = jwt.sign(payload, this.config.privateKey, {
			algorithm: "ES256",
			header: {
				alg: "ES256",
				kid: this.config.keyId
			}
		});

		this.config.developerToken = token;
		this.config.tokenExpiry = (now + 15777000) * 1000;

		return token;
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, options = {}) {
		const token = this.generateDeveloperToken();

		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		};

		// Add user token for personalized endpoints
		if (this.config.musicUserToken) {
			headers["Music-User-Token"] = this.config.musicUserToken;
		}

		const url = `${this.config.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			...options,
			headers: { ...headers, ...options.headers }
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(`Apple Music API error: ${error.errors?.[0]?.detail || response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Fetch now playing info
	 * Note: Apple Music doesn't have a "now playing" endpoint
	 * This requires integration with local playback (AirPlay/HomePod)
	 * @returns {Promise<object>}
	 */
	async fetchNowPlaying() {
		if (!this.validateConfig()) return this.getNowPlayingTemplate();

		try {
			// Apple Music API doesn't provide now playing for remote devices
			// This would need to be obtained from:
			// 1. Local MusicKit JS in browser
			// 2. Home app integration
			// 3. AirPlay device polling

			// Return template with placeholder
			return {
				...this.getNowPlayingTemplate(),
				isPlaying: false,
				error: "Now playing requires local MusicKit integration"
			};
		} catch (error) {
			this.setError(`Apple Music error: ${error.message}`);
			return this.getNowPlayingTemplate();
		}
	},

	/**
	 * Control playback
	 * Note: Requires local MusicKit JS or HomeKit integration
	 * @param {string} action - play, pause, next, previous
	 * @param {object} options - Action options
	 * @returns {Promise<boolean>}
	 */
	async control(action, options = {}) {
		// Apple Music remote control requires:
		// 1. MusicKit JS in browser context
		// 2. HomeKit/HomePod integration
		// 3. Shortcuts automation

		console.warn("[Apple Music] Remote control not available via API");
		return false;
	},

	/**
	 * Set volume
	 * @param {number} volume - Volume level 0-100
	 * @returns {Promise<boolean>}
	 */
	async setVolume(volume) {
		console.warn("[Apple Music] Volume control not available via API");
		return false;
	},

	/**
	 * Seek to position
	 * @param {number} position - Position in seconds
	 * @returns {Promise<boolean>}
	 */
	async seek(position) {
		console.warn("[Apple Music] Seek not available via API");
		return false;
	},

	/**
	 * Search for tracks
	 * @param {string} query - Search query
	 * @param {string} types - Resource types (songs, albums, artists)
	 * @returns {Promise<object>}
	 */
	async search(query, types = "songs") {
		if (!this.validateConfig()) return null;

		try {
			const params = new URLSearchParams({
				term: query,
				types: types,
				limit: "10"
			});

			const data = await this.apiRequest(`/catalog/us/search?${params}`);
			return data.results;
		} catch (error) {
			this.setError(`Apple Music search error: ${error.message}`);
			return null;
		}
	},

	/**
	 * Get user's recently played
	 * Requires user authentication
	 * @returns {Promise<Array>}
	 */
	async getRecentlyPlayed() {
		if (!this.validateConfig() || !this.config.musicUserToken) return [];

		try {
			const data = await this.apiRequest("/me/recent/played");
			return data.data || [];
		} catch (error) {
			this.setError(`Apple Music recent error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Get user's library playlists
	 * @returns {Promise<Array>}
	 */
	async getPlaylists() {
		if (!this.validateConfig() || !this.config.musicUserToken) return [];

		try {
			const data = await this.apiRequest("/me/library/playlists");
			return data.data || [];
		} catch (error) {
			this.setError(`Apple Music playlists error: ${error.message}`);
			return [];
		}
	}
});

module.exports = MusicProvider;
