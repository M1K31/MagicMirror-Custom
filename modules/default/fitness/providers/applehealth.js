/**
 * Apple Health Provider for Fitness Module
 *
 * Reads fitness data from Apple Health export files
 * Apple Health doesn't have a web API, so this reads from exported XML/JSON
 *
 * Setup:
 * 1. Open Health app on iPhone
 * 2. Tap profile picture > Export All Health Data
 * 3. Extract the export.zip and point dataPath to the folder
 * 4. Set up periodic exports (manual or via Shortcuts automation)
 */

const FitnessProvider = require("./fitnessprovider");
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

FitnessProvider.register("applehealth", {
	providerName: "Apple Health",

	defaults: {
		dataPath: "", // Path to extracted Health Data folder
		exportFile: "export.xml" // Main export file name
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.dataPath) {
			this.setError("Apple Health data path is required");
			return false;
		}

		const exportPath = path.join(this.config.dataPath, this.config.exportFile);
		if (!fs.existsSync(exportPath)) {
			this.setError(`Health export not found at: ${exportPath}`);
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
			await this.fetchData();
		} catch (error) {
			this.setError(error.message);
		}
	},

	/**
	 * Fetch fitness data from Apple Health export
	 * @returns {Promise<object>}
	 */
	async fetchData() {
		this.loading = true;

		try {
			const exportPath = path.join(this.config.dataPath, this.config.exportFile);
			const xmlData = fs.readFileSync(exportPath, "utf-8");

			const parser = new XMLParser({
				ignoreAttributes: false,
				attributeNamePrefix: ""
			});

			const parsed = parser.parse(xmlData);
			const records = parsed.HealthData?.Record || [];

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// Filter records for today
			const todayRecords = records.filter((r) => {
				const recordDate = new Date(r.startDate);
				recordDate.setHours(0, 0, 0, 0);
				return recordDate.getTime() === today.getTime();
			});

			// Calculate daily totals
			const fitnessData = {
				steps: this.sumRecords(todayRecords, "HKQuantityTypeIdentifierStepCount"),
				distance: this.sumRecords(todayRecords, "HKQuantityTypeIdentifierDistanceWalkingRunning") * 1000, // km to m
				calories: this.sumRecords(todayRecords, "HKQuantityTypeIdentifierActiveEnergyBurned"),
				activeMinutes: this.sumRecords(todayRecords, "HKQuantityTypeIdentifierAppleExerciseTime"),
				floors: this.sumRecords(todayRecords, "HKQuantityTypeIdentifierFlightsClimbed"),
				heartRate: this.getLatestHeartRate(todayRecords),
				sleep: this.getSleepData(records, today),
				weekData: this.getWeekData(records),
				goals: {
					// Apple Health doesn't export goals, use defaults
					steps: 10000,
					distance: 8000,
					calories: 500,
					activeMinutes: 30,
					floors: 10
				}
			};

			this.setData(fitnessData);
			return fitnessData;
		} catch (error) {
			this.setError(`Failed to parse Health data: ${error.message}`);
			throw error;
		}
	},

	/**
	 * Sum values for a specific record type
	 * @param {Array} records - Health records
	 * @param {string} type - Record type identifier
	 * @returns {number}
	 */
	sumRecords(records, type) {
		return records
			.filter((r) => r.type === type)
			.reduce((sum, r) => sum + parseFloat(r.value || 0), 0);
	},

	/**
	 * Get latest heart rate reading
	 * @param {Array} records - Health records
	 * @returns {object|null}
	 */
	getLatestHeartRate(records) {
		const hrRecords = records
			.filter((r) => r.type === "HKQuantityTypeIdentifierHeartRate")
			.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

		if (hrRecords.length === 0) return null;

		const restingRecords = records.filter(
			(r) => r.type === "HKQuantityTypeIdentifierRestingHeartRate"
		);

		return {
			current: Math.round(parseFloat(hrRecords[0].value)),
			resting: restingRecords.length > 0
				? Math.round(parseFloat(restingRecords[0].value))
				: null,
			min: Math.round(Math.min(...hrRecords.map((r) => parseFloat(r.value)))),
			max: Math.round(Math.max(...hrRecords.map((r) => parseFloat(r.value))))
		};
	},

	/**
	 * Get sleep data for the most recent night
	 * @param {Array} records - Health records
	 * @param {Date} today - Today's date
	 * @returns {object|null}
	 */
	getSleepData(records, today) {
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const sleepRecords = records.filter((r) => {
			if (r.type !== "HKCategoryTypeIdentifierSleepAnalysis") return false;
			const recordDate = new Date(r.startDate);
			return recordDate >= yesterday && recordDate < today;
		});

		if (sleepRecords.length === 0) return null;

		// Calculate total sleep duration
		let totalMinutes = 0;
		let startTime = null;
		let endTime = null;

		for (const record of sleepRecords) {
			const start = new Date(record.startDate);
			const end = new Date(record.endDate);
			totalMinutes += (end - start) / 60000;

			if (!startTime || start < startTime) startTime = start;
			if (!endTime || end > endTime) endTime = end;
		}

		// Estimate quality based on duration
		let quality = "Poor";
		if (totalMinutes >= 420) quality = "Excellent"; // 7+ hours
		else if (totalMinutes >= 360) quality = "Good"; // 6+ hours
		else if (totalMinutes >= 300) quality = "Fair"; // 5+ hours

		return {
			duration: Math.round(totalMinutes),
			quality: quality,
			startTime: startTime?.toISOString(),
			endTime: endTime?.toISOString()
		};
	},

	/**
	 * Get week data for the activity chart
	 * @param {Array} records - Health records
	 * @returns {Array}
	 */
	getWeekData(records) {
		const weekData = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Get the start of this week (Sunday)
		const startOfWeek = new Date(today);
		startOfWeek.setDate(today.getDate() - today.getDay());

		for (let i = 0; i < 7; i++) {
			const date = new Date(startOfWeek);
			date.setDate(startOfWeek.getDate() + i);
			date.setHours(0, 0, 0, 0);

			const nextDate = new Date(date);
			nextDate.setDate(nextDate.getDate() + 1);

			const dayRecords = records.filter((r) => {
				const recordDate = new Date(r.startDate);
				recordDate.setHours(0, 0, 0, 0);
				return recordDate.getTime() === date.getTime();
			});

			weekData.push({
				steps: this.sumRecords(dayRecords, "HKQuantityTypeIdentifierStepCount"),
				distance: this.sumRecords(dayRecords, "HKQuantityTypeIdentifierDistanceWalkingRunning") * 1000,
				calories: this.sumRecords(dayRecords, "HKQuantityTypeIdentifierActiveEnergyBurned"),
				date: date.toISOString().split("T")[0]
			});
		}

		return weekData;
	}
});

module.exports = FitnessProvider;
