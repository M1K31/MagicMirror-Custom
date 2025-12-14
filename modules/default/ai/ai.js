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
						this.toggleChat();
						const command = transcript.toLowerCase().replace(this.config.wakeWord.toLowerCase(), "").trim();
						if (command) {
							this.sendMessage(command);
						}
					}
				} else {
					this.sendMessage(transcript);
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
