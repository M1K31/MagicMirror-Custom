/**
 * Strava Provider for Fitness Module
 *
 * Fetches activity data from Strava API
 * Best suited for runners, cyclists, and swimmers
 *
 * Setup:
 * 1. Create a Strava API application at https://www.strava.com/settings/api
 * 2. Get client ID and secret
 * 3. Use OAuth flow to get refresh token
 *    - Authorize URL: https://www.strava.com/oauth/authorize
 *    - Required scope: activity:read_all
 *
 * Credentials can be set via environment variables:
 * - STRAVA_CLIENT_ID
 * - STRAVA_CLIENT_SECRET
 * - STRAVA_REFRESH_TOKEN
 */

const FitnessProvider = require("./fitnessprovider");

FitnessProvider.register("strava", {
	providerName: "Strava",

	defaults: {
		// Support environment variables for credentials
		clientId: process.env.STRAVA_CLIENT_ID || "",
		clientSecret: process.env.STRAVA_CLIENT_SECRET || "",
		refreshToken: process.env.STRAVA_REFRESH_TOKEN || "",
		accessToken: "",
		tokenExpiry: 0,
		baseUrl: "https://www.strava.com/api/v3"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.clientId || !this.config.clientSecret) {
			this.setError("Strava client ID and secret are required. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET environment variables.");
			return false;
		}
		if (!this.config.refreshToken) {
			this.setError("Strava refresh token is required. Set STRAVA_REFRESH_TOKEN environment variable.");
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

		const tokenUrl = "https://www.strava.com/oauth/token";

		const response = await fetch(tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				refresh_token: this.config.refreshToken,
				grant_type: "refresh_token"
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Strava auth failed: ${error.message || response.statusText}`);
		}

		const data = await response.json();
		this.config.accessToken = data.access_token;
		this.config.refreshToken = data.refresh_token;
		this.config.tokenExpiry = data.expires_at * 1000;

		return true;
	},

	/**
	 * Fetch fitness data from Strava
	 * @returns {Promise<object>}
	 */
	async fetchData() {
		this.loading = true;

		try {
			await this.authenticate();

			const headers = {
				Authorization: `Bearer ${this.config.accessToken}`
			};

			// Get athlete stats
			const athleteRes = await fetch(`${this.config.baseUrl}/athlete`, { headers });
			const athlete = await athleteRes.json();

			const statsRes = await fetch(
				`${this.config.baseUrl}/athletes/${athlete.id}/stats`,
				{ headers }
			);
			const stats = await statsRes.json();

			// Get today's activities
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayEpoch = Math.floor(today.getTime() / 1000);

			const activitiesRes = await fetch(
				`${this.config.baseUrl}/athlete/activities?after=${todayEpoch}&per_page=100`,
				{ headers }
			);
			const activities = await activitiesRes.json();

			// Calculate today's totals
			const todayTotals = this.calculateDailyTotals(activities);

			// Get week data
			const weekData = await this.fetchWeekData(headers);

			const fitnessData = {
				steps: this.estimateSteps(todayTotals.distance, todayTotals.type),
				distance: todayTotals.distance,
				calories: todayTotals.calories,
				activeMinutes: todayTotals.movingTime,
				floors: 0, // Not tracked by Strava
				heartRate: todayTotals.heartRate,
				sleep: null, // Not tracked by Strava
				weekData: weekData,
				goals: {
					// Use recent averages as goals
					steps: 10000,
					distance: (stats.recent_run_totals?.distance || 8000) / 4, // Weekly avg / 7
					calories: 500,
					activeMinutes: 30,
					floors: 0
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
	 * Calculate daily totals from activities
	 * @param {Array} activities - Today's activities
	 * @returns {object}
	 */
	calculateDailyTotals(activities) {
		if (!activities || activities.length === 0) {
			return {
				distance: 0,
				calories: 0,
				movingTime: 0,
				heartRate: null,
				type: "walk"
			};
		}

		let totalDistance = 0;
		let totalCalories = 0;
		let totalMovingTime = 0;
		let heartRates = [];
		let primaryType = "walk";
		let maxDistance = 0;

		for (const activity of activities) {
			totalDistance += activity.distance || 0;
			totalCalories += activity.kilojoules ? activity.kilojoules / 4.184 : 0;
			totalMovingTime += (activity.moving_time || 0) / 60; // Convert to minutes

			if (activity.average_heartrate) {
				heartRates.push(activity.average_heartrate);
			}

			// Track primary activity type (by distance)
			if (activity.distance > maxDistance) {
				maxDistance = activity.distance;
				primaryType = activity.type?.toLowerCase() || "walk";
			}
		}

		return {
			distance: totalDistance,
			calories: Math.round(totalCalories),
			movingTime: Math.round(totalMovingTime),
			heartRate: heartRates.length > 0
				? {
					current: Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length),
					resting: null,
					min: Math.round(Math.min(...heartRates)),
					max: Math.round(Math.max(...heartRates))
				}
				: null,
			type: primaryType
		};
	},

	/**
	 * Estimate steps from distance and activity type
	 * @param {number} distance - Distance in meters
	 * @param {string} type - Activity type
	 * @returns {number}
	 */
	estimateSteps(distance, type) {
		// Average stride lengths by activity
		const strideLength = {
			run: 1.2, // meters
			walk: 0.75,
			hike: 0.7,
			default: 0.75
		};

		const stride = strideLength[type] || strideLength.default;
		return Math.round(distance / stride);
	},

	/**
	 * Fetch past 7 days of activity data
	 * @param {object} headers - Auth headers
	 * @returns {Promise<Array>}
	 */
	async fetchWeekData(headers) {
		const weekData = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Get the start of this week (Sunday)
		const startOfWeek = new Date(today);
		startOfWeek.setDate(today.getDate() - today.getDay());

		// Fetch all activities for the week
		const weekStart = Math.floor(startOfWeek.getTime() / 1000);
		const activitiesRes = await fetch(
			`${this.config.baseUrl}/athlete/activities?after=${weekStart}&per_page=100`,
			{ headers }
		);
		const activities = await activitiesRes.json();

		// Group by day
		for (let i = 0; i < 7; i++) {
			const date = new Date(startOfWeek);
			date.setDate(startOfWeek.getDate() + i);
			date.setHours(0, 0, 0, 0);

			const nextDate = new Date(date);
			nextDate.setDate(nextDate.getDate() + 1);

			const dayActivities = activities.filter((a) => {
				const activityDate = new Date(a.start_date_local);
				return activityDate >= date && activityDate < nextDate;
			});

			const dayTotals = this.calculateDailyTotals(dayActivities);

			weekData.push({
				steps: this.estimateSteps(dayTotals.distance, dayTotals.type),
				distance: dayTotals.distance,
				calories: dayTotals.calories,
				date: date.toISOString().split("T")[0]
			});
		}

		return weekData;
	}
});

module.exports = FitnessProvider;
