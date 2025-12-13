/**
 * Spotify Provider for Music Module
 *
 * Fetches now playing and controls playback via Spotify Web API
 *
 * Setup:
 * 1. Create app at https://developer.spotify.com/dashboard
 * 2. Add redirect URI (http://localhost:8080/callback)
 * 3. Get client ID and secret
 * 4. Use OAuth flow to get refresh token
 *    - Required scopes: user-read-playback-state, user-modify-playback-state, user-read-currently-playing
 *
 * Credentials can be set via environment variables:
 * - SPOTIFY_CLIENT_ID
 * - SPOTIFY_CLIENT_SECRET
 * - SPOTIFY_REFRESH_TOKEN
 */

const MusicProvider = require("./musicprovider");

MusicProvider.register("spotify", {
	providerName: "Spotify",

	defaults: {
		// Support environment variables for credentials
		clientId: process.env.SPOTIFY_CLIENT_ID || "",
		clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
		refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || "",
		accessToken: "",
		tokenExpiry: 0,
		baseUrl: "https://api.spotify.com/v1"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.clientId || !this.config.clientSecret) {
			this.setError("Spotify client ID and secret are required. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.");
			return false;
		}
		if (!this.config.refreshToken) {
			this.setError("Spotify refresh token is required. Set SPOTIFY_REFRESH_TOKEN environment variable.");
			return false;
		}
		return true;
	},

	/**
	 * Authenticate/refresh OAuth token
	 * @returns {Promise<boolean>}
	 */
	async authenticate() {
		// Check if current token is still valid
		if (this.config.accessToken && Date.now() < this.config.tokenExpiry - 60000) {
			return true;
		}

		const tokenUrl = "https://accounts.spotify.com/api/token";
		const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");

		const response = await fetch(tokenUrl, {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: `grant_type=refresh_token&refresh_token=${this.config.refreshToken}`
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Spotify auth failed: ${error.error_description || response.statusText}`);
		}

		const data = await response.json();
		this.config.accessToken = data.access_token;
		this.config.tokenExpiry = Date.now() + data.expires_in * 1000;

		// Spotify may return a new refresh token
		if (data.refresh_token) {
			this.config.refreshToken = data.refresh_token;
		}

		return true;
	},

	/**
	 * Make authenticated API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>}
	 */
	async apiRequest(endpoint, options = {}) {
		await this.authenticate();

		const url = endpoint.startsWith("http") ? endpoint : `${this.config.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.config.accessToken}`,
				"Content-Type": "application/json",
				...options.headers
			}
		});

		// 204 No Content is valid for control endpoints
		if (response.status === 204) {
			return { success: true };
		}

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(`Spotify API error: ${error.error?.message || response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Fetch now playing info
	 * @returns {Promise<object>}
	 */
	async fetchNowPlaying() {
		if (!this.validateConfig()) return this.getNowPlayingTemplate();

		try {
			const data = await this.apiRequest("/me/player");

			// No active playback
			if (!data || !data.item) {
				return {
					...this.getNowPlayingTemplate(),
					isPlaying: false
				};
			}

			const track = data.item;
			const artistNames = track.artists.map((a) => a.name).join(", ");

			return {
				isPlaying: data.is_playing,
				track: {
					name: track.name,
					artist: artistNames,
					album: track.album?.name || "",
					duration: Math.round(track.duration_ms / 1000),
					albumArt: track.album?.images?.[0]?.url || null,
					uri: track.uri
				},
				progress: Math.round((data.progress_ms || 0) / 1000),
				device: {
					name: data.device?.name || "Unknown",
					type: data.device?.type?.toLowerCase() || "speaker",
					volume: data.device?.volume_percent || 0
				},
				context: {
					type: data.context?.type || "",
					name: data.context?.uri || ""
				},
				shuffle: data.shuffle_state || false,
				repeat: data.repeat_state || "off"
			};
		} catch (error) {
			this.setError(`Spotify error: ${error.message}`);
			return this.getNowPlayingTemplate();
		}
	},

	/**
	 * Control playback
	 * @param {string} action - play, pause, next, previous, shuffle, repeat
	 * @param {object} options - Action options
	 * @returns {Promise<boolean>}
	 */
	async control(action, options = {}) {
		if (!this.validateConfig()) return false;

		try {
			let endpoint = "";
			let method = "PUT";
			let body = null;

			switch (action) {
				case "play":
					endpoint = "/me/player/play";
					if (options.uri) {
						body = JSON.stringify({
							uris: Array.isArray(options.uri) ? options.uri : [options.uri]
						});
					}
					break;

				case "pause":
					endpoint = "/me/player/pause";
					break;

				case "next":
					endpoint = "/me/player/next";
					method = "POST";
					break;

				case "previous":
					endpoint = "/me/player/previous";
					method = "POST";
					break;

				case "shuffle":
					endpoint = `/me/player/shuffle?state=${options.state !== false}`;
					break;

				case "repeat":
					// off, track, context
					endpoint = `/me/player/repeat?state=${options.state || "off"}`;
					break;

				default:
					throw new Error(`Unknown action: ${action}`);
			}

			await this.apiRequest(endpoint, { method, body });
			return true;
		} catch (error) {
			this.setError(`Spotify control error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Set volume
	 * @param {number} volume - Volume level 0-100
	 * @returns {Promise<boolean>}
	 */
	async setVolume(volume) {
		if (!this.validateConfig()) return false;

		try {
			const level = Math.max(0, Math.min(100, Math.round(volume)));
			await this.apiRequest(`/me/player/volume?volume_percent=${level}`, { method: "PUT" });
			return true;
		} catch (error) {
			this.setError(`Spotify volume error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Seek to position
	 * @param {number} position - Position in seconds
	 * @returns {Promise<boolean>}
	 */
	async seek(position) {
		if (!this.validateConfig()) return false;

		try {
			const positionMs = Math.round(position * 1000);
			await this.apiRequest(`/me/player/seek?position_ms=${positionMs}`, { method: "PUT" });
			return true;
		} catch (error) {
			this.setError(`Spotify seek error: ${error.message}`);
			return false;
		}
	},

	/**
	 * Get available devices
	 * @returns {Promise<Array>}
	 */
	async getDevices() {
		if (!this.validateConfig()) return [];

		try {
			const data = await this.apiRequest("/me/player/devices");
			return data.devices || [];
		} catch (error) {
			this.setError(`Spotify devices error: ${error.message}`);
			return [];
		}
	},

	/**
	 * Transfer playback to device
	 * @param {string} deviceId - Device ID
	 * @param {boolean} play - Start playing
	 * @returns {Promise<boolean>}
	 */
	async transferPlayback(deviceId, play = false) {
		if (!this.validateConfig()) return false;

		try {
			await this.apiRequest("/me/player", {
				method: "PUT",
				body: JSON.stringify({
					device_ids: [deviceId],
					play: play
				})
			});
			return true;
		} catch (error) {
			this.setError(`Spotify transfer error: ${error.message}`);
			return false;
		}
	}
});

module.exports = MusicProvider;
