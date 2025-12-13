/**
 * Shared Utilities for MagicMirror Modules
 *
 * Common helper functions for time formatting, data manipulation,
 * and other utilities used across multiple modules.
 */

/* global moment */

const SharedUtils = {
	/**
	 * Format duration in seconds to human-readable string
	 * @param {number} seconds - Duration in seconds
	 * @param {object} options - Formatting options
	 * @returns {string} Formatted duration
	 */
	formatDuration(seconds, options = {}) {
		const { showSeconds = true, showHours = true, padZeros = true, compact = false } = options;

		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);

		const pad = (n) => (padZeros ? String(n).padStart(2, "0") : String(n));

		if (compact) {
			if (hours > 0) {
				return `${hours}h ${minutes}m`;
			}
			if (minutes > 0) {
				return showSeconds ? `${minutes}m ${secs}s` : `${minutes}m`;
			}
			return `${secs}s`;
		}

		const parts = [];

		if (showHours && hours > 0) {
			parts.push(pad(hours));
		}

		parts.push(pad(minutes));

		if (showSeconds) {
			parts.push(pad(secs));
		}

		return parts.join(":");
	},

	/**
	 * Format time remaining until a date
	 * @param {Date|string|number} targetDate - Target date
	 * @param {object} options - Formatting options
	 * @returns {object} Object with days, hours, minutes, seconds, and formatted string
	 */
	getTimeRemaining(targetDate, options = {}) {
		const { includeSeconds = false, format = "full" } = options;

		const target = targetDate instanceof Date ? targetDate : new Date(targetDate);
		const now = new Date();
		const diff = target - now;

		if (diff <= 0) {
			return {
				total: 0,
				days: 0,
				hours: 0,
				minutes: 0,
				seconds: 0,
				isPast: true,
				formatted: "Past"
			};
		}

		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((diff % (1000 * 60)) / 1000);

		let formatted;
		switch (format) {
			case "days":
				formatted = days === 1 ? "1 day" : `${days} days`;
				break;
			case "compact":
				if (days > 0) {
					formatted = `${days}d ${hours}h`;
				} else if (hours > 0) {
					formatted = `${hours}h ${minutes}m`;
				} else {
					formatted = includeSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
				}
				break;
			case "full":
			default:
				const parts = [];
				if (days > 0) parts.push(days === 1 ? "1 day" : `${days} days`);
				if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
				if (minutes > 0 && days === 0) parts.push(minutes === 1 ? "1 minute" : `${minutes} minutes`);
				if (includeSeconds && seconds > 0 && days === 0 && hours === 0) {
					parts.push(seconds === 1 ? "1 second" : `${seconds} seconds`);
				}
				formatted = parts.join(", ") || "Less than a minute";
		}

		return {
			total: diff,
			days,
			hours,
			minutes,
			seconds,
			isPast: false,
			formatted
		};
	},

	/**
	 * Format a date relative to now (e.g., "in 2 hours", "yesterday")
	 * @param {Date|string|number} date - The date to format
	 * @param {object} options - Formatting options
	 * @returns {string} Relative time string
	 */
	formatRelativeTime(date, options = {}) {
		const { useShort = false } = options;

		if (typeof moment !== "undefined") {
			const m = moment(date);
			return useShort ? m.fromNow(true) : m.fromNow();
		}

		// Fallback without moment.js
		const target = date instanceof Date ? date : new Date(date);
		const now = new Date();
		const diff = target - now;
		const absDiff = Math.abs(diff);

		const minutes = Math.floor(absDiff / (1000 * 60));
		const hours = Math.floor(absDiff / (1000 * 60 * 60));
		const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

		const suffix = diff < 0 ? " ago" : "";
		const prefix = diff >= 0 ? "in " : "";

		if (minutes < 1) return "just now";
		if (minutes < 60) return useShort ? `${minutes}m${suffix}` : `${prefix}${minutes} minute${minutes === 1 ? "" : "s"}${suffix}`;
		if (hours < 24) return useShort ? `${hours}h${suffix}` : `${prefix}${hours} hour${hours === 1 ? "" : "s"}${suffix}`;
		return useShort ? `${days}d${suffix}` : `${prefix}${days} day${days === 1 ? "" : "s"}${suffix}`;
	},

	/**
	 * Truncate text with ellipsis
	 * @param {string} text - Text to truncate
	 * @param {number} maxLength - Maximum length
	 * @param {string} ellipsis - Ellipsis character(s)
	 * @returns {string} Truncated text
	 */
	truncate(text, maxLength = 50, ellipsis = "...") {
		if (!text || text.length <= maxLength) {
			return text;
		}
		return text.slice(0, maxLength - ellipsis.length).trim() + ellipsis;
	},

	/**
	 * Capitalize first letter of each word
	 * @param {string} text - Text to capitalize
	 * @returns {string} Capitalized text
	 */
	titleCase(text) {
		if (!text) return text;
		return text.replace(/\b\w/g, (char) => char.toUpperCase());
	},

	/**
	 * Deep merge objects
	 * @param {object} target - Target object
	 * @param {...object} sources - Source objects
	 * @returns {object} Merged object
	 */
	deepMerge(target, ...sources) {
		if (!sources.length) return target;

		const source = sources.shift();

		if (this.isObject(target) && this.isObject(source)) {
			for (const key in source) {
				if (this.isObject(source[key])) {
					if (!target[key]) Object.assign(target, { [key]: {} });
					this.deepMerge(target[key], source[key]);
				} else {
					Object.assign(target, { [key]: source[key] });
				}
			}
		}

		return this.deepMerge(target, ...sources);
	},

	/**
	 * Check if value is a plain object
	 * @param {*} item - Item to check
	 * @returns {boolean}
	 */
	isObject(item) {
		return item && typeof item === "object" && !Array.isArray(item);
	},

	/**
	 * Debounce a function
	 * @param {function} func - Function to debounce
	 * @param {number} wait - Wait time in milliseconds
	 * @returns {function} Debounced function
	 */
	debounce(func, wait = 300) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	},

	/**
	 * Throttle a function
	 * @param {function} func - Function to throttle
	 * @param {number} limit - Time limit in milliseconds
	 * @returns {function} Throttled function
	 */
	throttle(func, limit = 300) {
		let inThrottle;
		return function executedFunction(...args) {
			if (!inThrottle) {
				func(...args);
				inThrottle = true;
				setTimeout(() => (inThrottle = false), limit);
			}
		};
	},

	/**
	 * Generate a unique ID
	 * @param {string} prefix - Optional prefix
	 * @returns {string} Unique ID
	 */
	uniqueId(prefix = "") {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2, 9);
		return `${prefix}${timestamp}${random}`;
	},

	/**
	 * Parse a time string to seconds
	 * Supports formats: "1h30m", "90m", "1:30:00", "5400"
	 * @param {string|number} time - Time string or seconds
	 * @returns {number} Seconds
	 */
	parseTimeToSeconds(time) {
		if (typeof time === "number") {
			return time;
		}

		const str = String(time).trim().toLowerCase();

		// Format: "1h30m" or "30m" or "1h"
		const hmMatch = str.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
		if (hmMatch) {
			const hours = parseInt(hmMatch[1] || 0, 10);
			const minutes = parseInt(hmMatch[2] || 0, 10);
			const seconds = parseInt(hmMatch[3] || 0, 10);
			return hours * 3600 + minutes * 60 + seconds;
		}

		// Format: "1:30:00" or "1:30" or "90"
		const parts = str.split(":").map((p) => parseInt(p, 10));
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		if (parts.length === 1 && !isNaN(parts[0])) {
			return parts[0];
		}

		return 0;
	},

	/**
	 * Clamp a number between min and max
	 * @param {number} value - Value to clamp
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @returns {number} Clamped value
	 */
	clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	},

	/**
	 * Calculate percentage
	 * @param {number} value - Current value
	 * @param {number} total - Total value
	 * @param {number} decimals - Decimal places
	 * @returns {number} Percentage
	 */
	percentage(value, total, decimals = 0) {
		if (total === 0) return 0;
		const pct = (value / total) * 100;
		return decimals === 0 ? Math.round(pct) : parseFloat(pct.toFixed(decimals));
	},

	/**
	 * Format a number with thousands separators
	 * @param {number} num - Number to format
	 * @param {string} locale - Locale for formatting
	 * @returns {string} Formatted number
	 */
	formatNumber(num, locale = "en-US") {
		return new Intl.NumberFormat(locale).format(num);
	},

	/**
	 * Check if a date is today
	 * @param {Date|string|number} date - Date to check
	 * @returns {boolean}
	 */
	isToday(date) {
		const d = date instanceof Date ? date : new Date(date);
		const today = new Date();
		return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
	},

	/**
	 * Check if a date is tomorrow
	 * @param {Date|string|number} date - Date to check
	 * @returns {boolean}
	 */
	isTomorrow(date) {
		const d = date instanceof Date ? date : new Date(date);
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		return d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
	},

	/**
	 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
	 * @param {number} n - Number
	 * @returns {string} Number with ordinal suffix
	 */
	ordinal(n) {
		const s = ["th", "st", "nd", "rd"];
		const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	},

	/**
	 * Sleep for a specified duration
	 * @param {number} ms - Milliseconds to sleep
	 * @returns {Promise}
	 */
	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	},

	/**
	 * Retry a function with exponential backoff
	 * @param {function} fn - Function to retry (should return a Promise)
	 * @param {object} options - Retry options
	 * @returns {Promise}
	 */
	async retry(fn, options = {}) {
		const { maxAttempts = 3, baseDelay = 1000, maxDelay = 30000 } = options;

		let lastError;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;

				if (attempt === maxAttempts) {
					throw lastError;
				}

				const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
				await this.sleep(delay);
			}
		}

		throw lastError;
	}
};

// Export for use in modules
if (typeof module !== "undefined") {
	module.exports = SharedUtils;
}

// Also make available globally for browser context
if (typeof window !== "undefined") {
	window.SharedUtils = SharedUtils;
}
