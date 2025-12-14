/**
 * AI Assistant Module for MagicMirror
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Provides natural language interface for controlling MagicMirror:
 * - Voice commands (browser speech recognition)
 * - Text input via touch interface
 * - Integration with OpenAI, Anthropic Claude, and local LLMs (Ollama)
 *
 * @see https://github.com/M1K31/MagicMirror-Custom
 */

/* global Log, Module, MM */

Module.register("ai", {
	/**
	 * Default configuration
	 */
	defaults: {
		// AI Provider: "openai", "anthropic", "ollama", "local"
		provider: "openai",

		// Provider-specific settings
		openai: {
			model: "gpt-4",
			apiEndpoint: "https://api.openai.com/v1/chat/completions"
		},
		anthropic: {
			model: "claude-3-5-sonnet-20241022",
			apiEndpoint: "https://api.anthropic.com/v1/messages"
		},
		ollama: {
			model: "llama3.2",
			apiEndpoint: "http://localhost:11434/api/chat"
		},
		local: {
			model: "default",
			apiEndpoint: "http://localhost:8000/v1/chat/completions"
		},

		// UI Settings
		showAssistant: true,
		position: "bottom_right",
		iconOnly: true,
		theme: "dark",

		// Voice Settings
		enableVoice: true,
		voiceLanguage: "en-US",
		continuousListening: false,
		wakeWord: "mirror",

		// Response Settings
		maxTokens: 500,
		temperature: 0.7,
		systemPrompt: `You are a helpful AI assistant integrated into a MagicMirror smart display.
You can help the user with:
- Controlling mirror modules (show/hide modules, adjust settings)
- Answering questions about weather, calendar, news
- Smart home control (if integrated)
- General knowledge questions

When the user asks to control the mirror, respond with a JSON action block like this:
\`\`\`action
{"action": "show_module", "module": "weather"}
\`\`\`

Available actions:
- show_module: Show a hidden module
- hide_module: Hide a visible module
- set_brightness: Adjust display brightness (0-100)
- refresh_module: Refresh a module's data
- notification: Send a notification to the mirror

Keep responses concise and helpful for a smart mirror display.`
	},

	/**
	 * Required styles
	 */
	getStyles: function () {
		return [this.file("ai.css")];
	},

	/**
	 * Start the module
	 */
	start: function () {
		Log.info(`[${this.name}] AI Assistant module started`);

		this.chatVisible = false;
		this.messages = [];
		this.isListening = false;
		this.isProcessing = false;
		this.recognition = null;

		// Initialize speech recognition if available
		if (this.config.enableVoice) {
			this.initSpeechRecognition();
		}

		// Request API key status from node_helper
		this.sendSocketNotification("AI_CHECK_CONFIG", {
			provider: this.config.provider
		});
	},

	/**
	 * Initialize Web Speech API for voice recognition
	 */
	initSpeechRecognition: function () {
		const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

		if (!SpeechRecognition) {
			Log.warn(`[${this.name}] Speech recognition not supported in this browser`);
			return;
		}

		this.recognition = new SpeechRecognition();
		this.recognition.lang = this.config.voiceLanguage;
		this.recognition.continuous = this.config.continuousListening;
		this.recognition.interimResults = true;

		this.recognition.onstart = () => {
			this.isListening = true;
			this.updateDom();
			Log.info(`[${this.name}] Voice recognition started`);
		};

		this.recognition.onend = () => {
			this.isListening = false;
			this.updateDom();

			// Restart if continuous listening is enabled
			if (this.config.continuousListening && this.chatVisible) {
				this.recognition.start();
			}
		};

		this.recognition.onresult = (event) => {
			const last = event.results.length - 1;
			const transcript = event.results[last][0].transcript.trim();

			if (event.results[last].isFinal) {
				// Check for wake word if not in chat mode
				if (!this.chatVisible && this.config.wakeWord) {
					if (transcript.toLowerCase().includes(this.config.wakeWord.toLowerCase())) {
						const command = transcript.toLowerCase().replace(this.config.wakeWord.toLowerCase(), "").trim();
						
						// Try built-in commands first (works without AI)
						const handled = this.handleBuiltInCommand(command);
						
						if (!handled) {
							// Open chat and send to AI if configured
							this.toggleChat();
							if (command) {
								this.sendMessage(command);
							}
						}
					}
				} else {
					// In chat mode - try built-in first, then AI
					const handled = this.handleBuiltInCommand(transcript);
					if (!handled) {
						this.sendMessage(transcript);
					}
				}
			} else {
				// Show interim results
				this.showInterimTranscript(transcript);
			}
		};

		this.recognition.onerror = (event) => {
			Log.error(`[${this.name}] Speech recognition error:`, event.error);
			this.isListening = false;
			this.updateDom();
		};
	},

	/**
	 * Built-in voice commands that work without AI
	 * Returns true if command was handled
	 */
	handleBuiltInCommand: function (transcript) {
		const text = transcript.toLowerCase().trim();
		
		// Define built-in command patterns organized by category
		const commands = [
			// ============================================
			// MODULE CONTROL - Turn on/off any module
			// ============================================
			{
				patterns: [
					/turn on (.+)/i, 
					/enable (.+)/i, 
					/show (.+)/i,
					/start (.+)/i,
					/activate (.+)/i
				],
				handler: (match) => {
					const target = match[1].trim();
					return this.enableFeature(target);
				}
			},
			{
				patterns: [
					/turn off (.+)/i, 
					/disable (.+)/i, 
					/hide (.+)/i,
					/stop (.+)/i,
					/deactivate (.+)/i
				],
				handler: (match) => {
					const target = match[1].trim();
					return this.disableFeature(target);
				}
			},

			// ============================================
			// CALENDAR COMMANDS
			// ============================================
			{
				patterns: [
					/add (?:a )?(?:calendar )?event (?:on )?(.+?) for (.+)/i,
					/add (?:a )?(?:calendar )?event (.+?) (?:called |named |for )(.+)/i,
					/schedule (.+?) for (.+)/i,
					/create (?:an )?event (?:on )?(.+?) (?:called |for )(.+)/i
				],
				handler: (match) => {
					const dateStr = match[1].trim();
					const title = match[2].trim();
					this.addCalendarEvent(dateStr, title);
					return true;
				}
			},
			{
				patterns: [
					/add (?:a )?reminder (?:on )?(.+?) (?:to |for )(.+)/i,
					/remind me (?:on )?(.+?) (?:to |about )(.+)/i
				],
				handler: (match) => {
					const dateStr = match[1].trim();
					const title = match[2].trim();
					this.addCalendarEvent(dateStr, `Reminder: ${title}`);
					return true;
				}
			},
			{
				patterns: [/my events/i, /today'?s events/i, /calendar events/i, /what'?s on my calendar/i, /upcoming events/i],
				handler: () => {
					this.readCalendarEvents();
					return true;
				}
			},
			{
				patterns: [/events (?:on |for )(.+)/i, /what'?s happening (?:on )?(.+)/i],
				handler: (match) => {
					const dateStr = match[1].trim();
					this.readCalendarEventsForDate(dateStr);
					return true;
				}
			},

			// ============================================
			// CAMERA / SECURITY COMMANDS
			// ============================================
			{
				patterns: [
					/show (?:me )?(?:the )?(.+?) camera/i,
					/display (?:the )?(.+?) camera/i,
					/view (?:the )?(.+?) camera/i,
					/open (?:the )?(.+?) camera/i
				],
				handler: (match) => {
					const camera = match[1].trim();
					this.showCamera(camera);
					return true;
				}
			},
			{
				patterns: [/show (?:all )?cameras/i, /view (?:all )?cameras/i, /camera view/i, /security cameras/i],
				handler: () => {
					this.showAllCameras();
					return true;
				}
			},
			{
				patterns: [/close (?:the )?camera/i, /hide (?:the )?camera/i, /exit camera/i],
				handler: () => {
					this.closeCamera();
					return true;
				}
			},
			{
				patterns: [/arm (?:the )?(?:security )?system/i, /set (?:security )?alarm/i, /enable (?:security )?alarm/i],
				handler: () => {
					this.setSecurityMode("armed");
					return true;
				}
			},
			{
				patterns: [/disarm (?:the )?(?:security )?system/i, /disable (?:security )?alarm/i],
				handler: () => {
					this.setSecurityMode("disarmed");
					return true;
				}
			},

			// ============================================
			// OPENEYE INTEGRATION COMMANDS
			// ============================================
			{
				patterns: [
					/search (?:for )?(?:new )?cameras/i,
					/find (?:new )?cameras/i,
					/discover cameras/i,
					/scan (?:for )?cameras/i
				],
				handler: () => {
					this.searchForCameras();
					return true;
				}
			},
			{
				patterns: [
					/add (?:the )?(.+?) camera/i,
					/connect (?:the )?(.+?) camera/i,
					/pair (?:the )?(.+?) camera/i
				],
				handler: (match) => {
					const camera = match[1].trim();
					this.addCamera(camera);
					return true;
				}
			},
			{
				patterns: [
					/add camera (?:at )?(?:ip )?(.+)/i,
					/add camera from (?:ip )?(.+)/i
				],
				handler: (match) => {
					const ip = match[1].trim();
					this.addCameraByIP(ip);
					return true;
				}
			},
			{
				patterns: [
					/remove (?:the )?(.+?) camera/i,
					/delete (?:the )?(.+?) camera/i,
					/disconnect (?:the )?(.+?) camera/i
				],
				handler: (match) => {
					const camera = match[1].trim();
					this.removeCamera(camera);
					return true;
				}
			},
			{
				patterns: [
					/take (?:a )?photo (?:with |from )?(?:the )?(.+)/i,
					/capture (?:image |photo )?(?:from |with )?(?:the )?(.+)/i,
					/snap (?:a )?(?:photo |picture )?(?:from |with )?(?:the )?(.+)/i
				],
				handler: (match) => {
					const camera = match[1].trim();
					this.capturePhoto(camera);
					return true;
				}
			},
			{
				patterns: [
					/train (?:my )?face/i,
					/add (?:my )?face/i,
					/register (?:my )?face/i,
					/enroll (?:my )?face/i
				],
				handler: () => {
					this.startFaceTraining();
					return true;
				}
			},
			{
				patterns: [
					/train face (?:for )?(.+)/i,
					/add face (?:for )?(.+)/i,
					/register (.+?)(?:'s)? face/i,
					/enroll (.+?)(?:'s)? face/i
				],
				handler: (match) => {
					const person = match[1].trim();
					this.startFaceTraining(person);
					return true;
				}
			},
			{
				patterns: [
					/capture (?:training )?photo(?:s)? (?:for )?(.+)/i,
					/take training photo(?:s)? (?:for )?(.+)/i
				],
				handler: (match) => {
					const person = match[1].trim();
					this.captureTrainingPhoto(person);
					return true;
				}
			},
			{
				patterns: [
					/(?:who'?s |who is )?(?:at )?(?:the )?(.+?) (?:door|camera)/i,
					/identify (?:person )?(?:at )?(?:the )?(.+)/i
				],
				handler: (match) => {
					const location = match[1].trim();
					this.identifyPerson(location);
					return true;
				}
			},
			{
				patterns: [
					/list (?:all )?(?:known )?faces/i,
					/who do you recognize/i,
					/known people/i,
					/recognized faces/i
				],
				handler: () => {
					this.listKnownFaces();
					return true;
				}
			},
			{
				patterns: [
					/remove face (?:for )?(.+)/i,
					/delete face (?:for )?(.+)/i,
					/forget (.+?)(?:'s)? face/i
				],
				handler: (match) => {
					const person = match[1].trim();
					this.removeFace(person);
					return true;
				}
			},
			{
				patterns: [
					/(?:start )?recording (?:on |from )?(?:the )?(.+?) camera/i,
					/record (?:the )?(.+)/i
				],
				handler: (match) => {
					const camera = match[1].trim();
					this.startRecording(camera);
					return true;
				}
			},
			{
				patterns: [
					/stop recording(?: on | from )?(?:the )?(.+)?/i
				],
				handler: (match) => {
					const camera = match[1] ? match[1].trim() : null;
					this.stopRecording(camera);
					return true;
				}
			},
			{
				patterns: [
					/show (?:recent )?(?:security )?events/i,
					/security history/i,
					/recent (?:motion |security )?events/i,
					/what(?:'s| has) happened/i
				],
				handler: () => {
					this.showSecurityEvents();
					return true;
				}
			},
			{
				patterns: [
					/enable motion detection(?: on | for )?(?:the )?(.+)?/i,
					/turn on motion detection(?: for )?(?:the )?(.+)?/i
				],
				handler: (match) => {
					const camera = match[1] ? match[1].trim() : "all";
					this.setMotionDetection(camera, true);
					return true;
				}
			},
			{
				patterns: [
					/disable motion detection(?: on | for )?(?:the )?(.+)?/i,
					/turn off motion detection(?: for )?(?:the )?(.+)?/i
				],
				handler: (match) => {
					const camera = match[1] ? match[1].trim() : "all";
					this.setMotionDetection(camera, false);
					return true;
				}
			},
			{
				patterns: [
					/security status/i,
					/camera status/i,
					/openeye status/i
				],
				handler: () => {
					this.readSecurityStatus();
					return true;
				}
			},

			// ============================================
			// NAVIGATION / GO HOME COMMANDS
			// ============================================
			{
				patterns: [
					/go (?:back )?home/i,
					/go to (?:the )?(?:home ?)?(?:screen|dashboard|main)/i,
					/show (?:the )?(?:home ?)?(?:screen|dashboard|main)/i,
					/back to (?:home|main|dashboard)/i,
					/return (?:to )?(?:home|main|dashboard)/i,
					/home ?screen/i,
					/main ?screen/i,
					/dashboard/i,
					/close (?:this|everything|all)/i,
					/exit/i,
					/(?:go )?back/i
				],
				handler: () => {
					this.goHome();
					return true;
				}
			},
			{
				patterns: [
					/close (?:the )?(?:popup|overlay|modal|panel)/i,
					/dismiss/i,
					/cancel/i
				],
				handler: () => {
					this.closeOverlay();
					return true;
				}
			},

			// ============================================
			// SMART HOME COMMANDS
			// ============================================
			{
				patterns: [
					/turn on (?:the )?(.+?) light(?:s)?/i,
					/(.+?) light(?:s)? on/i,
					/lights on(?: in (?:the )?(.+))?/i
				],
				handler: (match) => {
					const room = (match[1] || match[2] || "all").trim();
					this.controlLight(room, "on");
					return true;
				}
			},
			{
				patterns: [
					/turn off (?:the )?(.+?) light(?:s)?/i,
					/(.+?) light(?:s)? off/i,
					/lights off(?: in (?:the )?(.+))?/i
				],
				handler: (match) => {
					const room = (match[1] || match[2] || "all").trim();
					this.controlLight(room, "off");
					return true;
				}
			},
			{
				patterns: [
					/dim (?:the )?(.+?) light(?:s)? to (\d+)/i,
					/set (?:the )?(.+?) light(?:s)? to (\d+)/i,
					/(.+?) light(?:s)? (?:to )?(\d+) percent/i
				],
				handler: (match) => {
					const room = match[1].trim();
					const level = parseInt(match[2]);
					this.controlLight(room, "dim", level);
					return true;
				}
			},
			{
				patterns: [
					/set (?:the )?(?:thermostat|temperature) to (\d+)/i,
					/(?:thermostat|temperature) (?:to )?(\d+)/i,
					/make it (\d+) degrees/i
				],
				handler: (match) => {
					const temp = parseInt(match[1]);
					this.setThermostat(temp);
					return true;
				}
			},
			{
				patterns: [/what'?s the temperature/i, /current temperature/i, /how (?:warm|cold) is it/i],
				handler: () => {
					this.readThermostat();
					return true;
				}
			},
			{
				patterns: [/lock (?:the )?(.+)/i],
				handler: (match) => {
					const device = match[1].trim();
					this.controlLock(device, "lock");
					return true;
				}
			},
			{
				patterns: [/unlock (?:the )?(.+)/i],
				handler: (match) => {
					const device = match[1].trim();
					this.controlLock(device, "unlock");
					return true;
				}
			},
			{
				patterns: [/open (?:the )?garage/i],
				handler: () => {
					this.controlGarage("open");
					return true;
				}
			},
			{
				patterns: [/close (?:the )?garage/i],
				handler: () => {
					this.controlGarage("close");
					return true;
				}
			},
			{
				patterns: [/run (?:the )?(.+?) scene/i, /activate (?:the )?(.+?) scene/i],
				handler: (match) => {
					const scene = match[1].trim();
					this.activateScene(scene);
					return true;
				}
			},

			// ============================================
			// MUSIC / MEDIA COMMANDS
			// ============================================
			{
				patterns: [/play music/i, /start music/i, /resume music/i],
				handler: () => {
					this.controlMusic("play");
					return true;
				}
			},
			{
				patterns: [/pause music/i, /stop music/i],
				handler: () => {
					this.controlMusic("pause");
					return true;
				}
			},
			{
				patterns: [/next song/i, /skip song/i, /next track/i],
				handler: () => {
					this.controlMusic("next");
					return true;
				}
			},
			{
				patterns: [/previous song/i, /last song/i, /previous track/i],
				handler: () => {
					this.controlMusic("previous");
					return true;
				}
			},
			{
				patterns: [/(?:set )?volume (?:to )?(\d+)/i, /volume (\d+)/i],
				handler: (match) => {
					const level = parseInt(match[1]);
					this.setVolume(level);
					return true;
				}
			},
			{
				patterns: [/what'?s playing/i, /current song/i, /now playing/i],
				handler: () => {
					this.readNowPlaying();
					return true;
				}
			},

			// ============================================
			// PACKAGE TRACKING
			// ============================================
			{
				patterns: [/add package (.+)/i, /track package (.+)/i, /add tracking (.+)/i],
				handler: (match) => {
					const trackingNumber = match[1].replace(/\s+/g, "").toUpperCase();
					this.addPackage(trackingNumber);
					return true;
				}
			},
			{
				patterns: [/read packages/i, /what packages/i, /package status/i, /my packages/i, /package updates/i],
				handler: () => {
					this.readPackages();
					return true;
				}
			},
			{
				patterns: [/remove package (.+)/i, /delete package (.+)/i, /stop tracking (.+)/i],
				handler: (match) => {
					const trackingNumber = match[1].replace(/\s+/g, "").toUpperCase();
					this.removePackage(trackingNumber);
					return true;
				}
			},

			// ============================================
			// WEATHER COMMANDS
			// ============================================
			{
				patterns: [/weather/i, /what'?s the weather/i, /current weather/i, /weather forecast/i],
				handler: () => {
					this.readCurrentWeather();
					return true;
				}
			},
			{
				patterns: [/weather in (.+)/i, /what'?s the weather in (.+)/i, /how'?s the weather in (.+)/i],
				handler: (match) => {
					const location = match[1].trim();
					this.getWeatherForLocation(location);
					return true;
				}
			},
			{
				patterns: [/add (?:weather )?location (.+)/i, /add (.+) to weather/i],
				handler: (match) => {
					const location = match[1].trim();
					this.addWeatherLocation(location);
					return true;
				}
			},
			{
				patterns: [/remove (?:weather )?location (.+)/i],
				handler: (match) => {
					const location = match[1].trim();
					this.removeWeatherLocation(location);
					return true;
				}
			},

			// ============================================
			// NEWS COMMANDS
			// ============================================
			{
				patterns: [/read (?:the )?news/i, /what'?s (?:in )?the news/i, /news headlines/i, /top stories/i],
				handler: () => {
					this.readNews();
					return true;
				}
			},
			{
				patterns: [/add (?:news (?:source |from )?)?(.+?) (?:news|to news)/i, /add (.+) as news source/i],
				handler: (match) => {
					const source = match[1].trim();
					this.addNewsSource(source);
					return true;
				}
			},
			{
				patterns: [/remove (.+) (?:from )?news/i],
				handler: (match) => {
					const source = match[1].trim();
					this.removeNewsSource(source);
					return true;
				}
			},

			// ============================================
			// TRANSIT COMMANDS
			// ============================================
			{
				patterns: [/(?:next )?bus/i, /bus times/i, /when'?s (?:the )?(?:next )?bus/i],
				handler: () => {
					this.readTransit("bus");
					return true;
				}
			},
			{
				patterns: [/(?:next )?train/i, /train times/i, /when'?s (?:the )?(?:next )?train/i],
				handler: () => {
					this.readTransit("train");
					return true;
				}
			},
			{
				patterns: [/commute/i, /commute time/i, /how'?s (?:the )?commute/i, /traffic/i],
				handler: () => {
					this.readCommute();
					return true;
				}
			},
			{
				patterns: [/add (?:transit )?stop (.+)/i, /track (.+) stop/i],
				handler: (match) => {
					const stop = match[1].trim();
					this.addTransitStop(stop);
					return true;
				}
			},

			// ============================================
			// TIMER / ALARM COMMANDS
			// ============================================
			{
				patterns: [/set (?:a )?timer (?:for )?(\d+) (minute|second|hour)s?/i],
				handler: (match) => {
					const amount = parseInt(match[1]);
					const unit = match[2].toLowerCase();
					this.setTimer(amount, unit);
					return true;
				}
			},
			{
				patterns: [/cancel (?:the )?timer/i, /stop (?:the )?timer/i],
				handler: () => {
					this.cancelTimer();
					return true;
				}
			},
			{
				patterns: [/set (?:an )?alarm (?:for )?(.+)/i, /wake me (?:up )?(?:at )?(.+)/i],
				handler: (match) => {
					const timeStr = match[1].trim();
					this.setAlarm(timeStr);
					return true;
				}
			},

			// ============================================
			// DISPLAY / SETTINGS COMMANDS
			// ============================================
			{
				patterns: [/open settings/i, /show settings/i, /settings/i],
				handler: () => {
					this.sendNotification("SETTINGS_TOGGLE");
					this.speak("Opening settings");
					return true;
				}
			},
			{
				patterns: [/close settings/i, /hide settings/i, /exit settings/i],
				handler: () => {
					this.sendNotification("SETTINGS_CLOSE");
					this.speak("Closing settings");
					return true;
				}
			},
			{
				patterns: [
					/(?:set )?brightness (?:to )?(\d+)/i, 
					/brightness (\d+)/i,
					/screen (?:to )?(\d+) percent/i
				],
				handler: (match) => {
					const value = parseInt(match[1]);
					if (!isNaN(value)) {
						this.setBrightness(value);
						return true;
					}
					return false;
				}
			},
			{
				patterns: [/(?:turn )?brightness down/i, /dimmer/i, /dim (?:the )?screen/i],
				handler: () => {
					this.adjustBrightness(-20);
					return true;
				}
			},
			{
				patterns: [/(?:turn )?brightness up/i, /brighter/i],
				handler: () => {
					this.adjustBrightness(20);
					return true;
				}
			},
			{
				patterns: [/night mode/i, /dark mode/i],
				handler: () => {
					this.setDisplayMode("dark");
					return true;
				}
			},
			{
				patterns: [/day mode/i, /light mode/i, /bright mode/i],
				handler: () => {
					this.setDisplayMode("light");
					return true;
				}
			},
			{
				patterns: [/screen off/i, /display off/i, /sleep/i],
				handler: () => {
					this.setScreenPower(false);
					return true;
				}
			},
			{
				patterns: [/screen on/i, /display on/i, /wake up/i],
				handler: () => {
					this.setScreenPower(true);
					return true;
				}
			},
			{
				patterns: [/fullscreen/i, /full screen/i],
				handler: () => {
					this.toggleFullscreen();
					return true;
				}
			},
			{
				patterns: [/zoom (?:to )?(\d+)/i, /set zoom (?:to )?(\d+)/i],
				handler: (match) => {
					const value = parseInt(match[1]);
					this.setZoom(value);
					return true;
				}
			},

			// ============================================
			// FITNESS / HEALTH COMMANDS
			// ============================================
			{
				patterns: [/(?:my )?steps/i, /how many steps/i, /step count/i],
				handler: () => {
					this.readFitness("steps");
					return true;
				}
			},
			{
				patterns: [/(?:my )?heart rate/i, /pulse/i],
				handler: () => {
					this.readFitness("heartRate");
					return true;
				}
			},
			{
				patterns: [/fitness (?:summary|stats|data)/i, /health data/i],
				handler: () => {
					this.readFitness("summary");
					return true;
				}
			},

			// ============================================
			// COMPLIMENTS COMMANDS
			// ============================================
			{
				patterns: [/add compliment (.+)/i, /new compliment (.+)/i],
				handler: (match) => {
					const compliment = match[1].trim();
					this.addCompliment(compliment);
					return true;
				}
			},
			{
				patterns: [/give me a compliment/i, /compliment me/i, /say something nice/i],
				handler: () => {
					this.readRandomCompliment();
					return true;
				}
			},

			// ============================================
			// TIME / DATE COMMANDS
			// ============================================
			{
				patterns: [/what time/i, /current time/i, /time is it/i],
				handler: () => {
					const now = new Date();
					this.speak(`The time is ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
					return true;
				}
			},
			{
				patterns: [/what day/i, /what'?s today/i, /today'?s date/i, /what date/i],
				handler: () => {
					const now = new Date();
					this.speak(`Today is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
					return true;
				}
			},

			// ============================================
			// ECOSYSTEM / INTEGRATION COMMANDS
			// ============================================
			{
				patterns: [/connect (?:to )?(.+)/i, /pair (?:with )?(.+)/i],
				handler: (match) => {
					const service = match[1].trim();
					this.connectService(service);
					return true;
				}
			},
			{
				patterns: [/disconnect (?:from )?(.+)/i, /unpair (?:from )?(.+)/i],
				handler: (match) => {
					const service = match[1].trim();
					this.disconnectService(service);
					return true;
				}
			},
			{
				patterns: [/sync (?:with )?(.+)/i],
				handler: (match) => {
					const service = match[1].trim();
					this.syncService(service);
					return true;
				}
			},

			// ============================================
			// QUOTES COMMANDS
			// ============================================
			{
				patterns: [/(?:read )?(?:a )?quote/i, /inspirational quote/i, /give me a quote/i],
				handler: () => {
					this.readQuote();
					return true;
				}
			},
			{
				patterns: [/add quote (.+)/i, /new quote (.+)/i],
				handler: (match) => {
					const quote = match[1].trim();
					this.addQuote(quote);
					return true;
				}
			},

			// ============================================
			// SYSTEM COMMANDS
			// ============================================
			{
				patterns: [/refresh/i, /reload/i, /update display/i],
				handler: () => {
					this.sendNotification("REFRESH");
					this.speak("Refreshing display");
					return true;
				}
			},
			{
				patterns: [/restart/i, /reboot mirror/i],
				handler: () => {
					this.speak("Restarting MagicMirror");
					this.sendSocketNotification("AI_SYSTEM_RESTART");
					return true;
				}
			},
			{
				patterns: [/status/i, /system status/i, /mirror status/i],
				handler: () => {
					this.readSystemStatus();
					return true;
				}
			},
			{
				patterns: [/help/i, /what can you do/i, /available commands/i, /list commands/i],
				handler: () => {
					this.listCommands();
					return true;
				}
			},
			{
				patterns: [/good morning/i],
				handler: () => {
					this.morningRoutine();
					return true;
				}
			},
			{
				patterns: [/good night/i, /goodnight/i],
				handler: () => {
					this.nightRoutine();
					return true;
				}
			},
			{
				patterns: [/thank you/i, /thanks/i],
				handler: () => {
					this.speak("You're welcome!");
					return true;
				}
			}
		];
		
		// Try each command pattern
		for (const cmd of commands) {
			for (const pattern of cmd.patterns) {
				const match = text.match(pattern);
				if (match) {
					return cmd.handler(match);
				}
			}
		}
		
		return false; // No built-in command matched
	},

	/**
	 * Text-to-speech output
	 */
	speak: function (text) {
		if (!("speechSynthesis" in window)) {
			Log.warn(`[${this.name}] Speech synthesis not supported`);
			return;
		}
		
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = this.config.voiceLanguage;
		utterance.rate = 1.0;
		utterance.pitch = 1.0;
		speechSynthesis.speak(utterance);
		
		// Also show in chat if visible
		if (this.chatVisible) {
			this.addMessage("assistant", text);
		}
	},

	// ============================================
	// FEATURE ENABLE/DISABLE
	// ============================================

	/**
	 * Enable a feature/module
	 */
	enableFeature: function (target) {
		const moduleMap = this.getModuleNameMap();
		const moduleName = moduleMap[target.toLowerCase()] || target;
		
		this.sendNotification("MODULE_SHOW", { module: moduleName });
		this.sendSocketNotification("AI_ENABLE_MODULE", { module: moduleName });
		this.speak(`Turning on ${target}`);
		return true;
	},

	/**
	 * Disable a feature/module
	 */
	disableFeature: function (target) {
		const moduleMap = this.getModuleNameMap();
		const moduleName = moduleMap[target.toLowerCase()] || target;
		
		this.sendNotification("MODULE_HIDE", { module: moduleName });
		this.sendSocketNotification("AI_DISABLE_MODULE", { module: moduleName });
		this.speak(`Turning off ${target}`);
		return true;
	},

	/**
	 * Map spoken names to module IDs
	 */
	getModuleNameMap: function () {
		return {
			"clock": "clock",
			"time": "clock",
			"calendar": "calendar",
			"events": "calendar",
			"weather": "weather",
			"forecast": "weather",
			"news": "newsfeed",
			"newsfeed": "newsfeed",
			"news feed": "newsfeed",
			"compliments": "compliments",
			"network": "network",
			"security": "security",
			"cameras": "security",
			"music": "music",
			"spotify": "music",
			"smart home": "smarthome",
			"home": "smarthome",
			"fitness": "fitness",
			"health": "fitness",
			"transit": "transit",
			"bus": "transit",
			"train": "transit",
			"packages": "packages",
			"delivery": "packages",
			"timer": "timer",
			"countdown": "countdown",
			"quotes": "quotes",
			"ai": "ai",
			"assistant": "ai"
		};
	},

	// ============================================
	// CALENDAR COMMANDS
	// ============================================

	/**
	 * Add calendar event
	 */
	addCalendarEvent: function (dateStr, title) {
		this.sendSocketNotification("AI_ADD_CALENDAR_EVENT", { date: dateStr, title });
		this.speak(`Adding ${title} to your calendar`);
	},

	/**
	 * Read calendar events for a specific date
	 */
	readCalendarEventsForDate: function (dateStr) {
		this.sendSocketNotification("AI_GET_CALENDAR_DATE", { date: dateStr });
	},

	// ============================================
	// CAMERA / SECURITY COMMANDS
	// ============================================

	/**
	 * Show specific camera
	 */
	showCamera: function (cameraName) {
		this.sendNotification("SECURITY_SHOW_CAMERA", { camera: cameraName });
		this.speak(`Showing ${cameraName} camera`);
	},

	/**
	 * Show all cameras
	 */
	showAllCameras: function () {
		this.sendNotification("SECURITY_SHOW_ALL_CAMERAS");
		this.speak("Showing all cameras");
	},

	/**
	 * Close camera view
	 */
	closeCamera: function () {
		this.sendNotification("SECURITY_CLOSE_CAMERA");
		this.speak("Closing camera view");
	},

	/**
	 * Set security mode
	 */
	setSecurityMode: function (mode) {
		this.sendNotification("SECURITY_SET_MODE", { mode });
		this.speak(`Security system ${mode}`);
	},

	// ============================================
	// OPENEYE INTEGRATION COMMANDS
	// ============================================

	/**
	 * Search for new cameras on the network
	 */
	searchForCameras: function () {
		this.speak("Searching for cameras on your network. This may take a moment.");
		this.sendNotification("OPENEYE_SEARCH_CAMERAS");
		this.sendSocketNotification("AI_OPENEYE_SEARCH_CAMERAS");
	},

	/**
	 * Add a camera by name (from discovered cameras)
	 */
	addCamera: function (cameraName) {
		this.sendSocketNotification("AI_OPENEYE_ADD_CAMERA", { name: cameraName });
		this.speak(`Adding ${cameraName} camera to OpenEye`);
	},

	/**
	 * Add a camera by IP address
	 */
	addCameraByIP: function (ip) {
		this.sendSocketNotification("AI_OPENEYE_ADD_CAMERA_IP", { ip });
		this.speak(`Adding camera at ${ip}`);
	},

	/**
	 * Remove a camera
	 */
	removeCamera: function (cameraName) {
		this.sendSocketNotification("AI_OPENEYE_REMOVE_CAMERA", { name: cameraName });
		this.speak(`Removing ${cameraName} camera`);
	},

	/**
	 * Capture a photo from a camera
	 */
	capturePhoto: function (camera) {
		this.sendNotification("OPENEYE_CAPTURE_PHOTO", { camera });
		this.sendSocketNotification("AI_OPENEYE_CAPTURE_PHOTO", { camera });
		this.speak(`Capturing photo from ${camera}`);
	},

	/**
	 * Start face training session
	 */
	startFaceTraining: function (personName = null) {
		const name = personName || "yourself";
		this.sendNotification("OPENEYE_START_FACE_TRAINING", { person: personName });
		this.sendSocketNotification("AI_OPENEYE_START_TRAINING", { person: personName });
		this.speak(`Starting face training for ${name}. Please look at the camera and follow the prompts.`);
	},

	/**
	 * Capture training photo for facial recognition
	 */
	captureTrainingPhoto: function (personName) {
		this.sendNotification("OPENEYE_CAPTURE_TRAINING_PHOTO", { person: personName });
		this.sendSocketNotification("AI_OPENEYE_CAPTURE_TRAINING", { person: personName });
		this.speak(`Capturing training photo for ${personName}`);
	},

	/**
	 * Identify person at a location
	 */
	identifyPerson: function (location) {
		this.sendSocketNotification("AI_OPENEYE_IDENTIFY", { camera: location });
		this.speak(`Checking who is at the ${location}`);
	},

	/**
	 * List known faces
	 */
	listKnownFaces: function () {
		this.sendSocketNotification("AI_OPENEYE_LIST_FACES");
	},

	/**
	 * Remove a face from recognition
	 */
	removeFace: function (personName) {
		this.sendSocketNotification("AI_OPENEYE_REMOVE_FACE", { person: personName });
		this.speak(`Removing ${personName} from facial recognition`);
	},

	/**
	 * Start recording on a camera
	 */
	startRecording: function (camera) {
		this.sendNotification("OPENEYE_START_RECORDING", { camera });
		this.sendSocketNotification("AI_OPENEYE_START_RECORDING", { camera });
		this.speak(`Starting recording on ${camera}`);
	},

	/**
	 * Stop recording
	 */
	stopRecording: function (camera) {
		const target = camera || "all cameras";
		this.sendNotification("OPENEYE_STOP_RECORDING", { camera });
		this.sendSocketNotification("AI_OPENEYE_STOP_RECORDING", { camera });
		this.speak(`Stopping recording on ${target}`);
	},

	/**
	 * Show security events
	 */
	showSecurityEvents: function () {
		this.sendNotification("SECURITY_SHOW_EVENTS");
		this.sendSocketNotification("AI_OPENEYE_GET_EVENTS");
		this.speak("Showing recent security events");
	},

	/**
	 * Enable/disable motion detection
	 */
	setMotionDetection: function (camera, enabled) {
		const target = camera === "all" ? "all cameras" : camera;
		this.sendSocketNotification("AI_OPENEYE_MOTION_DETECTION", { camera, enabled });
		this.speak(`${enabled ? "Enabling" : "Disabling"} motion detection on ${target}`);
	},

	/**
	 * Read security system status
	 */
	readSecurityStatus: function () {
		this.sendSocketNotification("AI_OPENEYE_GET_STATUS");
	},

	// ============================================
	// NAVIGATION / HOME SCREEN COMMANDS
	// ============================================

	/**
	 * Return to home screen / dashboard
	 */
	goHome: function () {
		// Close any open overlays, modals, camera views
		this.sendNotification("SECURITY_CLOSE_CAMERA");
		this.sendNotification("SETTINGS_CLOSE");
		this.sendNotification("OVERLAY_CLOSE");
		this.sendNotification("MODAL_CLOSE");
		this.sendNotification("GO_HOME");
		
		// Reset all modules to default visibility
		this.sendNotification("MODULES_RESET");
		
		// Close chat if open
		if (this.chatVisible) {
			this.chatVisible = false;
			this.updateDom(this.config.animationSpeed);
		}
		
		// Transition animation
		this.animateTransition("home");
		this.speak("Returning to home screen");
	},

	/**
	 * Close current overlay/popup
	 */
	closeOverlay: function () {
		this.sendNotification("OVERLAY_CLOSE");
		this.sendNotification("MODAL_CLOSE");
		this.sendNotification("POPUP_CLOSE");
		this.speak("Closed");
	},

	/**
	 * Animate transition between views
	 */
	animateTransition: function (destination) {
		const overlay = document.createElement("div");
		overlay.className = "ai-transition-overlay";
		overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0, 0, 0, 0);
			pointer-events: none;
			z-index: 9999;
			transition: background 0.3s ease;
		`;
		document.body.appendChild(overlay);
		
		// Fade in
		requestAnimationFrame(() => {
			overlay.style.background = "rgba(0, 0, 0, 0.5)";
		});
		
		// Fade out after transition
		setTimeout(() => {
			overlay.style.background = "rgba(0, 0, 0, 0)";
			setTimeout(() => {
				overlay.remove();
			}, 300);
		}, 300);
	},

	// ============================================
	// SMART HOME COMMANDS
	// ============================================

	/**
	 * Control lights
	 */
	controlLight: function (room, action, level = null) {
		this.sendNotification("SMARTHOME_CONTROL", {
			type: "light",
			room,
			action,
			level
		});
		
		if (action === "dim") {
			this.speak(`Setting ${room} lights to ${level} percent`);
		} else {
			this.speak(`Turning ${action} ${room} lights`);
		}
	},

	/**
	 * Set thermostat
	 */
	setThermostat: function (temperature) {
		this.sendNotification("SMARTHOME_CONTROL", {
			type: "thermostat",
			action: "set",
			value: temperature
		});
		this.speak(`Setting thermostat to ${temperature} degrees`);
	},

	/**
	 * Read thermostat
	 */
	readThermostat: function () {
		this.sendSocketNotification("AI_GET_THERMOSTAT");
	},

	/**
	 * Control lock
	 */
	controlLock: function (device, action) {
		this.sendNotification("SMARTHOME_CONTROL", {
			type: "lock",
			device,
			action
		});
		this.speak(`${action === "lock" ? "Locking" : "Unlocking"} ${device}`);
	},

	/**
	 * Control garage
	 */
	controlGarage: function (action) {
		this.sendNotification("SMARTHOME_CONTROL", {
			type: "garage",
			action
		});
		this.speak(`${action === "open" ? "Opening" : "Closing"} garage door`);
	},

	/**
	 * Activate scene
	 */
	activateScene: function (sceneName) {
		this.sendNotification("SMARTHOME_SCENE", { scene: sceneName });
		this.speak(`Activating ${sceneName} scene`);
	},

	// ============================================
	// MUSIC / MEDIA COMMANDS
	// ============================================

	/**
	 * Control music playback
	 */
	controlMusic: function (action) {
		this.sendNotification("MUSIC_CONTROL", { action });
		const messages = {
			play: "Playing music",
			pause: "Pausing music",
			next: "Skipping to next track",
			previous: "Going to previous track"
		};
		this.speak(messages[action] || `Music ${action}`);
	},

	/**
	 * Set volume
	 */
	setVolume: function (level) {
		const clamped = Math.max(0, Math.min(100, level));
		this.sendNotification("MUSIC_VOLUME", { level: clamped });
		this.speak(`Volume set to ${clamped} percent`);
	},

	/**
	 * Read now playing
	 */
	readNowPlaying: function () {
		this.sendSocketNotification("AI_GET_NOW_PLAYING");
	},

	// ============================================
	// PACKAGE TRACKING
	// ============================================

	/**
	 * Add package for tracking
	 */
	addPackage: function (trackingNumber) {
		this.sendSocketNotification("AI_ADD_PACKAGE", { trackingNumber });
		this.speak(`Adding package ${this.readTrackingNumber(trackingNumber)}`);
	},

	/**
	 * Read tracking number phonetically
	 */
	readTrackingNumber: function (number) {
		return number.split("").join(" ");
	},

	/**
	 * Read current packages
	 */
	readPackages: function () {
		this.sendSocketNotification("AI_GET_PACKAGES", {});
	},

	/**
	 * Remove a package
	 */
	removePackage: function (trackingNumber) {
		this.sendSocketNotification("AI_REMOVE_PACKAGE", { trackingNumber });
		this.speak(`Removing package`);
	},

	// ============================================
	// WEATHER COMMANDS
	// ============================================

	/**
	 * Read current weather
	 */
	readCurrentWeather: function () {
		this.sendSocketNotification("AI_GET_CURRENT_WEATHER");
	},

	/**
	 * Get weather for specific location
	 */
	getWeatherForLocation: function (location) {
		this.sendSocketNotification("AI_GET_WEATHER", { location });
	},

	/**
	 * Add weather location
	 */
	addWeatherLocation: function (location) {
		this.sendSocketNotification("AI_ADD_LOCATION", { type: "weather", location });
		this.speak(`Adding weather for ${location}`);
	},

	/**
	 * Remove weather location
	 */
	removeWeatherLocation: function (location) {
		this.sendSocketNotification("AI_REMOVE_LOCATION", { type: "weather", location });
		this.speak(`Removing ${location} from weather locations`);
	},

	// ============================================
	// NEWS COMMANDS
	// ============================================

	/**
	 * Read news headlines
	 */
	readNews: function () {
		this.sendSocketNotification("AI_GET_NEWS", {});
	},

	/**
	 * Add news source
	 */
	addNewsSource: function (source) {
		this.sendSocketNotification("AI_ADD_NEWS_SOURCE", { source });
		this.speak(`Adding ${source} to news sources`);
	},

	/**
	 * Remove news source
	 */
	removeNewsSource: function (source) {
		this.sendSocketNotification("AI_REMOVE_NEWS_SOURCE", { source });
		this.speak(`Removing ${source} from news`);
	},

	// ============================================
	// TRANSIT COMMANDS
	// ============================================

	/**
	 * Read transit info
	 */
	readTransit: function (type) {
		this.sendSocketNotification("AI_GET_TRANSIT", { type });
	},

	/**
	 * Read commute info
	 */
	readCommute: function () {
		this.sendSocketNotification("AI_GET_COMMUTE");
	},

	/**
	 * Add transit stop
	 */
	addTransitStop: function (stop) {
		this.sendSocketNotification("AI_ADD_TRANSIT_STOP", { stop });
		this.speak(`Adding ${stop} to transit stops`);
	},

	// ============================================
	// TIMER / ALARM COMMANDS
	// ============================================

	/**
	 * Set timer
	 */
	setTimer: function (amount, unit) {
		this.sendNotification("TIMER_SET", { amount, unit });
		this.speak(`Timer set for ${amount} ${unit}${amount > 1 ? "s" : ""}`);
	},

	/**
	 * Cancel timer
	 */
	cancelTimer: function () {
		this.sendNotification("TIMER_CANCEL");
		this.speak("Timer cancelled");
	},

	/**
	 * Set alarm
	 */
	setAlarm: function (timeStr) {
		this.sendSocketNotification("AI_SET_ALARM", { time: timeStr });
		this.speak(`Alarm set for ${timeStr}`);
	},

	// ============================================
	// DISPLAY COMMANDS
	// ============================================

	/**
	 * Show/hide module
	 */
	showModule: function (moduleName) {
		const moduleMap = this.getModuleNameMap();
		const mapped = moduleMap[moduleName.toLowerCase()] || moduleName;
		this.sendNotification("MODULE_SHOW", { module: mapped });
		this.speak(`Showing ${moduleName}`);
	},

	hideModule: function (moduleName) {
		const moduleMap = this.getModuleNameMap();
		const mapped = moduleMap[moduleName.toLowerCase()] || moduleName;
		this.sendNotification("MODULE_HIDE", { module: mapped });
		this.speak(`Hiding ${moduleName}`);
	},

	/**
	 * Set display brightness
	 */
	setBrightness: function (value) {
		const clamped = Math.max(20, Math.min(100, value));
		document.body.style.filter = `brightness(${clamped / 100})`;
		this.sendNotification("BRIGHTNESS_SET", { value: clamped });
		this.speak(`Brightness set to ${clamped} percent`);
	},

	/**
	 * Adjust brightness relative
	 */
	adjustBrightness: function (delta) {
		const current = parseFloat(document.body.style.filter?.match(/brightness\(([^)]+)\)/)?.[1] || 1) * 100;
		this.setBrightness(current + delta);
	},

	/**
	 * Set display mode
	 */
	setDisplayMode: function (mode) {
		this.sendNotification("DISPLAY_MODE", { mode });
		this.speak(`${mode} mode activated`);
	},

	/**
	 * Set screen power
	 */
	setScreenPower: function (on) {
		this.sendSocketNotification("AI_SCREEN_POWER", { on });
		this.speak(on ? "Display on" : "Display going to sleep");
	},

	/**
	 * Toggle fullscreen
	 */
	toggleFullscreen: function () {
		if (document.fullscreenElement) {
			document.exitFullscreen();
			this.speak("Exiting fullscreen");
		} else {
			document.documentElement.requestFullscreen();
			this.speak("Entering fullscreen");
		}
	},

	/**
	 * Set zoom level
	 */
	setZoom: function (value) {
		const clamped = Math.max(50, Math.min(150, value));
		document.body.style.zoom = `${clamped}%`;
		this.speak(`Zoom set to ${clamped} percent`);
	},

	// ============================================
	// FITNESS COMMANDS
	// ============================================

	/**
	 * Read fitness data
	 */
	readFitness: function (type) {
		this.sendSocketNotification("AI_GET_FITNESS", { type });
	},

	// ============================================
	// COMPLIMENTS / QUOTES COMMANDS
	// ============================================

	/**
	 * Add compliment
	 */
	addCompliment: function (text) {
		this.sendSocketNotification("AI_ADD_COMPLIMENT", { text });
		this.speak("Compliment added");
	},

	/**
	 * Read random compliment
	 */
	readRandomCompliment: function () {
		this.sendSocketNotification("AI_GET_COMPLIMENT");
	},

	/**
	 * Read quote
	 */
	readQuote: function () {
		this.sendSocketNotification("AI_GET_QUOTE");
	},

	/**
	 * Add quote
	 */
	addQuote: function (text) {
		this.sendSocketNotification("AI_ADD_QUOTE", { text });
		this.speak("Quote added");
	},

	// ============================================
	// ECOSYSTEM / SERVICE COMMANDS
	// ============================================

	/**
	 * Connect to service
	 */
	connectService: function (service) {
		this.sendSocketNotification("AI_CONNECT_SERVICE", { service });
		this.speak(`Connecting to ${service}`);
	},

	/**
	 * Disconnect from service
	 */
	disconnectService: function (service) {
		this.sendSocketNotification("AI_DISCONNECT_SERVICE", { service });
		this.speak(`Disconnecting from ${service}`);
	},

	/**
	 * Sync with service
	 */
	syncService: function (service) {
		this.sendSocketNotification("AI_SYNC_SERVICE", { service });
		this.speak(`Syncing with ${service}`);
	},

	// ============================================
	// CALENDAR COMMANDS
	// ============================================

	/**
	 * Read calendar events
	 */
	readCalendarEvents: function () {
		this.sendSocketNotification("AI_GET_CALENDAR", {});
	},

	// ============================================
	// SYSTEM COMMANDS
	// ============================================

	/**
	 * Read system status
	 */
	readSystemStatus: function () {
		this.sendSocketNotification("AI_GET_STATUS");
	},

	/**
	 * Morning routine
	 */
	morningRoutine: function () {
		this.speak("Good morning! Let me get your day started.");
		
		// Enable day modules
		this.sendNotification("MODULE_SHOW", { module: "weather" });
		this.sendNotification("MODULE_SHOW", { module: "calendar" });
		this.sendNotification("MODULE_SHOW", { module: "newsfeed" });
		
		// Read summary
		setTimeout(() => {
			this.sendSocketNotification("AI_MORNING_SUMMARY");
		}, 2000);
	},

	/**
	 * Night routine
	 */
	nightRoutine: function () {
		this.speak("Good night! Sleep well.");
		
		// Dim display and hide most modules
		this.setBrightness(30);
		this.sendNotification("MODULE_HIDE", { module: "newsfeed" });
		this.sendNotification("MODULE_HIDE", { module: "calendar" });
		
		// Turn off lights if smart home connected
		this.sendNotification("SMARTHOME_CONTROL", {
			type: "light",
			room: "all",
			action: "off"
		});
	},

	/**
	 * List available voice commands
	 */
	listCommands: function () {
		const categories = {
			"Module Control": ["Turn on/off [module]", "Show/hide [module]"],
			"Calendar": ["Add event on [date] for [title]", "What's on my calendar", "Events on [date]"],
			"Security": ["Show [camera] camera", "Show all cameras", "Arm/disarm security"],
			"OpenEye": ["Search for cameras", "Add [name] camera", "Take photo from [camera]", "Train face for [name]", "Who's at the door"],
			"Smart Home": ["Lights on/off in [room]", "Set thermostat to [temp]", "Lock/unlock [door]", "Open/close garage"],
			"Music": ["Play/pause music", "Next/previous song", "Volume [level]"],
			"Packages": ["Add package [number]", "My packages", "Remove package"],
			"Weather": ["What's the weather", "Weather in [city]", "Add location [city]"],
			"News": ["Read news", "Add [source] news"],
			"Transit": ["Next bus/train", "Commute time"],
			"Timer": ["Set timer for [time]", "Cancel timer", "Set alarm for [time]"],
			"Display": ["Brightness [percent]", "Night/day mode", "Screen on/off"],
			"Navigation": ["Go home", "Dashboard", "Close", "Back", "Exit"]
		};
		
		let summary = "Available voice commands include: ";
		const highlights = ["Turn on or off any module", "Add calendar events", "Show cameras", "Train faces", "Control lights", "Track packages", "Say go home to return to dashboard"];
		summary += highlights.join(", ") + ". Say help for more details.";
		
		this.speak(summary);
		
		if (this.chatVisible) {
			let markdown = "## Voice Commands\n\n";
			for (const [category, commands] of Object.entries(categories)) {
				markdown += `**${category}**\n`;
				commands.forEach((cmd) => markdown += `• ${cmd}\n`);
				markdown += "\n";
			}
			this.addMessage("system", markdown);
		}
	},

	/**
	 * Handle notifications from node_helper
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "AI_CONFIG_STATUS":
				this.apiConfigured = payload.configured;
				if (!payload.configured) {
					Log.warn(`[${this.name}] AI provider not configured. Add API key in settings.`);
				}
				break;

			case "AI_RESPONSE":
				this.handleAIResponse(payload);
				break;

			case "AI_ERROR":
				this.handleAIError(payload);
				break;

			case "AI_ACTION_RESULT":
				if (payload.success) {
					this.addMessage("system", `✓ ${payload.message}`);
				} else {
					this.addMessage("system", `✗ ${payload.error}`);
				}
				break;

			// Voice command responses
			case "AI_PACKAGES_RESPONSE":
				if (payload.success) {
					this.speak(payload.message);
				} else {
					this.speak(`Error: ${payload.error}`);
				}
				break;

			case "AI_PACKAGES_LIST":
				if (payload.speech) {
					this.speak(payload.speech);
				}
				break;

			case "AI_WEATHER_RESPONSE":
				if (payload.speech) {
					this.speak(payload.speech);
				}
				break;

			case "AI_LOCATION_ADDED":
				if (payload.success) {
					this.speak(`Added ${payload.location} to your ${payload.type} locations.`);
				} else {
					this.speak(`Could not add location: ${payload.error}`);
				}
				break;

			case "AI_NEWS_RESPONSE":
				if (payload.speech) {
					this.speak(payload.speech);
				}
				break;

			case "AI_NEWS_SOURCE_ADDED":
				if (payload.speech) {
					this.speak(payload.speech);
				}
				break;

			case "AI_CALENDAR_RESPONSE":
				if (payload.speech) {
					this.speak(payload.speech);
				}
				break;

			// OpenEye / Security responses
			case "AI_OPENEYE_CAMERAS_FOUND":
				if (payload.cameras && payload.cameras.length > 0) {
					const count = payload.cameras.length;
					const names = payload.cameras.slice(0, 3).map((c) => c.name || c.ip).join(", ");
					this.speak(`Found ${count} camera${count > 1 ? "s" : ""}. ${names}${count > 3 ? " and more" : ""}. Say add camera followed by the name to add one.`);
				} else {
					this.speak("No new cameras found on your network. Make sure cameras are powered on and connected.");
				}
				break;

			case "AI_OPENEYE_CAMERA_ADDED":
				if (payload.success) {
					this.speak(`${payload.name} camera has been added successfully.`);
				} else {
					this.speak(`Could not add camera: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_CAMERA_REMOVED":
				if (payload.success) {
					this.speak(`Camera removed successfully.`);
				} else {
					this.speak(`Could not remove camera: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_PHOTO_CAPTURED":
				if (payload.success) {
					this.speak(`Photo captured and saved.`);
					// Show the photo in an overlay
					this.sendNotification("OPENEYE_SHOW_PHOTO", { url: payload.photoUrl });
				} else {
					this.speak(`Could not capture photo: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_TRAINING_STARTED":
				if (payload.success) {
					this.speak(`Face training started for ${payload.person}. Please look at the camera. I'll capture several photos.`);
				} else {
					this.speak(`Could not start training: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_TRAINING_PHOTO":
				if (payload.success) {
					this.speak(`Photo ${payload.photoNumber} of ${payload.totalNeeded} captured. ${payload.remaining} more needed.`);
				}
				break;

			case "AI_OPENEYE_TRAINING_COMPLETE":
				if (payload.success) {
					this.speak(`Face training complete! ${payload.person} can now be recognized.`);
				} else {
					this.speak(`Training failed: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_PERSON_IDENTIFIED":
				if (payload.identified) {
					this.speak(`That appears to be ${payload.person} with ${Math.round(payload.confidence * 100)} percent confidence.`);
				} else {
					this.speak("I don't recognize that person.");
				}
				break;

			case "AI_OPENEYE_KNOWN_FACES":
				if (payload.faces && payload.faces.length > 0) {
					const names = payload.faces.join(", ");
					this.speak(`I can recognize: ${names}`);
				} else {
					this.speak("No faces have been trained yet. Say train my face to get started.");
				}
				break;

			case "AI_OPENEYE_FACE_REMOVED":
				if (payload.success) {
					this.speak(`${payload.person} has been removed from facial recognition.`);
				} else {
					this.speak(`Could not remove face: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_RECORDING_STARTED":
				if (payload.success) {
					this.speak(`Now recording on ${payload.camera}.`);
				} else {
					this.speak(`Could not start recording: ${payload.error}`);
				}
				break;

			case "AI_OPENEYE_RECORDING_STOPPED":
				if (payload.success) {
					this.speak(`Recording stopped.`);
				}
				break;

			case "AI_OPENEYE_EVENTS":
				if (payload.events && payload.events.length > 0) {
					const recent = payload.events.slice(0, 3);
					let speech = `Recent events: `;
					recent.forEach((e) => {
						speech += `${e.type} on ${e.camera} at ${e.time}. `;
					});
					this.speak(speech);
				} else {
					this.speak("No recent security events.");
				}
				break;

			case "AI_OPENEYE_MOTION_SET":
				if (payload.success) {
					const state = payload.enabled ? "enabled" : "disabled";
					this.speak(`Motion detection ${state} on ${payload.camera}.`);
				}
				break;

			case "AI_OPENEYE_STATUS":
				if (payload.success) {
					const { cameras, online, recording, faces } = payload;
					this.speak(`OpenEye status: ${cameras} cameras configured, ${online} online, ${recording} recording. ${faces} known faces enrolled.`);
				} else {
					this.speak("Could not get OpenEye status. Make sure the system is running.");
				}
				break;
		}
	},

	/**
	 * Handle MM notifications
	 */
	notificationReceived: function (notification, payload, sender) {
		switch (notification) {
			case "AI_TOGGLE":
				this.toggleChat();
				break;

			case "AI_SEND_MESSAGE":
				if (payload && typeof payload === "string") {
					this.sendMessage(payload);
				}
				break;

			case "AI_START_VOICE":
				this.startVoiceRecognition();
				break;

			case "AI_STOP_VOICE":
				this.stopVoiceRecognition();
				break;
		}
	},

	/**
	 * Generate the DOM
	 */
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "ai-assistant-module";

		// AI Assistant button
		if (this.config.showAssistant) {
			const button = this.createAssistantButton();
			wrapper.appendChild(button);
		}

		// Chat panel (hidden by default)
		if (this.chatVisible) {
			const panel = this.createChatPanel();
			wrapper.appendChild(panel);
		}

		return wrapper;
	},

	/**
	 * Create assistant button
	 */
	createAssistantButton: function () {
		const button = document.createElement("div");
		button.className = `ai-button ${this.isListening ? "listening" : ""} ${this.isProcessing ? "processing" : ""}`;
		button.innerHTML = `
			<div class="ai-icon">
				<i class="fas ${this.isListening ? "fa-microphone" : this.isProcessing ? "fa-spinner fa-spin" : "fa-robot"}"></i>
			</div>
			${!this.config.iconOnly ? '<span class="ai-label">AI Assistant</span>' : ""}
		`;
		button.addEventListener("click", () => this.toggleChat());
		return button;
	},

	/**
	 * Create chat panel
	 */
	createChatPanel: function () {
		const panel = document.createElement("div");
		panel.className = `ai-chat-panel ${this.config.theme}`;

		// Header
		const header = document.createElement("div");
		header.className = "ai-chat-header";
		header.innerHTML = `
			<div class="ai-chat-title">
				<i class="fas fa-robot"></i>
				<span>AI Assistant</span>
				<span class="provider-badge">${this.config.provider}</span>
			</div>
			<div class="ai-chat-controls">
				${this.config.enableVoice ? `
					<button class="voice-btn ${this.isListening ? "active" : ""}" id="ai-voice-btn">
						<i class="fas fa-microphone"></i>
					</button>
				` : ""}
				<button class="close-btn" id="ai-close-btn">
					<i class="fas fa-times"></i>
				</button>
			</div>
		`;
		panel.appendChild(header);

		// Messages container
		const messagesContainer = document.createElement("div");
		messagesContainer.className = "ai-messages";
		messagesContainer.id = "ai-messages";

		if (this.messages.length === 0) {
			messagesContainer.innerHTML = `
				<div class="ai-welcome">
					<i class="fas fa-robot"></i>
					<h3>Hello! I'm your AI Assistant</h3>
					<p>Ask me anything or use voice commands to control your mirror.</p>
					<div class="ai-suggestions">
						<button class="suggestion-btn" data-msg="What's the weather today?">Weather</button>
						<button class="suggestion-btn" data-msg="Show my calendar">Calendar</button>
						<button class="suggestion-btn" data-msg="Hide all modules">Clean view</button>
						<button class="suggestion-btn" data-msg="What's in the news?">News</button>
					</div>
				</div>
			`;
		} else {
			this.messages.forEach((msg) => {
				const bubble = this.createMessageBubble(msg);
				messagesContainer.appendChild(bubble);
			});
		}

		panel.appendChild(messagesContainer);

		// Input area
		const inputArea = document.createElement("div");
		inputArea.className = "ai-input-area";
		inputArea.innerHTML = `
			<input type="text" 
				   id="ai-input" 
				   class="ai-text-input" 
				   placeholder="Type a message or tap the mic..."
				   autocomplete="off">
			<button class="send-btn" id="ai-send-btn">
				<i class="fas fa-paper-plane"></i>
			</button>
		`;
		panel.appendChild(inputArea);

		// Attach event listeners
		setTimeout(() => this.attachChatListeners(), 0);

		return panel;
	},

	/**
	 * Create message bubble
	 */
	createMessageBubble: function (msg) {
		const bubble = document.createElement("div");
		bubble.className = `ai-message ${msg.role}`;

		const icon = msg.role === "user" ? "fa-user" : msg.role === "assistant" ? "fa-robot" : "fa-cog";
		const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

		bubble.innerHTML = `
			<div class="message-icon"><i class="fas ${icon}"></i></div>
			<div class="message-content">
				<div class="message-text">${this.formatMessage(msg.content)}</div>
				<div class="message-time">${time}</div>
			</div>
		`;

		return bubble;
	},

	/**
	 * Format message content (handle markdown, code blocks, etc.)
	 */
	formatMessage: function (content) {
		// Basic markdown formatting
		let formatted = content
			.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
			.replace(/\*(.*?)\*/g, "<em>$1</em>")
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\n/g, "<br>");

		// Hide action blocks from display
		formatted = formatted.replace(/```action[\s\S]*?```/g, "");

		return formatted;
	},

	/**
	 * Attach event listeners to chat elements
	 */
	attachChatListeners: function () {
		// Close button
		const closeBtn = document.getElementById("ai-close-btn");
		if (closeBtn) {
			closeBtn.addEventListener("click", () => this.toggleChat());
		}

		// Voice button
		const voiceBtn = document.getElementById("ai-voice-btn");
		if (voiceBtn) {
			voiceBtn.addEventListener("click", () => {
				if (this.isListening) {
					this.stopVoiceRecognition();
				} else {
					this.startVoiceRecognition();
				}
			});
		}

		// Send button
		const sendBtn = document.getElementById("ai-send-btn");
		if (sendBtn) {
			sendBtn.addEventListener("click", () => this.sendInputMessage());
		}

		// Text input
		const input = document.getElementById("ai-input");
		if (input) {
			input.addEventListener("keypress", (e) => {
				if (e.key === "Enter") {
					this.sendInputMessage();
				}
			});
			input.focus();
		}

		// Suggestion buttons
		document.querySelectorAll(".suggestion-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const msg = e.currentTarget.dataset.msg;
				this.sendMessage(msg);
			});
		});

		// Scroll to bottom
		const messagesEl = document.getElementById("ai-messages");
		if (messagesEl) {
			messagesEl.scrollTop = messagesEl.scrollHeight;
		}
	},

	/**
	 * Toggle chat panel visibility
	 */
	toggleChat: function () {
		this.chatVisible = !this.chatVisible;
		this.updateDom();
	},

	/**
	 * Start voice recognition
	 */
	startVoiceRecognition: function () {
		if (this.recognition && !this.isListening) {
			try {
				this.recognition.start();
			} catch (e) {
				Log.error(`[${this.name}] Failed to start voice recognition:`, e);
			}
		}
	},

	/**
	 * Stop voice recognition
	 */
	stopVoiceRecognition: function () {
		if (this.recognition && this.isListening) {
			this.recognition.stop();
		}
	},

	/**
	 * Show interim transcript while speaking
	 */
	showInterimTranscript: function (transcript) {
		const input = document.getElementById("ai-input");
		if (input) {
			input.value = transcript;
		}
	},

	/**
	 * Send message from input field
	 */
	sendInputMessage: function () {
		const input = document.getElementById("ai-input");
		if (input && input.value.trim()) {
			this.sendMessage(input.value.trim());
			input.value = "";
		}
	},

	/**
	 * Send message to AI
	 */
	sendMessage: function (message) {
		if (!message || this.isProcessing) return;

		// Add user message
		this.addMessage("user", message);

		// Set processing state
		this.isProcessing = true;
		this.updateDom();

		// Build conversation history for context
		const conversationHistory = this.messages.map((msg) => ({
			role: msg.role === "system" ? "assistant" : msg.role,
			content: msg.content
		}));

		// Send to node_helper
		this.sendSocketNotification("AI_SEND_MESSAGE", {
			provider: this.config.provider,
			providerConfig: this.config[this.config.provider],
			systemPrompt: this.config.systemPrompt,
			message: message,
			history: conversationHistory.slice(-10), // Last 10 messages for context
			maxTokens: this.config.maxTokens,
			temperature: this.config.temperature
		});
	},

	/**
	 * Add message to chat
	 */
	addMessage: function (role, content) {
		this.messages.push({
			role: role,
			content: content,
			timestamp: Date.now()
		});
		this.updateDom();

		// Scroll to bottom after update
		setTimeout(() => {
			const messagesEl = document.getElementById("ai-messages");
			if (messagesEl) {
				messagesEl.scrollTop = messagesEl.scrollHeight;
			}
		}, 50);
	},

	/**
	 * Handle AI response
	 */
	handleAIResponse: function (payload) {
		this.isProcessing = false;

		// Add assistant message
		this.addMessage("assistant", payload.response);

		// Check for action blocks in response
		const actionMatch = payload.response.match(/```action\s*([\s\S]*?)\s*```/);
		if (actionMatch) {
			try {
				const action = JSON.parse(actionMatch[1]);
				this.executeAction(action);
			} catch (e) {
				Log.error(`[${this.name}] Failed to parse action:`, e);
			}
		}

		// Speak response if voice is enabled
		if (this.config.enableVoice && "speechSynthesis" in window) {
			// Clean response for speech (remove action blocks)
			const cleanResponse = payload.response.replace(/```action[\s\S]*?```/g, "").trim();
			if (cleanResponse) {
				const utterance = new SpeechSynthesisUtterance(cleanResponse);
				utterance.lang = this.config.voiceLanguage;
				speechSynthesis.speak(utterance);
			}
		}
	},

	/**
	 * Handle AI error
	 */
	handleAIError: function (payload) {
		this.isProcessing = false;
		this.addMessage("system", `Error: ${payload.error}`);
		this.updateDom();
	},

	/**
	 * Execute action from AI response
	 */
	executeAction: function (action) {
		Log.info(`[${this.name}] Executing action:`, action);

		switch (action.action) {
			case "show_module":
				this.sendNotification("MODULE_SHOW", { module: action.module });
				break;

			case "hide_module":
				this.sendNotification("MODULE_HIDE", { module: action.module });
				break;

			case "set_brightness":
				document.body.style.filter = `brightness(${action.value / 100})`;
				this.addMessage("system", `Brightness set to ${action.value}%`);
				break;

			case "refresh_module":
				this.sendNotification("MODULE_REFRESH", { module: action.module });
				break;

			case "notification":
				this.sendNotification("SHOW_ALERT", {
					title: action.title || "AI Assistant",
					message: action.message,
					timer: action.timer || 5000
				});
				break;

			default:
				// Send to node_helper for complex actions
				this.sendSocketNotification("AI_EXECUTE_ACTION", action);
		}
	}
});
