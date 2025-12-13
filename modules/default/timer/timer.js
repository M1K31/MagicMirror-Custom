/**
 * Timer Module for MagicMirror
 *
 * Provides countdown timers, stopwatch functionality, and preset timers.
 * Supports multiple simultaneous timers with visual and audio alerts.
 *
 * Features:
 * - Multiple countdown timers
 * - Stopwatch with lap tracking
 * - Preset timers (Pomodoro, cooking, etc.)
 * - Visual alerts (pulsing glow)
 * - Audio alerts via node_helper
 * - Timer persistence across restarts
 * - Touch/voice control support
 */

/* global Module, Log, MM */

Module.register("timer", {
	/**
	 * Default module configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Preset timers
		presets: [
			{ name: "Pomodoro", duration: 1500, icon: "fa-clock" },
			{ name: "Short Break", duration: 300, icon: "fa-coffee" },
			{ name: "Long Break", duration: 900, icon: "fa-couch" }
		],

		// Maximum simultaneous timers
		maxTimers: 5,

		// Show preset buttons
		showPresets: true,

		// Show stopwatch
		showStopwatch: true,

		// Alert settings
		alertSound: "alert-soft", // alert-soft, alert-urgent, or null
		alertVolume: 0.7,
		alertDuration: 5000, // How long alert plays (ms)

		// Visual alert (pulsing glow on completion)
		visualAlert: true,
		visualAlertDuration: 10000,

		// Persist timers across restarts
		persistTimers: true,

		// Update interval (ms)
		updateInterval: 1000,

		// Animation speed (ms)
		animationSpeed: 500,

		// Compact display mode
		compact: false,

		// Show timer labels
		showLabels: true,

		// Time format for display
		showHours: true,
		showSeconds: true
	},

	/**
	 * Required scripts
	 */
	getScripts() {
		return ["modules/shared/utils.js", "modules/shared/storage.js", "modules/shared/touch-handler.js"];
	},

	/**
	 * Required styles
	 */
	getStyles() {
		return ["timer.css", "font-awesome.css"];
	},

	/**
	 * Module start
	 */
	start() {
		Log.info(`[${this.name}] Starting module`);

		// Initialize state
		this.timers = [];
		this.stopwatch = {
			running: false,
			startTime: null,
			elapsed: 0,
			laps: []
		};
		this.alertingTimers = new Set();

		// Create storage scope
		if (typeof MMStorage !== "undefined") {
			this.storage = MMStorage.createScope(this.identifier);
		}

		// Load persisted timers
		if (this.config.persistTimers) {
			this.loadTimers();
		}

		// Start update loop
		this.scheduleUpdate();

		// Initialize touch handler if enabled
		this.initInteraction();
	},

	/**
	 * Initialize interaction handlers
	 */
	initInteraction() {
		if (this.config.mode === "touch" && typeof TouchHandler !== "undefined") {
			// Will be initialized after DOM is created
			this.touchEnabled = true;
		}

		if (this.config.mode === "voice" && typeof VoiceHandler !== "undefined") {
			this.registerVoiceCommands();
		}
	},

	/**
	 * Register voice commands
	 */
	registerVoiceCommands() {
		if (typeof VoiceHandler === "undefined") return;

		VoiceHandler.registerModuleCommands(this.identifier, {
			"start timer": () => this.startPresetTimer(0),
			"start pomodoro": () => this.startTimerByName("Pomodoro"),
			"stop timer": () => this.stopAllTimers(),
			"pause timer": () => this.pauseAllTimers(),
			"start stopwatch": () => this.startStopwatch(),
			"stop stopwatch": () => this.stopStopwatch(),
			"reset stopwatch": () => this.resetStopwatch(),
			"lap": () => this.lapStopwatch(),
			"clear timers": () => this.clearAllTimers()
		});
	},

	/**
	 * Schedule the next update
	 */
	scheduleUpdate() {
		setInterval(() => {
			this.updateTimers();
			this.updateDom(this.config.animationSpeed);
		}, this.config.updateInterval);
	},

	/**
	 * Update all running timers
	 */
	updateTimers() {
		const now = Date.now();
		let needsSave = false;

		// Update countdown timers
		this.timers.forEach((timer) => {
			if (timer.running && !timer.completed) {
				const elapsed = now - timer.startTime;
				timer.remaining = Math.max(0, timer.duration * 1000 - elapsed);

				if (timer.remaining <= 0) {
					timer.completed = true;
					timer.running = false;
					this.onTimerComplete(timer);
					needsSave = true;
				}
			}
		});

		// Update stopwatch
		if (this.stopwatch.running) {
			this.stopwatch.elapsed = now - this.stopwatch.startTime;
		}

		// Save if needed
		if (needsSave && this.config.persistTimers) {
			this.saveTimers();
		}
	},

	/**
	 * Handle timer completion
	 * @param {object} timer - Completed timer
	 */
	onTimerComplete(timer) {
		Log.info(`[${this.name}] Timer completed: ${timer.name}`);

		// Send notification
		this.sendNotification("TIMER_COMPLETE", {
			name: timer.name,
			id: timer.id
		});

		// Visual alert
		if (this.config.visualAlert) {
			this.alertingTimers.add(timer.id);
			setTimeout(() => {
				this.alertingTimers.delete(timer.id);
				this.updateDom();
			}, this.config.visualAlertDuration);
		}

		// Audio alert
		if (this.config.alertSound) {
			this.sendSocketNotification("PLAY_SOUND", {
				sound: this.config.alertSound,
				volume: this.config.alertVolume,
				duration: this.config.alertDuration
			});
		}
	},

	/**
	 * Create a new timer
	 * @param {string} name - Timer name
	 * @param {number} duration - Duration in seconds
	 * @param {string} icon - Font Awesome icon class
	 * @returns {object} Created timer
	 */
	createTimer(name, duration, icon = "fa-hourglass-half") {
		if (this.timers.length >= this.config.maxTimers) {
			Log.warn(`[${this.name}] Maximum timers reached`);
			return null;
		}

		const timer = {
			id: this.generateId(),
			name: name || `Timer ${this.timers.length + 1}`,
			duration: duration,
			remaining: duration * 1000,
			icon: icon,
			running: false,
			paused: false,
			completed: false,
			startTime: null,
			createdAt: Date.now()
		};

		this.timers.push(timer);

		if (this.config.persistTimers) {
			this.saveTimers();
		}

		this.updateDom();
		return timer;
	},

	/**
	 * Start a timer
	 * @param {string} id - Timer ID
	 */
	startTimer(id) {
		const timer = this.timers.find((t) => t.id === id);
		if (!timer || timer.completed) return;

		if (timer.paused) {
			// Resume from pause
			timer.startTime = Date.now() - (timer.duration * 1000 - timer.remaining);
		} else {
			// Fresh start
			timer.startTime = Date.now();
			timer.remaining = timer.duration * 1000;
		}

		timer.running = true;
		timer.paused = false;

		this.sendNotification("TIMER_STARTED", { name: timer.name, id: timer.id });

		if (this.config.persistTimers) {
			this.saveTimers();
		}

		this.updateDom();
	},

	/**
	 * Pause a timer
	 * @param {string} id - Timer ID
	 */
	pauseTimer(id) {
		const timer = this.timers.find((t) => t.id === id);
		if (!timer || !timer.running) return;

		timer.running = false;
		timer.paused = true;

		this.sendNotification("TIMER_PAUSED", { name: timer.name, id: timer.id });

		if (this.config.persistTimers) {
			this.saveTimers();
		}

		this.updateDom();
	},

	/**
	 * Reset a timer
	 * @param {string} id - Timer ID
	 */
	resetTimer(id) {
		const timer = this.timers.find((t) => t.id === id);
		if (!timer) return;

		timer.running = false;
		timer.paused = false;
		timer.completed = false;
		timer.remaining = timer.duration * 1000;
		timer.startTime = null;
		this.alertingTimers.delete(timer.id);

		if (this.config.persistTimers) {
			this.saveTimers();
		}

		this.updateDom();
	},

	/**
	 * Remove a timer
	 * @param {string} id - Timer ID
	 */
	removeTimer(id) {
		const index = this.timers.findIndex((t) => t.id === id);
		if (index === -1) return;

		this.alertingTimers.delete(id);
		this.timers.splice(index, 1);

		if (this.config.persistTimers) {
			this.saveTimers();
		}

		this.updateDom();
	},

	/**
	 * Start a preset timer
	 * @param {number} index - Preset index
	 */
	startPresetTimer(index) {
		const preset = this.config.presets[index];
		if (!preset) return;

		const timer = this.createTimer(preset.name, preset.duration, preset.icon);
		if (timer) {
			this.startTimer(timer.id);
		}
	},

	/**
	 * Start a timer by name
	 * @param {string} name - Timer/preset name
	 */
	startTimerByName(name) {
		const preset = this.config.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
		if (preset) {
			const timer = this.createTimer(preset.name, preset.duration, preset.icon);
			if (timer) {
				this.startTimer(timer.id);
			}
		}
	},

	/**
	 * Stop all running timers
	 */
	stopAllTimers() {
		this.timers.forEach((timer) => {
			if (timer.running) {
				this.pauseTimer(timer.id);
			}
		});
	},

	/**
	 * Pause all running timers
	 */
	pauseAllTimers() {
		this.stopAllTimers();
	},

	/**
	 * Clear all timers
	 */
	clearAllTimers() {
		this.timers = [];
		this.alertingTimers.clear();

		if (this.config.persistTimers) {
			this.saveTimers();
		}

		this.updateDom();
	},

	/**
	 * Start the stopwatch
	 */
	startStopwatch() {
		if (this.stopwatch.running) return;

		if (this.stopwatch.elapsed > 0) {
			// Resume
			this.stopwatch.startTime = Date.now() - this.stopwatch.elapsed;
		} else {
			// Fresh start
			this.stopwatch.startTime = Date.now();
			this.stopwatch.elapsed = 0;
			this.stopwatch.laps = [];
		}

		this.stopwatch.running = true;
		this.updateDom();
	},

	/**
	 * Stop the stopwatch
	 */
	stopStopwatch() {
		if (!this.stopwatch.running) return;

		this.stopwatch.running = false;
		this.stopwatch.elapsed = Date.now() - this.stopwatch.startTime;
		this.updateDom();
	},

	/**
	 * Reset the stopwatch
	 */
	resetStopwatch() {
		this.stopwatch.running = false;
		this.stopwatch.startTime = null;
		this.stopwatch.elapsed = 0;
		this.stopwatch.laps = [];
		this.updateDom();
	},

	/**
	 * Record a lap
	 */
	lapStopwatch() {
		if (!this.stopwatch.running) return;

		const currentElapsed = Date.now() - this.stopwatch.startTime;
		const lastLapTime = this.stopwatch.laps.length > 0 ? this.stopwatch.laps[this.stopwatch.laps.length - 1].total : 0;

		this.stopwatch.laps.push({
			lap: this.stopwatch.laps.length + 1,
			time: currentElapsed - lastLapTime,
			total: currentElapsed
		});

		this.updateDom();
	},

	/**
	 * Generate unique ID
	 * @returns {string}
	 */
	generateId() {
		return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	},

	/**
	 * Format time for display
	 * @param {number} ms - Milliseconds
	 * @returns {string}
	 */
	formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		const pad = (n) => String(n).padStart(2, "0");

		if (this.config.showHours && hours > 0) {
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
		}

		if (this.config.showSeconds) {
			return `${pad(minutes)}:${pad(seconds)}`;
		}

		return `${minutes}m`;
	},

	/**
	 * Save timers to storage
	 */
	saveTimers() {
		if (!this.storage) return;

		const data = {
			timers: this.timers.map((t) => ({
				...t,
				// Don't save running state for paused/completed timers
				running: t.running && !t.completed
			})),
			stopwatch: this.stopwatch
		};

		this.storage.set("timers", data);
	},

	/**
	 * Load timers from storage
	 */
	loadTimers() {
		if (!this.storage) return;

		const data = this.storage.get("timers");
		if (!data) return;

		// Restore timers
		if (data.timers) {
			this.timers = data.timers.map((t) => {
				// Recalculate remaining time for running timers
				if (t.running && t.startTime) {
					const elapsed = Date.now() - t.startTime;
					t.remaining = Math.max(0, t.duration * 1000 - elapsed);
					if (t.remaining <= 0) {
						t.completed = true;
						t.running = false;
					}
				}
				return t;
			});
		}

		// Restore stopwatch (but don't auto-resume)
		if (data.stopwatch) {
			this.stopwatch = {
				...data.stopwatch,
				running: false
			};
		}
	},

	/**
	 * Get DOM
	 * @returns {HTMLElement}
	 */
	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = `timer-module ${this.config.compact ? "compact" : ""}`;

		// Presets section
		if (this.config.showPresets && this.config.mode !== "display") {
			wrapper.appendChild(this.getPresetsSection());
		}

		// Active timers
		if (this.timers.length > 0) {
			wrapper.appendChild(this.getTimersSection());
		}

		// Stopwatch
		if (this.config.showStopwatch) {
			wrapper.appendChild(this.getStopwatchSection());
		}

		// Empty state
		if (this.timers.length === 0 && !this.config.showStopwatch && !this.config.showPresets) {
			wrapper.innerHTML = '<div class="dimmed small">No active timers</div>';
		}

		return wrapper;
	},

	/**
	 * Get presets section
	 * @returns {HTMLElement}
	 */
	getPresetsSection() {
		const section = document.createElement("div");
		section.className = "timer-presets";

		this.config.presets.forEach((preset, index) => {
			const btn = document.createElement("button");
			btn.className = "timer-preset-btn";
			btn.innerHTML = `<i class="fa ${preset.icon}"></i> ${preset.name}`;
			btn.onclick = () => this.startPresetTimer(index);
			section.appendChild(btn);
		});

		return section;
	},

	/**
	 * Get timers section
	 * @returns {HTMLElement}
	 */
	getTimersSection() {
		const section = document.createElement("div");
		section.className = "timer-list";

		this.timers.forEach((timer) => {
			const timerEl = document.createElement("div");
			timerEl.className = `timer-item ${timer.running ? "running" : ""} ${timer.completed ? "completed" : ""} ${this.alertingTimers.has(timer.id) ? "alerting" : ""}`;

			// Icon and name
			if (this.config.showLabels) {
				const label = document.createElement("div");
				label.className = "timer-label dimmed small";
				label.innerHTML = `<i class="fa ${timer.icon}"></i> ${timer.name}`;
				timerEl.appendChild(label);
			}

			// Time display
			const time = document.createElement("div");
			time.className = "timer-time bright large";
			time.textContent = this.formatTime(timer.remaining);
			timerEl.appendChild(time);

			// Progress bar
			if (!this.config.compact) {
				const progress = document.createElement("div");
				progress.className = "timer-progress";
				const fill = document.createElement("div");
				fill.className = "timer-progress-fill";
				const pct = ((timer.duration * 1000 - timer.remaining) / (timer.duration * 1000)) * 100;
				fill.style.width = `${Math.min(100, pct)}%`;
				progress.appendChild(fill);
				timerEl.appendChild(progress);
			}

			// Controls (touch mode)
			if (this.config.mode === "touch") {
				const controls = document.createElement("div");
				controls.className = "timer-controls";

				if (!timer.completed) {
					if (timer.running) {
						const pauseBtn = document.createElement("button");
						pauseBtn.innerHTML = '<i class="fa fa-pause"></i>';
						pauseBtn.onclick = () => this.pauseTimer(timer.id);
						controls.appendChild(pauseBtn);
					} else {
						const playBtn = document.createElement("button");
						playBtn.innerHTML = '<i class="fa fa-play"></i>';
						playBtn.onclick = () => this.startTimer(timer.id);
						controls.appendChild(playBtn);
					}

					const resetBtn = document.createElement("button");
					resetBtn.innerHTML = '<i class="fa fa-redo"></i>';
					resetBtn.onclick = () => this.resetTimer(timer.id);
					controls.appendChild(resetBtn);
				}

				const removeBtn = document.createElement("button");
				removeBtn.innerHTML = '<i class="fa fa-times"></i>';
				removeBtn.onclick = () => this.removeTimer(timer.id);
				controls.appendChild(removeBtn);

				timerEl.appendChild(controls);
			}

			section.appendChild(timerEl);
		});

		return section;
	},

	/**
	 * Get stopwatch section
	 * @returns {HTMLElement}
	 */
	getStopwatchSection() {
		const section = document.createElement("div");
		section.className = `stopwatch ${this.stopwatch.running ? "running" : ""}`;

		// Label
		const label = document.createElement("div");
		label.className = "stopwatch-label dimmed small";
		label.innerHTML = '<i class="fa fa-stopwatch"></i> Stopwatch';
		section.appendChild(label);

		// Time
		const time = document.createElement("div");
		time.className = "stopwatch-time bright large";
		time.textContent = this.formatTime(this.stopwatch.elapsed);
		section.appendChild(time);

		// Laps
		if (this.stopwatch.laps.length > 0 && !this.config.compact) {
			const laps = document.createElement("div");
			laps.className = "stopwatch-laps small";

			this.stopwatch.laps
				.slice(-3)
				.reverse()
				.forEach((lap) => {
					const lapEl = document.createElement("div");
					lapEl.className = "stopwatch-lap dimmed";
					lapEl.textContent = `Lap ${lap.lap}: ${this.formatTime(lap.time)}`;
					laps.appendChild(lapEl);
				});

			section.appendChild(laps);
		}

		// Controls (touch mode)
		if (this.config.mode === "touch") {
			const controls = document.createElement("div");
			controls.className = "stopwatch-controls";

			if (this.stopwatch.running) {
				const stopBtn = document.createElement("button");
				stopBtn.innerHTML = '<i class="fa fa-pause"></i>';
				stopBtn.onclick = () => this.stopStopwatch();
				controls.appendChild(stopBtn);

				const lapBtn = document.createElement("button");
				lapBtn.innerHTML = '<i class="fa fa-flag"></i>';
				lapBtn.onclick = () => this.lapStopwatch();
				controls.appendChild(lapBtn);
			} else {
				const startBtn = document.createElement("button");
				startBtn.innerHTML = '<i class="fa fa-play"></i>';
				startBtn.onclick = () => this.startStopwatch();
				controls.appendChild(startBtn);

				if (this.stopwatch.elapsed > 0) {
					const resetBtn = document.createElement("button");
					resetBtn.innerHTML = '<i class="fa fa-redo"></i>';
					resetBtn.onclick = () => this.resetStopwatch();
					controls.appendChild(resetBtn);
				}
			}

			section.appendChild(controls);
		}

		return section;
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived(notification, payload) {
		switch (notification) {
			case "TIMER_CREATE":
				this.createTimer(payload.name, payload.duration, payload.icon);
				break;
			case "TIMER_START":
				if (payload.id) {
					this.startTimer(payload.id);
				} else if (payload.preset !== undefined) {
					this.startPresetTimer(payload.preset);
				}
				break;
			case "TIMER_PAUSE":
				this.pauseTimer(payload.id);
				break;
			case "TIMER_RESET":
				this.resetTimer(payload.id);
				break;
			case "TIMER_REMOVE":
				this.removeTimer(payload.id);
				break;
			case "STOPWATCH_START":
				this.startStopwatch();
				break;
			case "STOPWATCH_STOP":
				this.stopStopwatch();
				break;
			case "STOPWATCH_RESET":
				this.resetStopwatch();
				break;
			case "STOPWATCH_LAP":
				this.lapStopwatch();
				break;
		}
	},

	/**
	 * Handle socket notifications from node_helper
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	socketNotificationReceived(notification, payload) {
		if (notification === "SOUND_PLAYED") {
			Log.info(`[${this.name}] Sound played: ${payload.sound}`);
		} else if (notification === "SOUND_ERROR") {
			Log.error(`[${this.name}] Sound error: ${payload.error}`);
		}
	}
});
