/**
 * Fitbit Provider for Fitness Module
 *
 * Fetches fitness data from Fitbit Web API
 * Requires OAuth 2.0 authentication with refresh token
 *
 * Setup:
 * 1. Create a Fitbit app at https://dev.fitbit.com/apps
 * 2. Set OAuth 2.0 Application Type to "Personal"
 * 3. Get client ID and secret
 * 4. Use authorization code flow to get refresh token
 */

const FitnessProvider = require("./fitnessprovider");

FitnessProvider.register("fitbit", {
	providerName: "Fitbit",

	defaults: {
		clientId: "",
		clientSecret: "",
		refreshToken: "",
		accessToken: "",
		tokenExpiry: 0,
		baseUrl: "https://api.fitbit.com"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.clientId || !this.config.clientSecret) {
			this.setError("Fitbit client ID and secret are required");
			return false;
		}
		if (!this.config.refreshToken) {
			this.setError("Fitbit refresh token is required");
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
	 * Authenticate/refresh OAuth token
	 * @returns {Promise<boolean>}
	 */
	async authenticate() {
		// Check if current token is still valid
		if (this.config.accessToken && Date.now() < this.config.tokenExpiry - 60000) {
			return true;
		}

		const tokenUrl = "https://api.fitbit.com/oauth2/token";
		const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");

		const response = await fetch(tokenUrl, {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: `grant_type=refresh_token&refresh_token=${this.config.refreshToken}`
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Fitbit auth failed: ${error.errors?.[0]?.message || response.statusText}`);
		}

		const data = await response.json();
		this.config.accessToken = data.access_token;
		this.config.refreshToken = data.refresh_token; // Fitbit rotates refresh tokens
		this.config.tokenExpiry = Date.now() + data.expires_in * 1000;

		return true;
	},

	/**
	 * Fetch fitness data from Fitbit
	 * @returns {Promise<object>}
	 */
	async fetchData() {
		this.loading = true;

		try {
			await this.authenticate();

			const today = new Date().toISOString().split("T")[0];
			const headers = {
				Authorization: `Bearer ${this.config.accessToken}`
			};

			// Fetch multiple endpoints in parallel
			const [activitiesRes, heartrateRes, sleepRes] = await Promise.all([
				fetch(`${this.config.baseUrl}/1/user/-/activities/date/${today}.json`, { headers }),
				fetch(`${this.config.baseUrl}/1/user/-/activities/heart/date/${today}/1d.json`, { headers }),
				fetch(`${this.config.baseUrl}/1.2/user/-/sleep/date/${today}.json`, { headers })
			]);

			const activities = await activitiesRes.json();
			const heartrate = await heartrateRes.json();
			const sleep = await sleepRes.json();

			// Fetch week data
			const weekData = await this.fetchWeekData(headers);

			// Fetch goals
			const goalsRes = await fetch(`${this.config.baseUrl}/1/user/-/activities/goals/daily.json`, { headers });
			const goalsData = await goalsRes.json();

			const fitnessData = {
				steps: activities.summary?.steps || 0,
				distance: (activities.summary?.distances?.find((d) => d.activity === "total")?.distance || 0) * 1000, // km to m
				calories: activities.summary?.activityCalories || 0,
				activeMinutes: (activities.summary?.veryActiveMinutes || 0) + (activities.summary?.fairlyActiveMinutes || 0),
				floors: activities.summary?.floors || 0,
				heartRate: this.parseHeartRate(heartrate),
				sleep: this.parseSleep(sleep),
				weekData: weekData,
				goals: {
					steps: goalsData.goals?.steps || 10000,
					distance: (goalsData.goals?.distance || 8) * 1000,
					calories: goalsData.goals?.caloriesOut || 500,
					activeMinutes: goalsData.goals?.activeMinutes || 30,
					floors: goalsData.goals?.floors || 10
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
	 * @param {object} data - Fitbit heart rate response
	 * @returns {object|null}
	 */
	parseHeartRate(data) {
		const heartRateData = data["activities-heart"]?.[0]?.value;
		if (!heartRateData) return null;

		return {
			current: heartRateData.heartRateZones?.find((z) => z.name === "Out of Range")?.min || null,
			resting: heartRateData.restingHeartRate || null,
			min: null,
			max: null
		};
	},

	/**
	 * Parse sleep data
	 * @param {object} data - Fitbit sleep response
	 * @returns {object|null}
	 */
	parseSleep(data) {
		const mainSleep = data.sleep?.find((s) => s.isMainSleep);
		if (!mainSleep) return null;

		const qualityScore = mainSleep.efficiency || 0;
		let quality = "Poor";
		if (qualityScore >= 90) quality = "Excellent";
		else if (qualityScore >= 80) quality = "Good";
		else if (qualityScore >= 70) quality = "Fair";

		return {
			duration: mainSleep.duration / 60000, // ms to minutes
			quality: quality,
			startTime: mainSleep.startTime,
			endTime: mainSleep.endTime
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
				const res = await fetch(`${this.config.baseUrl}/1/user/-/activities/date/${dateStr}.json`, { headers });
				const data = await res.json();

				weekData.push({
					steps: data.summary?.steps || 0,
					distance: (data.summary?.distances?.find((d) => d.activity === "total")?.distance || 0) * 1000,
					calories: data.summary?.activityCalories || 0,
					date: dateStr
				});
			} catch {
				weekData.push({ steps: 0, date: date.toISOString().split("T")[0] });
			}
		}

		return weekData;
	}
});

module.exports = FitnessProvider;
