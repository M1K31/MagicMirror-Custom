/**
 * Music Module for MagicMirror
 *
 * Displays now playing information from multiple providers:
 * - Spotify
 * - Apple Music
 * - YouTube Music
 * - Airplay (local detection)
 *
 * Follows Apple HIG principles adapted for mirror display:
 * - Album art focused design
 * - Clear track information
 * - Subtle progress bar
 * - Touch controls (optional)
 */

/* global Log, Module */

Module.register("music", {
	/**
	 * Default configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Provider configuration
		provider: "spotify",

		// Spotify configuration
		spotify: {
			clientId: "",
			clientSecret: "",
			refreshToken: "",
			market: "US"
		},

		// Apple Music configuration
		appleMusic: {
			developerToken: "",
			userToken: ""
		},

		// YouTube Music configuration
		youtubeMusic: {
			apiKey: "",
			channelId: ""
		},

		// Airplay detection configuration
		airplay: {
			enabled: true,
			serverName: "MagicMirror"
		},

		// Display options
		showAlbumArt: true,
		albumArtSize: 150,
		showProgress: true,
		showControls: false,
		showQueue: false,
		maxQueueItems: 3,
		compactMode: false,

		// Animation
		animateAlbumArt: true,
		scrollLongText: true,

		// Update interval (ms)
		updateInterval: 5000,

		// Hide when nothing playing
		hideWhenPaused: false,
		hideDelay: 30000
	},

	/**
	 * Required scripts
	 * @returns {string[]} Array of script paths
	 */
	getScripts: function () {
		return [
			this.file("../../shared/utils.js"),
			this.file("../../shared/touch-handler.js"),
			this.file("../../shared/voice-handler.js")
		];
	},

	/**
	 * Required styles
	 * @returns {string[]} Array of stylesheet paths
	 */
	getStyles: function () {
		return [this.file("music.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] Starting module with provider: ${this.config.provider}`);

		this.currentTrack = null;
		this.isPlaying = false;
		this.progress = 0;
		this.duration = 0;
		this.queue = [];
		this.error = null;
		this.lastUpdate = null;
		this.hideTimeout = null;

		// Progress update interval
		this.progressInterval = null;

		// Request initial data
		this.sendSocketNotification("MUSIC_INIT", {
			provider: this.config.provider,
			config: this.getProviderConfig()
		});

		// Schedule updates
		this.scheduleUpdate();
	},

	/**
	 * Get provider-specific configuration
	 * @returns {object} Provider configuration
	 */
	getProviderConfig: function () {
		switch (this.config.provider) {
			case "spotify":
				return this.config.spotify;
			case "applemusic":
				return this.config.appleMusic;
			case "youtubemusic":
				return this.config.youtubeMusic;
			case "airplay":
				return this.config.airplay;
			default:
				return {};
		}
	},

	/**
	 * Schedule periodic updates
	 */
	scheduleUpdate: function () {
		setInterval(() => {
			this.sendSocketNotification("MUSIC_GET_STATE", {
				provider: this.config.provider,
				config: this.getProviderConfig()
			});
		}, this.config.updateInterval);
	},

	/**
	 * Handle socket notifications from node_helper
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "MUSIC_STATE":
				this.processState(payload);
				break;

			case "MUSIC_ERROR":
				this.error = payload.error;
				this.updateDom();
				break;

			case "MUSIC_CONNECTED":
				this.error = null;
				Log.info(`[${this.name}] Connected to ${this.config.provider}`);
				break;
		}
	},

	/**
	 * Process playback state from provider
	 * @param {object} state - Playback state
	 */
	processState: function (state) {
		const wasPlaying = this.isPlaying;
		const prevTrackId = this.currentTrack?.id;

		this.isPlaying = state.isPlaying;
		this.progress = state.progress || 0;
		this.duration = state.duration || 0;
		this.queue = state.queue || [];
		this.lastUpdate = Date.now();
		this.error = null;

		if (state.track) {
			this.currentTrack = {
				id: state.track.id,
				name: state.track.name,
				artist: state.track.artist,
				album: state.track.album,
				albumArt: state.track.albumArt,
				duration: state.track.duration || state.duration,
				explicit: state.track.explicit || false,
				url: state.track.url
			};
		}

		// Handle progress updates
		this.startProgressUpdates();

		// Handle hide when paused
		if (this.config.hideWhenPaused) {
			this.handleHideLogic(wasPlaying);
		}

		// Only animate if track changed
		const animate = this.currentTrack?.id !== prevTrackId;
		this.updateDom(animate ? 300 : 0);
	},

	/**
	 * Start local progress updates between API calls
	 */
	startProgressUpdates: function () {
		if (this.progressInterval) {
			clearInterval(this.progressInterval);
		}

		if (this.isPlaying && this.config.showProgress) {
			this.progressInterval = setInterval(() => {
				this.progress += 1000;
				if (this.progress > this.duration) {
					this.progress = this.duration;
				}
				this.updateProgressBar();
			}, 1000);
		}
	},

	/**
	 * Update progress bar without full DOM update
	 */
	updateProgressBar: function () {
		const progressEl = document.querySelector(".music-module .progress-fill");
		const timeEl = document.querySelector(".music-module .progress-current");

		if (progressEl && this.duration > 0) {
			const percent = (this.progress / this.duration) * 100;
			progressEl.style.width = `${percent}%`;
		}

		if (timeEl) {
			timeEl.textContent = this.formatTime(this.progress);
		}
	},

	/**
	 * Handle hide/show when paused logic
	 * @param {boolean} wasPlaying - Previous playing state
	 */
	handleHideLogic: function (wasPlaying) {
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		if (!this.isPlaying && wasPlaying) {
			// Just paused, start hide timer
			this.hideTimeout = setTimeout(() => {
				this.hide(500);
			}, this.config.hideDelay);
		} else if (this.isPlaying && !wasPlaying) {
			// Just started playing, show
			this.show(500);
		}
	},

	/**
	 * Format time in mm:ss
	 * @param {number} ms - Time in milliseconds
	 * @returns {string} Formatted time
	 */
	formatTime: function (ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	},

	/**
	 * Playback controls
	 */
	play: function () {
		this.sendSocketNotification("MUSIC_PLAY", {
			provider: this.config.provider,
			config: this.getProviderConfig()
		});
	},

	pause: function () {
		this.sendSocketNotification("MUSIC_PAUSE", {
			provider: this.config.provider,
			config: this.getProviderConfig()
		});
	},

	next: function () {
		this.sendSocketNotification("MUSIC_NEXT", {
			provider: this.config.provider,
			config: this.getProviderConfig()
		});
	},

	previous: function () {
		this.sendSocketNotification("MUSIC_PREVIOUS", {
			provider: this.config.provider,
			config: this.getProviderConfig()
		});
	},

	seek: function (position) {
		this.sendSocketNotification("MUSIC_SEEK", {
			provider: this.config.provider,
			config: this.getProviderConfig(),
			position: position
		});
	},

	/**
	 * Get DOM content
	 * @returns {HTMLElement} Module DOM element
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `music-module${this.config.compactMode ? " compact" : ""}`;

		// Helper to create icon elements safely
		const createIcon = (iconClass) => {
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			return icon;
		};

		// Error state
		if (this.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "music-error";
			errorDiv.appendChild(createIcon("fa-exclamation-triangle"));
			const errorSpan = document.createElement("span");
			errorSpan.textContent = this.error;
			errorDiv.appendChild(errorSpan);
			wrapper.appendChild(errorDiv);
			return wrapper;
		}

		// Nothing playing state
		if (!this.currentTrack) {
			if (this.config.hideWhenPaused) {
				wrapper.style.display = "none";
			} else {
				const emptyDiv = document.createElement("div");
				emptyDiv.className = "music-empty";
				emptyDiv.appendChild(createIcon("fa-music"));
				const emptySpan = document.createElement("span");
				emptySpan.textContent = "Nothing playing";
				emptyDiv.appendChild(emptySpan);
				wrapper.appendChild(emptyDiv);
			}
			return wrapper;
		}

		// Now playing
		wrapper.appendChild(this.renderNowPlaying());

		// Queue
		if (this.config.showQueue && this.queue.length > 0) {
			wrapper.appendChild(this.renderQueue());
		}

		// Setup touch handlers
		if (this.config.mode === "touch") {
			this.setupTouchHandlers(wrapper);
		}

		return wrapper;
	},

	/**
	 * Render now playing section
	 * @returns {HTMLElement} Now playing element
	 */
	renderNowPlaying: function () {
		const container = document.createElement("div");
		container.className = `now-playing ${this.isPlaying ? "playing" : "paused"}`;

		// Album art
		if (this.config.showAlbumArt && this.currentTrack.albumArt) {
			const artContainer = document.createElement("div");
			artContainer.className = `album-art-container${this.config.animateAlbumArt && this.isPlaying ? " spinning" : ""}`;
			artContainer.style.width = `${this.config.albumArtSize}px`;
			artContainer.style.height = `${this.config.albumArtSize}px`;

			const art = document.createElement("img");
			art.className = "album-art";
			art.src = this.currentTrack.albumArt;
			art.alt = this.currentTrack.album || "Album art";

			artContainer.appendChild(art);
			container.appendChild(artContainer);
		}

		// Track info
		const info = document.createElement("div");
		info.className = "track-info";

		const trackName = document.createElement("div");
		trackName.className = `track-name${this.config.scrollLongText ? " scrollable" : ""}`;
		
		// Build track name safely with DOM methods
		const nameSpan = document.createElement("span");
		nameSpan.textContent = this.currentTrack.name;
		trackName.appendChild(nameSpan);
		
		if (this.currentTrack.explicit) {
			const explicitBadge = document.createElement("span");
			explicitBadge.className = "explicit-badge";
			explicitBadge.textContent = "E";
			trackName.appendChild(explicitBadge);
		}

		const artistName = document.createElement("div");
		artistName.className = "track-artist";
		artistName.textContent = this.currentTrack.artist;

		const albumName = document.createElement("div");
		albumName.className = "track-album";
		albumName.textContent = this.currentTrack.album || "";

		info.appendChild(trackName);
		info.appendChild(artistName);
		if (!this.config.compactMode && this.currentTrack.album) {
			info.appendChild(albumName);
		}

		container.appendChild(info);

		// Progress bar
		if (this.config.showProgress && this.duration > 0) {
			container.appendChild(this.renderProgressBar());
		}

		// Controls
		if (this.config.showControls && this.config.mode === "touch") {
			container.appendChild(this.renderControls());
		}

		return container;
	},

	/**
	 * Render progress bar
	 * @returns {HTMLElement} Progress bar element
	 */
	renderProgressBar: function () {
		const progressContainer = document.createElement("div");
		progressContainer.className = "progress-container";

		const progressBar = document.createElement("div");
		progressBar.className = "progress-bar";

		const progressFill = document.createElement("div");
		progressFill.className = "progress-fill";
		const percent = (this.progress / this.duration) * 100;
		progressFill.style.width = `${percent}%`;

		progressBar.appendChild(progressFill);

		const times = document.createElement("div");
		times.className = "progress-times";
		
		// Build times safely with DOM methods
		const currentTime = document.createElement("span");
		currentTime.className = "progress-current";
		currentTime.textContent = this.formatTime(this.progress);
		times.appendChild(currentTime);
		
		const durationTime = document.createElement("span");
		durationTime.className = "progress-duration";
		durationTime.textContent = this.formatTime(this.duration);
		times.appendChild(durationTime);

		progressContainer.appendChild(progressBar);
		progressContainer.appendChild(times);

		return progressContainer;
	},

	/**
	 * Render playback controls
	 * @returns {HTMLElement} Controls element
	 */
	renderControls: function () {
		const controls = document.createElement("div");
		controls.className = "playback-controls";

		// Helper to create icon elements safely
		const createIcon = (iconClass) => {
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			return icon;
		};

		const prevBtn = document.createElement("button");
		prevBtn.className = "control-btn prev";
		prevBtn.appendChild(createIcon("fa-step-backward"));
		prevBtn.addEventListener("click", () => this.previous());

		const playPauseBtn = document.createElement("button");
		playPauseBtn.className = `control-btn play-pause ${this.isPlaying ? "playing" : "paused"}`;
		playPauseBtn.appendChild(createIcon(this.isPlaying ? "fa-pause" : "fa-play"));
		playPauseBtn.addEventListener("click", () => {
			if (this.isPlaying) {
				this.pause();
			} else {
				this.play();
			}
		});

		const nextBtn = document.createElement("button");
		nextBtn.className = "control-btn next";
		nextBtn.appendChild(createIcon("fa-step-forward"));
		nextBtn.addEventListener("click", () => this.next());

		controls.appendChild(prevBtn);
		controls.appendChild(playPauseBtn);
		controls.appendChild(nextBtn);

		return controls;
	},

	/**
	 * Render queue section
	 * @returns {HTMLElement} Queue element
	 */
	renderQueue: function () {
		const queueContainer = document.createElement("div");
		queueContainer.className = "queue-container";

		const header = document.createElement("div");
		header.className = "queue-header";
		header.textContent = "Up Next";
		queueContainer.appendChild(header);

		const list = document.createElement("div");
		list.className = "queue-list";

		const itemsToShow = this.queue.slice(0, this.config.maxQueueItems);
		for (const track of itemsToShow) {
			const item = document.createElement("div");
			item.className = "queue-item";

			if (track.albumArt) {
				const art = document.createElement("img");
				art.className = "queue-art";
				art.src = track.albumArt;
				item.appendChild(art);
			}

			const info = document.createElement("div");
			info.className = "queue-info";
			
			// Build queue info safely with DOM methods
			const queueTrack = document.createElement("div");
			queueTrack.className = "queue-track";
			queueTrack.textContent = track.name;
			info.appendChild(queueTrack);
			
			const queueArtist = document.createElement("div");
			queueArtist.className = "queue-artist";
			queueArtist.textContent = track.artist;
			info.appendChild(queueArtist);
			
			item.appendChild(info);

			list.appendChild(item);
		}

		queueContainer.appendChild(list);
		return queueContainer;
	},

	/**
	 * Setup touch handlers
	 * @param {HTMLElement} wrapper - Module wrapper
	 */
	setupTouchHandlers: function (wrapper) {
		if (typeof TouchHandler === "undefined") return;

		const albumArt = wrapper.querySelector(".album-art-container");
		if (albumArt && this.config.showControls) {
			TouchHandler.init(
				albumArt,
				{
					onTap: () => {
						if (this.isPlaying) {
							this.pause();
						} else {
							this.play();
						}
					},
					onSwipeLeft: () => this.next(),
					onSwipeRight: () => this.previous()
				},
				{ swipeThreshold: 50 }
			);
		}

		// Progress bar seeking
		const progressBar = wrapper.querySelector(".progress-bar");
		if (progressBar) {
			progressBar.addEventListener("click", (e) => {
				const rect = progressBar.getBoundingClientRect();
				const percent = (e.clientX - rect.left) / rect.width;
				const position = Math.floor(percent * this.duration);
				this.seek(position);
			});
		}
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived: function (notification, payload) {
		switch (notification) {
			case "MUSIC_PLAY":
				this.play();
				break;
			case "MUSIC_PAUSE":
				this.pause();
				break;
			case "MUSIC_NEXT":
				this.next();
				break;
			case "MUSIC_PREVIOUS":
				this.previous();
				break;
			case "MUSIC_TOGGLE":
				if (this.isPlaying) {
					this.pause();
				} else {
					this.play();
				}
				break;
		}
	},

	/**
	 * Suspend module
	 */
	suspend: function () {
		if (this.progressInterval) {
			clearInterval(this.progressInterval);
		}
	},

	/**
	 * Resume module
	 */
	resume: function () {
		this.startProgressUpdates();
	}
});
