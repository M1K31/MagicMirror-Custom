/**
 * Garmin Connect Provider for Fitness Module
 *
 * Fetches fitness data from Garmin Connect
 * Uses unofficial API - may require periodic updates
 *
 * Note: Garmin doesn't have an official public API for consumer devices
 * This uses the Garmin Connect web API which requires login credentials
 *
 * SECURITY WARNING: This provider uses email/password authentication.
 * Store credentials in environment variables, NOT in config.js!
 *
 * Environment variables:
 * - GARMIN_EMAIL
 * - GARMIN_PASSWORD
 */

const FitnessProvider = require("./fitnessprovider");

FitnessProvider.register("garmin", {
	providerName: "Garmin",

	defaults: {
		// IMPORTANT: Use environment variables for credentials
		email: process.env.GARMIN_EMAIL || "",
		password: process.env.GARMIN_PASSWORD || "",
		session: null,
		baseUrl: "https://connect.garmin.com"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.email || !this.config.password) {
			this.setError("Garmin email and password are required. Set GARMIN_EMAIL and GARMIN_PASSWORD environment variables.");
			return false;
		}
		return true;
	},

	/**
	 * Start the provider
	 */
	async start() {
		if (!this.validateConfig()) return;

		try {
			await this.authenticate();
			await this.fetchData();
		} catch (error) {
			this.setError(error.message);
		}
	},

	/**
	 * Authenticate with Garmin Connect
	 * @returns {Promise<boolean>}
	 */
	async authenticate() {
		// Check if we have a valid session
		if (this.config.session && this.config.session.expires > Date.now()) {
			return true;
		}

		// Garmin uses a complex SSO flow
		// This is a simplified version - in production, you'd use a library like garmin-connect
		const ssoUrl = "https://sso.garmin.com/sso/signin";

		try {
			// Step 1: Get SSO ticket
			const ticketResponse = await fetch(ssoUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"User-Agent": "MagicMirror/2.0"
				},
				body: new URLSearchParams({
					username: this.config.email,
					password: this.config.password,
					embed: "false"
				})
			});

			if (!ticketResponse.ok) {
				throw new Error("Garmin authentication failed");
			}

			// Extract ticket from response
			const responseText = await ticketResponse.text();
			const ticketMatch = responseText.match(/ticket=([^"]+)/);

			if (!ticketMatch) {
				throw new Error("Failed to extract Garmin SSO ticket");
			}

			// Step 2: Exchange ticket for session
			const sessionResponse = await fetch(
				`${this.config.baseUrl}/modern/?ticket=${ticketMatch[1]}`,
				{
					headers: {
						"User-Agent": "MagicMirror/2.0"
					},
					redirect: "follow"
				}
			);

			if (!sessionResponse.ok) {
				throw new Error("Failed to establish Garmin session");
			}

			// Store session cookies
			const cookies = sessionResponse.headers.get("set-cookie");
			this.config.session = {
				cookies: cookies,
				expires: Date.now() + 3600000 // 1 hour
			};

			return true;
		} catch (error) {
			this.setError(`Garmin auth error: ${error.message}`);
			throw error;
		}
	},

	/**
	 * Fetch fitness data from Garmin Connect
	 * @returns {Promise<object>}
	 */
	async fetchData() {
		this.loading = true;

		try {
			await this.authenticate();

			const today = new Date().toISOString().split("T")[0];
			const headers = {
				Cookie: this.config.session?.cookies || "",
				"User-Agent": "MagicMirror/2.0"
			};

			// Fetch daily summary
			const summaryUrl = `${this.config.baseUrl}/modern/proxy/usersummary-service/usersummary/daily/${today}`;
			const summaryRes = await fetch(summaryUrl, { headers });

			if (!summaryRes.ok) {
				throw new Error("Failed to fetch Garmin daily summary");
			}

			const summary = await summaryRes.json();

			// Fetch sleep data
			const sleepUrl = `${this.config.baseUrl}/modern/proxy/wellness-service/wellness/dailySleep/${today}`;
			const sleepRes = await fetch(sleepUrl, { headers });
			const sleepData = sleepRes.ok ? await sleepRes.json() : null;

			// Fetch heart rate
			const hrUrl = `${this.config.baseUrl}/modern/proxy/wellness-service/wellness/dailyHeartRate/${today}`;
			const hrRes = await fetch(hrUrl, { headers });
			const hrData = hrRes.ok ? await hrRes.json() : null;

			// Fetch week data
			const weekData = await this.fetchWeekData(headers);

			const fitnessData = {
				steps: summary.totalSteps || 0,
				distance: (summary.totalDistanceMeters || 0),
				calories: summary.activeKilocalories || 0,
				activeMinutes: (summary.moderateIntensityMinutes || 0) + (summary.vigorousIntensityMinutes || 0),
				floors: summary.floorsAscended || 0,
				heartRate: this.parseHeartRate(hrData),
				sleep: this.parseSleep(sleepData),
				weekData: weekData,
				goals: {
					steps: summary.dailyStepGoal || 10000,
					distance: (summary.dailyDistanceGoalMeters || 8000),
					calories: summary.netCalorieGoal || 500,
					activeMinutes: summary.intensityMinutesGoal || 30,
					floors: summary.dailyFloorGoal || 10
				}
			};

			this.setData(fitnessData);
			return fitnessData;
		} catch (error) {
			this.setError(error.message);
			throw error;
		}
	},

	/**
	 * Parse heart rate data
	 * @param {object} data - Garmin heart rate response
	 * @returns {object|null}
	 */
	parseHeartRate(data) {
		if (!data) return null;

		return {
			current: data.lastSevenDaysAvgRestingHeartRate || null,
			resting: data.restingHeartRate || null,
			min: data.minHeartRate || null,
			max: data.maxHeartRate || null
		};
	},

	/**
	 * Parse sleep data
	 * @param {object} data - Garmin sleep response
	 * @returns {object|null}
	 */
	parseSleep(data) {
		if (!data || !data.sleepTimeSeconds) return null;

		const durationMins = data.sleepTimeSeconds / 60;
		const qualityScore = data.overallSleepScore || 0;

		let quality = "Poor";
		if (qualityScore >= 80) quality = "Excellent";
		else if (qualityScore >= 60) quality = "Good";
		else if (qualityScore >= 40) quality = "Fair";

		return {
			duration: durationMins,
			quality: quality,
			startTime: data.sleepStartTimestampLocal,
			endTime: data.sleepEndTimestampLocal
		};
	},

	/**
	 * Fetch past 7 days of activity data
	 * @param {object} headers - Auth headers
	 * @returns {Promise<Array>}
	 */
	async fetchWeekData(headers) {
		const weekData = [];
		const today = new Date();

		// Get the start of this week (Sunday)
		const startOfWeek = new Date(today);
		startOfWeek.setDate(today.getDate() - today.getDay());

		for (let i = 0; i < 7; i++) {
			const date = new Date(startOfWeek);
			date.setDate(startOfWeek.getDate() + i);

			if (date > today) {
				weekData.push({ steps: 0, date: date.toISOString().split("T")[0] });
				continue;
			}

			try {
				const dateStr = date.toISOString().split("T")[0];
				const url = `${this.config.baseUrl}/modern/proxy/usersummary-service/usersummary/daily/${dateStr}`;
				const res = await fetch(url, { headers });

				if (res.ok) {
					const data = await res.json();
					weekData.push({
						steps: data.totalSteps || 0,
						distance: data.totalDistanceMeters || 0,
						calories: data.activeKilocalories || 0,
						date: dateStr
					});
				} else {
					weekData.push({ steps: 0, date: dateStr });
				}
			} catch {
				weekData.push({ steps: 0, date: date.toISOString().split("T")[0] });
			}
		}

		return weekData;
	}
});

module.exports = FitnessProvider;
