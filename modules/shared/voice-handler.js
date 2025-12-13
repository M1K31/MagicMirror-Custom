/**
 * Voice Handler for MagicMirror Modules
 *
 * Provides voice command recognition for modules that support
 * voice control mode. Disabled by default (display-only mode).
 *
 * Supports:
 * - Web Speech API (browser-based recognition)
 * - External voice service integration (e.g., Vosk, Picovoice)
 * - Command matching with fuzzy matching support
 */

/* global Log, MM */

const VoiceHandler = {
	/**
	 * Default configuration
	 */
	defaults: {
		enabled: false,
		language: "en-US",
		continuous: true,
		interimResults: false,
		wakeWord: "mirror",
		wakeWordTimeout: 10000, // ms to listen after wake word
		fuzzyMatch: true,
		fuzzyThreshold: 0.7,
		feedback: true // Visual/audio feedback
	},

	/**
	 * Recognition instance
	 */
	recognition: null,

	/**
	 * Registered command handlers
	 */
	commands: new Map(),

	/**
	 * Module command registrations
	 */
	moduleCommands: new Map(),

	/**
	 * State
	 */
	state: {
		initialized: false,
		listening: false,
		awake: false,
		wakeTimeout: null,
		config: null
	},

	/**
	 * Initialize voice handling
	 * @param {object} options - Configuration options
	 * @returns {boolean} Success status
	 */
	init(options = {}) {
		const config = { ...this.defaults, ...options };
		this.state.config = config;

		if (!config.enabled) {
			Log.info("[VoiceHandler] Voice handling disabled (display-only mode)");
			return false;
		}

		// Check for Web Speech API support
		if (!this.isSupported()) {
			Log.warn("[VoiceHandler] Web Speech API not supported");
			return false;
		}

		try {
			const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
			this.recognition = new SpeechRecognition();

			this.recognition.continuous = config.continuous;
			this.recognition.interimResults = config.interimResults;
			this.recognition.lang = config.language;

			this.recognition.onresult = this.onResult.bind(this);
			this.recognition.onerror = this.onError.bind(this);
			this.recognition.onend = this.onEnd.bind(this);
			this.recognition.onstart = this.onStart.bind(this);

			this.state.initialized = true;
			Log.info("[VoiceHandler] Voice handling initialized");

			return true;
		} catch (e) {
			Log.error("[VoiceHandler] Failed to initialize:", e);
			return false;
		}
	},

	/**
	 * Check if Web Speech API is supported
	 * @returns {boolean}
	 */
	isSupported() {
		return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
	},

	/**
	 * Start listening for voice commands
	 * @returns {boolean} Success status
	 */
	start() {
		if (!this.state.initialized || !this.recognition) {
			Log.warn("[VoiceHandler] Not initialized");
			return false;
		}

		if (this.state.listening) {
			return true;
		}

		try {
			this.recognition.start();
			return true;
		} catch (e) {
			Log.error("[VoiceHandler] Failed to start:", e);
			return false;
		}
	},

	/**
	 * Stop listening
	 */
	stop() {
		if (this.recognition && this.state.listening) {
			this.recognition.stop();
		}
		this.clearWakeTimeout();
	},

	/**
	 * Handle recognition start
	 */
	onStart() {
		this.state.listening = true;
		Log.info("[VoiceHandler] Listening started");
		this.sendNotification("VOICE_LISTENING_STARTED");
	},

	/**
	 * Handle recognition end
	 */
	onEnd() {
		this.state.listening = false;
		Log.info("[VoiceHandler] Listening ended");
		this.sendNotification("VOICE_LISTENING_ENDED");

		// Restart if continuous mode
		if (this.state.config.continuous && this.state.initialized) {
			setTimeout(() => this.start(), 100);
		}
	},

	/**
	 * Handle recognition error
	 * @param {Event} event - Error event
	 */
	onError(event) {
		Log.error(`[VoiceHandler] Error: ${event.error}`);

		if (event.error === "not-allowed") {
			Log.error("[VoiceHandler] Microphone access denied");
			this.state.initialized = false;
		}

		this.sendNotification("VOICE_ERROR", { error: event.error });
	},

	/**
	 * Handle recognition result
	 * @param {Event} event - Result event
	 */
	onResult(event) {
		const result = event.results[event.results.length - 1];

		if (!result.isFinal && !this.state.config.interimResults) {
			return;
		}

		const transcript = result[0].transcript.toLowerCase().trim();
		const confidence = result[0].confidence;

		Log.info(`[VoiceHandler] Heard: "${transcript}" (confidence: ${confidence.toFixed(2)})`);

		// Check for wake word
		if (!this.state.awake) {
			if (this.checkWakeWord(transcript)) {
				this.wake();
				this.provideFeedback("wake");
			}
			return;
		}

		// Process command
		this.processCommand(transcript, confidence);
	},

	/**
	 * Check if transcript contains wake word
	 * @param {string} transcript - Speech transcript
	 * @returns {boolean}
	 */
	checkWakeWord(transcript) {
		const wakeWord = this.state.config.wakeWord.toLowerCase();
		return transcript.includes(wakeWord);
	},

	/**
	 * Activate wake state
	 */
	wake() {
		this.state.awake = true;
		Log.info("[VoiceHandler] Wake word detected - listening for command");
		this.sendNotification("VOICE_AWAKE");

		// Set timeout to sleep
		this.clearWakeTimeout();
		this.state.wakeTimeout = setTimeout(() => {
			this.sleep();
		}, this.state.config.wakeWordTimeout);
	},

	/**
	 * Deactivate wake state
	 */
	sleep() {
		this.state.awake = false;
		this.clearWakeTimeout();
		Log.info("[VoiceHandler] Going back to sleep");
		this.sendNotification("VOICE_SLEEP");
	},

	/**
	 * Clear wake timeout
	 */
	clearWakeTimeout() {
		if (this.state.wakeTimeout) {
			clearTimeout(this.state.wakeTimeout);
			this.state.wakeTimeout = null;
		}
	},

	/**
	 * Process a voice command
	 * @param {string} transcript - Speech transcript
	 * @param {number} confidence - Recognition confidence
	 */
	processCommand(transcript, confidence) {
		// Reset wake timeout
		this.clearWakeTimeout();
		this.state.wakeTimeout = setTimeout(() => {
			this.sleep();
		}, this.state.config.wakeWordTimeout);

		// Remove wake word from transcript
		const wakeWord = this.state.config.wakeWord.toLowerCase();
		let command = transcript.replace(wakeWord, "").trim();

		// Try to match command
		const match = this.matchCommand(command);

		if (match) {
			Log.info(`[VoiceHandler] Matched command: ${match.command} (module: ${match.moduleId || "global"})`);
			this.provideFeedback("match");
			this.executeCommand(match, command);
		} else {
			Log.info(`[VoiceHandler] No command matched for: "${command}"`);
			this.provideFeedback("nomatch");
			this.sendNotification("VOICE_COMMAND_NOT_FOUND", { transcript: command });
		}
	},

	/**
	 * Match a command to registered handlers
	 * @param {string} input - Command input
	 * @returns {object|null} Matched command or null
	 */
	matchCommand(input) {
		const fuzzy = this.state.config.fuzzyMatch;
		const threshold = this.state.config.fuzzyThreshold;

		// Check module-specific commands first
		for (const [moduleId, commands] of this.moduleCommands) {
			for (const [pattern, handler] of commands) {
				const match = this.matchPattern(input, pattern, fuzzy, threshold);
				if (match) {
					return {
						moduleId,
						command: pattern,
						handler,
						params: match.params
					};
				}
			}
		}

		// Check global commands
		for (const [pattern, handler] of this.commands) {
			const match = this.matchPattern(input, pattern, fuzzy, threshold);
			if (match) {
				return {
					moduleId: null,
					command: pattern,
					handler,
					params: match.params
				};
			}
		}

		return null;
	},

	/**
	 * Match input against a pattern
	 * @param {string} input - Input string
	 * @param {string|RegExp} pattern - Pattern to match
	 * @param {boolean} fuzzy - Use fuzzy matching
	 * @param {number} threshold - Fuzzy match threshold
	 * @returns {object|null} Match result or null
	 */
	matchPattern(input, pattern, fuzzy, threshold) {
		// RegExp pattern
		if (pattern instanceof RegExp) {
			const match = input.match(pattern);
			if (match) {
				return { params: match.slice(1) };
			}
			return null;
		}

		// String pattern
		const patternLower = pattern.toLowerCase();

		// Exact match
		if (input === patternLower) {
			return { params: [] };
		}

		// Contains match
		if (input.includes(patternLower)) {
			return { params: [] };
		}

		// Fuzzy match
		if (fuzzy) {
			const similarity = this.calculateSimilarity(input, patternLower);
			if (similarity >= threshold) {
				return { params: [], similarity };
			}
		}

		return null;
	},

	/**
	 * Calculate string similarity (Levenshtein-based)
	 * @param {string} a - First string
	 * @param {string} b - Second string
	 * @returns {number} Similarity score (0-1)
	 */
	calculateSimilarity(a, b) {
		if (a === b) return 1;
		if (!a.length || !b.length) return 0;

		const matrix = [];

		for (let i = 0; i <= b.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= a.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= b.length; i++) {
			for (let j = 1; j <= a.length; j++) {
				if (b.charAt(i - 1) === a.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
				}
			}
		}

		const distance = matrix[b.length][a.length];
		return 1 - distance / Math.max(a.length, b.length);
	},

	/**
	 * Execute a matched command
	 * @param {object} match - Matched command
	 * @param {string} fullTranscript - Full transcript
	 */
	executeCommand(match, fullTranscript) {
		try {
			match.handler({
				command: match.command,
				params: match.params,
				transcript: fullTranscript,
				moduleId: match.moduleId
			});

			this.sendNotification("VOICE_COMMAND_EXECUTED", {
				command: match.command,
				moduleId: match.moduleId
			});
		} catch (e) {
			Log.error(`[VoiceHandler] Error executing command:`, e);
			this.sendNotification("VOICE_COMMAND_ERROR", {
				command: match.command,
				error: e.message
			});
		}
	},

	/**
	 * Register a global command
	 * @param {string|RegExp} pattern - Command pattern
	 * @param {function} handler - Command handler
	 */
	registerCommand(pattern, handler) {
		this.commands.set(pattern, handler);
		Log.info(`[VoiceHandler] Registered global command: ${pattern}`);
	},

	/**
	 * Register module commands
	 * @param {string} moduleId - Module identifier
	 * @param {object} commands - Map of patterns to handlers
	 */
	registerModuleCommands(moduleId, commands) {
		if (!this.moduleCommands.has(moduleId)) {
			this.moduleCommands.set(moduleId, new Map());
		}

		const moduleMap = this.moduleCommands.get(moduleId);

		for (const [pattern, handler] of Object.entries(commands)) {
			moduleMap.set(pattern, handler);
			Log.info(`[VoiceHandler] Registered command for ${moduleId}: ${pattern}`);
		}
	},

	/**
	 * Unregister module commands
	 * @param {string} moduleId - Module identifier
	 */
	unregisterModuleCommands(moduleId) {
		this.moduleCommands.delete(moduleId);
	},

	/**
	 * Provide user feedback
	 * @param {string} type - Feedback type (wake, match, nomatch)
	 */
	provideFeedback(type) {
		if (!this.state.config.feedback) {
			return;
		}

		this.sendNotification("VOICE_FEEDBACK", { type });
	},

	/**
	 * Send notification to MagicMirror
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	sendNotification(notification, payload = {}) {
		if (typeof MM !== "undefined" && MM.sendNotification) {
			MM.sendNotification(notification, payload);
		}
	},

	/**
	 * Destroy voice handler
	 */
	destroy() {
		this.stop();
		this.commands.clear();
		this.moduleCommands.clear();
		this.recognition = null;
		this.state.initialized = false;
	}
};

// Export for use in modules
if (typeof module !== "undefined") {
	module.exports = VoiceHandler;
}

// Also make available globally for browser context
if (typeof window !== "undefined") {
	window.VoiceHandler = VoiceHandler;
}
