/**
 * Music Node Helper
 *
 * Handles server-side API integration for music providers:
 * - Spotify Web API
 * - Apple Music API
 * - YouTube Music (via YouTube Data API)
 * - Airplay (local detection via mDNS)
 */

const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
	/**
	 * Node helper start
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
		this.providers = {};
		this.tokenRefreshTimers = {};
	},

	/**
	 * Handle socket notifications from frontend
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "MUSIC_INIT":
				this.initProvider(payload);
				break;
			case "MUSIC_GET_STATE":
				this.getPlaybackState(payload);
				break;
			case "MUSIC_PLAY":
				this.play(payload);
				break;
			case "MUSIC_PAUSE":
				this.pause(payload);
				break;
			case "MUSIC_NEXT":
				this.next(payload);
				break;
			case "MUSIC_PREVIOUS":
				this.previous(payload);
				break;
			case "MUSIC_SEEK":
				this.seek(payload);
				break;
		}
	},

	/**
	 * Initialize provider
	 * @param {object} payload - Init payload
	 */
	initProvider: async function (payload) {
		const { provider, config } = payload;

		try {
			switch (provider) {
				case "spotify":
					await this.initSpotify(config);
					break;
				case "applemusic":
					await this.initAppleMusic(config);
					break;
				case "youtubemusic":
					await this.initYouTubeMusic(config);
					break;
				case "airplay":
					await this.initAirplay(config);
					break;
				default:
					throw new Error(`Unknown provider: ${provider}`);
			}

			this.sendSocketNotification("MUSIC_CONNECTED", { provider });
		} catch (error) {
			Log.error(`[${this.name}] Failed to init ${provider}:`, error.message);
			this.sendSocketNotification("MUSIC_ERROR", {
				error: `Failed to connect to ${provider}: ${error.message}`
			});
		}
	},

	// ==========================================
	// SPOTIFY
	// ==========================================

	/**
	 * Initialize Spotify connection
	 * @param {object} config - Spotify config
	 */
	initSpotify: async function (config) {
		this.providers.spotify = {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			refreshToken: config.refreshToken,
			accessToken: null,
			tokenExpiry: 0,
			market: config.market || "US"
		};

		// Get initial access token
		await this.refreshSpotifyToken();
		Log.info(`[${this.name}] Connected to Spotify`);
	},

	/**
	 * Refresh Spotify access token
	 */
	refreshSpotifyToken: async function () {
		const provider = this.providers.spotify;
		if (!provider) return;

		const auth = Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64");

		const response = await fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: provider.refreshToken
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Spotify token refresh failed: ${error}`);
		}

		const data = await response.json();
		provider.accessToken = data.access_token;
		provider.tokenExpiry = Date.now() + data.expires_in * 1000;

		// Schedule next refresh
		if (this.tokenRefreshTimers.spotify) {
			clearTimeout(this.tokenRefreshTimers.spotify);
		}
		this.tokenRefreshTimers.spotify = setTimeout(
			() => this.refreshSpotifyToken(),
			(data.expires_in - 60) * 1000 // Refresh 1 minute before expiry
		);

		Log.info(`[${this.name}] Spotify token refreshed, expires in ${data.expires_in}s`);
	},

	/**
	 * Make Spotify API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>} Response data
	 */
	spotifyRequest: async function (endpoint, options = {}) {
		const provider = this.providers.spotify;
		if (!provider) throw new Error("Spotify not initialized");

		// Check token expiry
		if (Date.now() > provider.tokenExpiry - 60000) {
			await this.refreshSpotifyToken();
		}

		const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
			...options,
			headers: {
				Authorization: `Bearer ${provider.accessToken}`,
				"Content-Type": "application/json",
				...options.headers
			}
		});

		if (response.status === 204) {
			return null;
		}

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Spotify API error: ${response.status} - ${error}`);
		}

		return response.json();
	},

	/**
	 * Get Spotify playback state
	 * @returns {Promise<object>} Playback state
	 */
	getSpotifyState: async function () {
		try {
			const data = await this.spotifyRequest("/me/player?additional_types=track,episode");

			if (!data || !data.item) {
				return { isPlaying: false, track: null };
			}

			const item = data.item;
			const isEpisode = item.type === "episode";

			return {
				isPlaying: data.is_playing,
				progress: data.progress_ms,
				duration: item.duration_ms,
				track: {
					id: item.id,
					name: item.name,
					artist: isEpisode ? item.show?.name : item.artists?.map((a) => a.name).join(", "),
					album: isEpisode ? item.show?.name : item.album?.name,
					albumArt: isEpisode ? item.images?.[0]?.url : item.album?.images?.[0]?.url,
					duration: item.duration_ms,
					explicit: item.explicit,
					url: item.external_urls?.spotify
				},
				queue: []
			};
		} catch (error) {
			Log.error(`[${this.name}] Spotify state error:`, error.message);
			return { isPlaying: false, track: null, error: error.message };
		}
	},

	/**
	 * Control Spotify playback
	 * @param {string} action - Action to perform
	 * @param {object} options - Action options
	 */
	controlSpotify: async function (action, options = {}) {
		try {
			switch (action) {
				case "play":
					await this.spotifyRequest("/me/player/play", { method: "PUT" });
					break;
				case "pause":
					await this.spotifyRequest("/me/player/pause", { method: "PUT" });
					break;
				case "next":
					await this.spotifyRequest("/me/player/next", { method: "POST" });
					break;
				case "previous":
					await this.spotifyRequest("/me/player/previous", { method: "POST" });
					break;
				case "seek":
					await this.spotifyRequest(`/me/player/seek?position_ms=${options.position}`, { method: "PUT" });
					break;
			}
		} catch (error) {
			Log.error(`[${this.name}] Spotify control error:`, error.message);
		}
	},

	// ==========================================
	// APPLE MUSIC
	// ==========================================

	/**
	 * Initialize Apple Music connection
	 * @param {object} config - Apple Music config
	 */
	initAppleMusic: async function (config) {
		this.providers.applemusic = {
			developerToken: config.developerToken,
			userToken: config.userToken
		};

		// Verify tokens work
		await this.appleMusicRequest("/v1/me/library/songs?limit=1");
		Log.info(`[${this.name}] Connected to Apple Music`);
	},

	/**
	 * Make Apple Music API request
	 * @param {string} endpoint - API endpoint
	 * @param {object} options - Fetch options
	 * @returns {Promise<object>} Response data
	 */
	appleMusicRequest: async function (endpoint, options = {}) {
		const provider = this.providers.applemusic;
		if (!provider) throw new Error("Apple Music not initialized");

		const response = await fetch(`https://api.music.apple.com${endpoint}`, {
			...options,
			headers: {
				Authorization: `Bearer ${provider.developerToken}`,
				"Music-User-Token": provider.userToken,
				"Content-Type": "application/json",
				...options.headers
			}
		});

		if (!response.ok) {
			throw new Error(`Apple Music API error: ${response.status}`);
		}

		return response.json();
	},

	/**
	 * Get Apple Music playback state
	 * Note: Apple Music doesn't have a direct "now playing" API
	 * This would require MusicKit JS in the browser or a companion app
	 * @returns {Promise<object>} Playback state
	 */
	getAppleMusicState: async function () {
		// Apple Music API doesn't provide real-time playback state
		// This would need to be implemented via MusicKit JS on the client side
		// or by integrating with a companion iOS/macOS app

		return {
			isPlaying: false,
			track: null,
			message: "Apple Music playback requires MusicKit JS integration"
		};
	},

	// ==========================================
	// YOUTUBE MUSIC
	// ==========================================

	/**
	 * Initialize YouTube Music connection
	 * @param {object} config - YouTube Music config
	 */
	initYouTubeMusic: async function (config) {
		this.providers.youtubemusic = {
			apiKey: config.apiKey,
			channelId: config.channelId
		};

		Log.info(`[${this.name}] YouTube Music initialized`);
	},

	/**
	 * Get YouTube Music state
	 * Note: YouTube doesn't have a direct playback API
	 * This is limited functionality
	 * @returns {Promise<object>} Playback state
	 */
	getYouTubeMusicState: async function () {
		// YouTube Music doesn't have a public API for playback state
		// Would need browser extension or companion app integration

		return {
			isPlaying: false,
			track: null,
			message: "YouTube Music playback requires browser extension"
		};
	},

	// ==========================================
	// AIRPLAY
	// ==========================================

	/**
	 * Initialize Airplay detection
	 * @param {object} config - Airplay config
	 */
	initAirplay: async function (config) {
		this.providers.airplay = {
			serverName: config.serverName,
			enabled: config.enabled
		};

		// Try to detect local media playback
		// This would use system-level APIs on macOS/Linux

		Log.info(`[${this.name}] Airplay detection initialized`);
	},

	/**
	 * Get Airplay state
	 * Attempts to detect local media playback
	 * @returns {Promise<object>} Playback state
	 */
	getAirplayState: async function () {
		// On Linux, we could try to get now playing info from:
		// - MPRIS D-Bus interface
		// - playerctl command

		try {
			const { exec } = require("child_process");

			return new Promise((resolve) => {
				// Try playerctl first (works with most Linux media players)
				exec("playerctl metadata --format '{{artist}}|||{{title}}|||{{album}}|||{{artUrl}}|||{{status}}'", (error, stdout) => {
					if (error || !stdout.trim()) {
						resolve({ isPlaying: false, track: null });
						return;
					}

					const parts = stdout.trim().split("|||");
					if (parts.length < 5) {
						resolve({ isPlaying: false, track: null });
						return;
					}

					const [artist, title, album, artUrl, status] = parts;

					resolve({
						isPlaying: status.toLowerCase() === "playing",
						track: {
							id: `local-${title}-${artist}`.replace(/\s+/g, "-"),
							name: title || "Unknown",
							artist: artist || "Unknown",
							album: album || "",
							albumArt: artUrl || null
						},
						progress: 0,
						duration: 0
					});
				});
			});
		} catch (error) {
			Log.error(`[${this.name}] Airplay/local detection error:`, error.message);
			return { isPlaying: false, track: null };
		}
	},

	/**
	 * Control local playback via playerctl
	 * @param {string} action - Action to perform
	 */
	controlAirplay: async function (action) {
		const { exec } = require("child_process");

		const commands = {
			play: "playerctl play",
			pause: "playerctl pause",
			next: "playerctl next",
			previous: "playerctl previous"
		};

		const cmd = commands[action];
		if (cmd) {
			exec(cmd, (error) => {
				if (error) {
					Log.warn(`[${this.name}] playerctl error:`, error.message);
				}
			});
		}
	},

	// ==========================================
	// COMMON METHODS
	// ==========================================

	/**
	 * Get playback state from configured provider
	 * @param {object} payload - Request payload
	 */
	getPlaybackState: async function (payload) {
		try {
			let state = { isPlaying: false, track: null };

			switch (payload.provider) {
				case "spotify":
					state = await this.getSpotifyState();
					break;
				case "applemusic":
					state = await this.getAppleMusicState();
					break;
				case "youtubemusic":
					state = await this.getYouTubeMusicState();
					break;
				case "airplay":
					state = await this.getAirplayState();
					break;
			}

			this.sendSocketNotification("MUSIC_STATE", state);
		} catch (error) {
			Log.error(`[${this.name}] Failed to get playback state:`, error.message);
			this.sendSocketNotification("MUSIC_ERROR", {
				error: error.message
			});
		}
	},

	/**
	 * Play
	 * @param {object} payload - Request payload
	 */
	play: async function (payload) {
		switch (payload.provider) {
			case "spotify":
				await this.controlSpotify("play");
				break;
			case "airplay":
				await this.controlAirplay("play");
				break;
		}
	},

	/**
	 * Pause
	 * @param {object} payload - Request payload
	 */
	pause: async function (payload) {
		switch (payload.provider) {
			case "spotify":
				await this.controlSpotify("pause");
				break;
			case "airplay":
				await this.controlAirplay("pause");
				break;
		}
	},

	/**
	 * Next track
	 * @param {object} payload - Request payload
	 */
	next: async function (payload) {
		switch (payload.provider) {
			case "spotify":
				await this.controlSpotify("next");
				break;
			case "airplay":
				await this.controlAirplay("next");
				break;
		}
	},

	/**
	 * Previous track
	 * @param {object} payload - Request payload
	 */
	previous: async function (payload) {
		switch (payload.provider) {
			case "spotify":
				await this.controlSpotify("previous");
				break;
			case "airplay":
				await this.controlAirplay("previous");
				break;
		}
	},

	/**
	 * Seek to position
	 * @param {object} payload - Request payload with position
	 */
	seek: async function (payload) {
		switch (payload.provider) {
			case "spotify":
				await this.controlSpotify("seek", { position: payload.position });
				break;
		}
	},

	/**
	 * Stop and cleanup
	 */
	stop: function () {
		// Clear token refresh timers
		for (const timer of Object.values(this.tokenRefreshTimers)) {
			clearTimeout(timer);
		}
	}
});
