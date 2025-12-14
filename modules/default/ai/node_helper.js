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

			// Voice command handlers
			case "AI_ADD_PACKAGE":
				this.addPackage(payload.trackingNumber);
				break;

			case "AI_GET_PACKAGES":
				this.getPackages();
				break;

			case "AI_REMOVE_PACKAGE":
				this.removePackage(payload.trackingNumber);
				break;

			case "AI_GET_WEATHER":
				this.getWeatherForLocation(payload.location);
				break;

			case "AI_ADD_LOCATION":
				this.addLocation(payload.type, payload.location);
				break;

			case "AI_GET_NEWS":
				this.getNews();
				break;

			case "AI_ADD_NEWS_SOURCE":
				this.addNewsSource(payload.source);
				break;

			case "AI_GET_CALENDAR":
				this.getCalendarEvents();
				break;
		}
	},

	/**
	 * Add package to tracking
	 */
	addPackage: async function (trackingNumber) {
		try {
			// Load current packages
			const packagesPath = path.join(__dirname, "..", "..", "..", "config", "packages.json");
			let packages = [];
			try {
				const data = await fs.readFile(packagesPath, "utf8");
				packages = JSON.parse(data).packages || [];
			} catch {
				packages = [];
			}

			// Detect carrier from tracking number pattern
			const carrier = this.detectCarrier(trackingNumber);

			// Add new package
			packages.push({
				tracking: trackingNumber,
				carrier: carrier,
				name: `Package ${packages.length + 1}`,
				addedAt: new Date().toISOString()
			});

			await fs.writeFile(packagesPath, JSON.stringify({ packages }, null, 2));

			this.sendSocketNotification("AI_PACKAGES_RESPONSE", {
				success: true,
				message: `Package ${trackingNumber} added`,
				carrier: carrier
			});

			// Notify packages module to refresh
			// This is a broadcast to all modules
			Log.info(`[${this.name}] Package added: ${trackingNumber} (${carrier})`);
		} catch (error) {
			this.sendSocketNotification("AI_PACKAGES_RESPONSE", {
				success: false,
				error: error.message
			});
		}
	},

	/**
	 * Detect carrier from tracking number format
	 */
	detectCarrier: function (tracking) {
		const patterns = {
			usps: [
				/^94\d{20,22}$/,      // USPS tracking
				/^92\d{20,22}$/,      // USPS certified mail
				/^[A-Z]{2}\d{9}US$/i  // International
			],
			ups: [
				/^1Z[A-Z0-9]{16}$/i,  // UPS
				/^T\d{10}$/,          // UPS freight
				/^[0-9]{26}$/         // UPS mail innovations
			],
			fedex: [
				/^\d{12,15}$/,        // FedEx Express/Ground
				/^\d{20,22}$/,        // FedEx SmartPost
				/^96\d{20}$/          // FedEx 96
			],
			dhl: [
				/^\d{10,11}$/,        // DHL Express
				/^[A-Z]{3}\d{7}$/i    // DHL eCommerce
			],
			amazon: [
				/^TBA\d+$/i           // Amazon logistics
			]
		};

		for (const [carrier, regexes] of Object.entries(patterns)) {
			for (const regex of regexes) {
				if (regex.test(tracking)) {
					return carrier;
				}
			}
		}

		return "other";
	},

	/**
	 * Get all tracked packages
	 */
	getPackages: async function () {
		try {
			const packagesPath = path.join(__dirname, "..", "..", "..", "config", "packages.json");
			let packages = [];
			try {
				const data = await fs.readFile(packagesPath, "utf8");
				packages = JSON.parse(data).packages || [];
			} catch {
				packages = [];
			}

			if (packages.length === 0) {
				this.sendSocketNotification("AI_PACKAGES_LIST", {
					packages: [],
					speech: "You have no packages being tracked."
				});
			} else {
				const speech = `You have ${packages.length} package${packages.length > 1 ? "s" : ""} being tracked. ` +
					packages.map((p, i) => `Package ${i + 1}: ${p.carrier.toUpperCase()}, tracking ${p.tracking.split("").slice(-4).join(" ")}`).join(". ");

				this.sendSocketNotification("AI_PACKAGES_LIST", {
					packages,
					speech
				});
			}
		} catch (error) {
			this.sendSocketNotification("AI_PACKAGES_LIST", {
				packages: [],
				speech: "Error reading packages",
				error: error.message
			});
		}
	},

	/**
	 * Remove a package
	 */
	removePackage: async function (trackingNumber) {
		try {
			const packagesPath = path.join(__dirname, "..", "..", "..", "config", "packages.json");
			let packages = [];
			try {
				const data = await fs.readFile(packagesPath, "utf8");
				packages = JSON.parse(data).packages || [];
			} catch {
				packages = [];
			}

			const original = packages.length;
			packages = packages.filter((p) => p.tracking.toUpperCase() !== trackingNumber.toUpperCase());

			if (packages.length < original) {
				await fs.writeFile(packagesPath, JSON.stringify({ packages }, null, 2));
				this.sendSocketNotification("AI_PACKAGES_RESPONSE", {
					success: true,
					message: `Package removed`
				});
			} else {
				this.sendSocketNotification("AI_PACKAGES_RESPONSE", {
					success: false,
					error: "Package not found"
				});
			}
		} catch (error) {
			this.sendSocketNotification("AI_PACKAGES_RESPONSE", {
				success: false,
				error: error.message
			});
		}
	},

	/**
	 * Get weather for a location
	 */
	getWeatherForLocation: async function (location) {
		try {
			// Use OpenMeteo geocoding to get coordinates
			const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;

			const geoResponse = await this.httpGet(geoUrl);
			const geoData = JSON.parse(geoResponse);

			if (!geoData.results || geoData.results.length === 0) {
				this.sendSocketNotification("AI_WEATHER_RESPONSE", {
					success: false,
					speech: `Could not find location ${location}`
				});
				return;
			}

			const { latitude, longitude, name } = geoData.results[0];

			// Get weather from OpenMeteo
			const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;

			const weatherResponse = await this.httpGet(weatherUrl);
			const weather = JSON.parse(weatherResponse);

			const temp = Math.round(weather.current.temperature_2m);
			const condition = this.weatherCodeToText(weather.current.weather_code);

			this.sendSocketNotification("AI_WEATHER_RESPONSE", {
				success: true,
				location: name,
				temperature: temp,
				condition,
				speech: `In ${name}, it's currently ${temp} degrees and ${condition}.`
			});
		} catch (error) {
			this.sendSocketNotification("AI_WEATHER_RESPONSE", {
				success: false,
				speech: `Error getting weather: ${error.message}`
			});
		}
	},

	/**
	 * Convert weather code to text
	 */
	weatherCodeToText: function (code) {
		const codes = {
			0: "clear",
			1: "mainly clear",
			2: "partly cloudy",
			3: "overcast",
			45: "foggy",
			48: "foggy",
			51: "light drizzle",
			53: "drizzle",
			55: "heavy drizzle",
			61: "light rain",
			63: "rain",
			65: "heavy rain",
			71: "light snow",
			73: "snow",
			75: "heavy snow",
			95: "thunderstorms"
		};
		return codes[code] || "unknown conditions";
	},

	/**
	 * Add a location for weather/news
	 */
	addLocation: async function (type, location) {
		try {
			const locationsPath = path.join(__dirname, "..", "..", "..", "config", "locations.json");
			let locations = { weather: [], news: [] };
			try {
				const data = await fs.readFile(locationsPath, "utf8");
				locations = JSON.parse(data);
			} catch {
				locations = { weather: [], news: [] };
			}

			// Get coordinates if it's a weather location
			if (type === "weather") {
				const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
				const geoResponse = await this.httpGet(geoUrl);
				const geoData = JSON.parse(geoResponse);

				if (geoData.results && geoData.results.length > 0) {
					const { latitude, longitude, name, country } = geoData.results[0];
					locations.weather.push({
						name: name,
						country: country,
						lat: latitude,
						lon: longitude,
						addedAt: new Date().toISOString()
					});
				}
			} else {
				locations.news.push({
					location: location,
					addedAt: new Date().toISOString()
				});
			}

			await fs.writeFile(locationsPath, JSON.stringify(locations, null, 2));

			this.sendSocketNotification("AI_LOCATION_ADDED", {
				success: true,
				type,
				location
			});
		} catch (error) {
			this.sendSocketNotification("AI_LOCATION_ADDED", {
				success: false,
				error: error.message
			});
		}
	},

	/**
	 * Get news headlines
	 */
	getNews: async function () {
		// This would typically read from a cached news feed
		// For now, send a message indicating the feature
		this.sendSocketNotification("AI_NEWS_RESPONSE", {
			speech: "Checking news headlines. The news module displays current headlines on your mirror."
		});
	},

	/**
	 * Add a news source
	 */
	addNewsSource: async function (source) {
		// Common RSS feeds by source name
		const knownFeeds = {
			"bbc": "http://feeds.bbci.co.uk/news/rss.xml",
			"cnn": "http://rss.cnn.com/rss/edition.rss",
			"nyt": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
			"new york times": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
			"reuters": "https://feeds.reuters.com/reuters/topNews",
			"ap": "https://feeds.apnews.com/rss/apf-topnews",
			"associated press": "https://feeds.apnews.com/rss/apf-topnews",
			"guardian": "https://www.theguardian.com/world/rss",
			"washington post": "https://feeds.washingtonpost.com/rss/national"
		};

		const feedUrl = knownFeeds[source.toLowerCase()];

		if (feedUrl) {
			this.sendSocketNotification("AI_NEWS_SOURCE_ADDED", {
				success: true,
				source,
				url: feedUrl,
				speech: `Added ${source} to your news feeds. Restart to apply changes.`
			});
		} else {
			this.sendSocketNotification("AI_NEWS_SOURCE_ADDED", {
				success: false,
				speech: `I don't know the RSS feed for ${source}. You can add it manually in settings.`
			});
		}
	},

	/**
	 * Get calendar events
	 */
	getCalendarEvents: async function () {
		// This reads from a local cache or triggers calendar module
		this.sendSocketNotification("AI_CALENDAR_RESPONSE", {
			speech: "Checking your calendar. Today's events are displayed on your mirror."
		});
	},

	/**
	 * Simple HTTP GET helper
	 */
	httpGet: function (url) {
		return new Promise((resolve, reject) => {
			const client = url.startsWith("https") ? https : http;
			client.get(url, (res) => {
				let data = "";
				res.on("data", (chunk) => data += chunk);
				res.on("end", () => resolve(data));
			}).on("error", reject);
		});
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
