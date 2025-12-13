/**
 * Base Music Provider
 *
 * Abstract base class for all music/audio providers.
 * Provides standardized data structures for now playing, playback control.
 */

const BaseProvider = require("../../../shared/baseprovider");

const MusicProvider = BaseProvider.extend({
	providerName: "MusicProvider",

	defaults: {
		updateInterval: 5000 // 5 seconds for now playing
	},

	/**
	 * Standard now playing data structure
	 * @returns {object}
	 */
	getNowPlayingTemplate() {
		return {
			isPlaying: false,
			track: {
				name: "",
				artist: "",
				album: "",
				duration: 0, // seconds
				albumArt: null, // URL
				uri: null // Track URI for playback
			},
			progress: 0, // seconds
			device: {
				name: "",
				type: "", // speaker, phone, computer, etc.
				volume: 0 // 0-100
			},
			context: {
				type: "", // album, playlist, artist, etc.
				name: ""
			},
			shuffle: false,
			repeat: "off" // off, track, context
		};
	},

	/**
	 * Fetch now playing info
	 * @returns {Promise<object>}
	 */
	async fetchNowPlaying() {
		throw new Error("fetchNowPlaying() must be implemented by provider");
	},

	/**
	 * Control playback
	 * @param {string} action - play, pause, next, previous, shuffle, repeat
	 * @param {object} options - Action-specific options
	 * @returns {Promise<boolean>}
	 */
	async control(action, options = {}) {
		throw new Error("control() must be implemented by provider");
	},

	/**
	 * Set volume
	 * @param {number} volume - Volume level 0-100
	 * @returns {Promise<boolean>}
	 */
	async setVolume(volume) {
		throw new Error("setVolume() must be implemented by provider");
	},

	/**
	 * Seek to position
	 * @param {number} position - Position in seconds
	 * @returns {Promise<boolean>}
	 */
	async seek(position) {
		throw new Error("seek() must be implemented by provider");
	},

	/**
	 * Format duration as mm:ss
	 * @param {number} seconds - Duration in seconds
	 * @returns {string}
	 */
	formatDuration(seconds) {
		if (!seconds || seconds < 0) return "0:00";

		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	},

	/**
	 * Calculate progress percentage
	 * @param {number} progress - Current position
	 * @param {number} duration - Total duration
	 * @returns {number}
	 */
	getProgressPercent(progress, duration) {
		if (!duration || duration === 0) return 0;
		return Math.min(100, Math.round((progress / duration) * 100));
	}
});

// Provider registry
MusicProvider.providers = {};

/**
 * Register a music provider
 * @param {string} id - Provider identifier
 * @param {object} provider - Provider implementation
 */
MusicProvider.register = function (id, provider) {
	MusicProvider.providers[id.toLowerCase()] = MusicProvider.extend(provider);
};

/**
 * Get a provider instance
 * @param {string} id - Provider identifier
 * @param {object} config - Provider configuration
 * @param {object} module - Parent module reference
 * @returns {MusicProvider}
 */
MusicProvider.getInstance = function (id, config, module) {
	const Provider = MusicProvider.providers[id.toLowerCase()];
	if (!Provider) {
		throw new Error(`Unknown music provider: ${id}`);
	}
	const instance = new Provider();
	instance.init(config, module);
	return instance;
};

/**
 * List available providers
 * @returns {string[]}
 */
MusicProvider.getAvailableProviders = function () {
	return Object.keys(MusicProvider.providers);
};

module.exports = MusicProvider;
