/**
 * AI Assistant Module - Node Helper
 *
 * Copyright (c) 2025 Mikel Smart
 * This file is part of MagicMirror-Custom.
 *
 * Handles backend operations for the AI module:
 * - API calls to OpenAI, Anthropic, and local LLMs
 * - API key management
 * - Action execution
 */

const NodeHelper = require("node_helper");
const https = require("https");
const http = require("http");
const fs = require("fs").promises;
const path = require("path");
const Log = require("logger");

module.exports = NodeHelper.create({
	/**
	 * Start the node helper
	 */
	start: function () {
		Log.log(`[${this.name}] Node helper starting...`);

		this.secretsPath = path.join(__dirname, "..", "..", "..", "config", "secrets.json");
		this.secrets = {};

		// Load secrets
		this.loadSecrets();
	},

	/**
	 * Load secrets from file
	 */
	loadSecrets: async function () {
		try {
			const data = await fs.readFile(this.secretsPath, "utf8");
			this.secrets = JSON.parse(data);
			Log.info(`[${this.name}] Secrets loaded`);
		} catch (error) {
			Log.warn(`[${this.name}] No secrets file found, API keys must be configured`);
			this.secrets = {};
		}
	},

	/**
	 * Save secrets to file
	 */
	saveSecrets: async function () {
		try {
			await fs.writeFile(this.secretsPath, JSON.stringify(this.secrets, null, 2));
			return true;
		} catch (error) {
			Log.error(`[${this.name}] Failed to save secrets:`, error);
			return false;
		}
	},

	/**
	 * Handle socket notifications from frontend
	 */
	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "AI_CHECK_CONFIG":
				this.checkConfig(payload.provider);
				break;

			case "AI_SEND_MESSAGE":
				this.sendToAI(payload);
				break;

			case "AI_EXECUTE_ACTION":
				this.executeAction(payload);
				break;

			case "AI_SAVE_API_KEY":
				this.saveApiKey(payload.provider, payload.apiKey);
				break;
		}
	},

	/**
	 * Check if provider is configured
	 */
	checkConfig: function (provider) {
		const keyMap = {
			openai: "openai_api_key",
			anthropic: "anthropic_api_key",
			ollama: null, // No API key needed for local
			local: null
		};

		const keyName = keyMap[provider];
		const configured = keyName === null || (this.secrets[keyName] && this.secrets[keyName].length > 0);

		this.sendSocketNotification("AI_CONFIG_STATUS", {
			provider,
			configured
		});
	},

	/**
	 * Save API key
	 */
	saveApiKey: async function (provider, apiKey) {
		const keyMap = {
			openai: "openai_api_key",
			anthropic: "anthropic_api_key"
		};

		const keyName = keyMap[provider];
		if (keyName) {
			this.secrets[keyName] = apiKey;
			await this.saveSecrets();
			this.sendSocketNotification("AI_CONFIG_STATUS", {
				provider,
				configured: true
			});
		}
	},

	/**
	 * Send message to AI provider
	 */
	sendToAI: async function (payload) {
		const { provider, providerConfig, systemPrompt, message, history, maxTokens, temperature } = payload;

		try {
			let response;

			switch (provider) {
				case "openai":
					response = await this.callOpenAI(providerConfig, systemPrompt, message, history, maxTokens, temperature);
					break;

				case "anthropic":
					response = await this.callAnthropic(providerConfig, systemPrompt, message, history, maxTokens, temperature);
					break;

				case "ollama":
					response = await this.callOllama(providerConfig, systemPrompt, message, history);
					break;

				case "local":
					response = await this.callLocalLLM(providerConfig, systemPrompt, message, history, maxTokens, temperature);
					break;

				default:
					throw new Error(`Unknown AI provider: ${provider}`);
			}

			this.sendSocketNotification("AI_RESPONSE", {
				response,
				provider
			});
		} catch (error) {
			Log.error(`[${this.name}] AI request failed:`, error.message);
			this.sendSocketNotification("AI_ERROR", {
				error: error.message,
				provider
			});
		}
	},

	/**
	 * Call OpenAI API
	 */
	callOpenAI: function (config, systemPrompt, message, history, maxTokens, temperature) {
		return new Promise((resolve, reject) => {
			const apiKey = this.secrets.openai_api_key;
			if (!apiKey) {
				return reject(new Error("OpenAI API key not configured"));
			}

			const messages = [
				{ role: "system", content: systemPrompt },
				...history,
				{ role: "user", content: message }
			];

			const requestBody = JSON.stringify({
				model: config.model || "gpt-4",
				messages,
				max_tokens: maxTokens || 500,
				temperature: temperature || 0.7
			});

			const url = new URL(config.apiEndpoint || "https://api.openai.com/v1/chat/completions");

			const options = {
				hostname: url.hostname,
				port: url.port || 443,
				path: url.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
					"Content-Length": Buffer.byteLength(requestBody)
				}
			};

			const req = https.request(options, (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					try {
						const parsed = JSON.parse(data);
						if (parsed.error) {
							reject(new Error(parsed.error.message));
						} else if (parsed.choices && parsed.choices[0]) {
							resolve(parsed.choices[0].message.content);
						} else {
							reject(new Error("Invalid response from OpenAI"));
						}
					} catch (e) {
						reject(new Error(`Failed to parse OpenAI response: ${e.message}`));
					}
				});
			});

			req.on("error", (e) => {
				reject(new Error(`OpenAI request failed: ${e.message}`));
			});

			req.setTimeout(30000, () => {
				req.destroy();
				reject(new Error("OpenAI request timed out"));
			});

			req.write(requestBody);
			req.end();
		});
	},

	/**
	 * Call Anthropic Claude API
	 */
	callAnthropic: function (config, systemPrompt, message, history, maxTokens, temperature) {
		return new Promise((resolve, reject) => {
			const apiKey = this.secrets.anthropic_api_key;
			if (!apiKey) {
				return reject(new Error("Anthropic API key not configured"));
			}

			// Convert history to Anthropic format
			const messages = [
				...history.map((msg) => ({
					role: msg.role === "assistant" ? "assistant" : "user",
					content: msg.content
				})),
				{ role: "user", content: message }
			];

			const requestBody = JSON.stringify({
				model: config.model || "claude-3-5-sonnet-20241022",
				max_tokens: maxTokens || 500,
				system: systemPrompt,
				messages
			});

			const url = new URL(config.apiEndpoint || "https://api.anthropic.com/v1/messages");

			const options = {
				hostname: url.hostname,
				port: url.port || 443,
				path: url.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
					"Content-Length": Buffer.byteLength(requestBody)
				}
			};

			const req = https.request(options, (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					try {
						const parsed = JSON.parse(data);
						if (parsed.error) {
							reject(new Error(parsed.error.message));
						} else if (parsed.content && parsed.content[0]) {
							resolve(parsed.content[0].text);
						} else {
							reject(new Error("Invalid response from Anthropic"));
						}
					} catch (e) {
						reject(new Error(`Failed to parse Anthropic response: ${e.message}`));
					}
				});
			});

			req.on("error", (e) => {
				reject(new Error(`Anthropic request failed: ${e.message}`));
			});

			req.setTimeout(30000, () => {
				req.destroy();
				reject(new Error("Anthropic request timed out"));
			});

			req.write(requestBody);
			req.end();
		});
	},

	/**
	 * Call Ollama (local LLM)
	 */
	callOllama: function (config, systemPrompt, message, history) {
		return new Promise((resolve, reject) => {
			const messages = [
				{ role: "system", content: systemPrompt },
				...history,
				{ role: "user", content: message }
			];

			const requestBody = JSON.stringify({
				model: config.model || "llama3.2",
				messages,
				stream: false
			});

			const url = new URL(config.apiEndpoint || "http://localhost:11434/api/chat");
			const isHttps = url.protocol === "https:";

			const options = {
				hostname: url.hostname,
				port: url.port || (isHttps ? 443 : 11434),
				path: url.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(requestBody)
				}
			};

			const protocol = isHttps ? https : http;
			const req = protocol.request(options, (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					try {
						const parsed = JSON.parse(data);
						if (parsed.error) {
							reject(new Error(parsed.error));
						} else if (parsed.message && parsed.message.content) {
							resolve(parsed.message.content);
						} else {
							reject(new Error("Invalid response from Ollama"));
						}
					} catch (e) {
						reject(new Error(`Failed to parse Ollama response: ${e.message}`));
					}
				});
			});

			req.on("error", (e) => {
				reject(new Error(`Ollama request failed: ${e.message}. Is Ollama running?`));
			});

			req.setTimeout(60000, () => {
				req.destroy();
				reject(new Error("Ollama request timed out"));
			});

			req.write(requestBody);
			req.end();
		});
	},

	/**
	 * Call local LLM with OpenAI-compatible API
	 */
	callLocalLLM: function (config, systemPrompt, message, history, maxTokens, temperature) {
		return new Promise((resolve, reject) => {
			const messages = [
				{ role: "system", content: systemPrompt },
				...history,
				{ role: "user", content: message }
			];

			const requestBody = JSON.stringify({
				model: config.model || "default",
				messages,
				max_tokens: maxTokens || 500,
				temperature: temperature || 0.7
			});

			const url = new URL(config.apiEndpoint || "http://localhost:8000/v1/chat/completions");
			const isHttps = url.protocol === "https:";

			const options = {
				hostname: url.hostname,
				port: url.port || (isHttps ? 443 : 8000),
				path: url.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(requestBody)
				}
			};

			// Add API key if configured
			if (this.secrets.local_llm_api_key) {
				options.headers["Authorization"] = `Bearer ${this.secrets.local_llm_api_key}`;
			}

			const protocol = isHttps ? https : http;
			const req = protocol.request(options, (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					try {
						const parsed = JSON.parse(data);
						if (parsed.error) {
							reject(new Error(parsed.error.message || parsed.error));
						} else if (parsed.choices && parsed.choices[0]) {
							resolve(parsed.choices[0].message.content);
						} else {
							reject(new Error("Invalid response from local LLM"));
						}
					} catch (e) {
						reject(new Error(`Failed to parse local LLM response: ${e.message}`));
					}
				});
			});

			req.on("error", (e) => {
				reject(new Error(`Local LLM request failed: ${e.message}. Is the server running?`));
			});

			req.setTimeout(60000, () => {
				req.destroy();
				reject(new Error("Local LLM request timed out"));
			});

			req.write(requestBody);
			req.end();
		});
	},

	/**
	 * Execute action from AI response
	 */
	executeAction: function (action) {
		Log.info(`[${this.name}] Executing action:`, action);

		let result = { success: true, message: "Action executed" };

		try {
			switch (action.action) {
				case "get_weather":
					// This would integrate with weather module
					result.message = "Weather data requested";
					break;

				case "get_calendar":
					// This would integrate with calendar module
					result.message = "Calendar data requested";
					break;

				case "send_notification":
					// Handle system notifications
					result.message = `Notification sent: ${action.message}`;
					break;

				default:
					result = { success: false, error: `Unknown action: ${action.action}` };
			}
		} catch (error) {
			result = { success: false, error: error.message };
		}

		this.sendSocketNotification("AI_ACTION_RESULT", result);
	}
});
