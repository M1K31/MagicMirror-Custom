/**
 * Rate Limiter Module
 *
 * Provides rate limiting for API requests to prevent
 * quota exhaustion and potential account blocks.
 *
 * @module shared/rate-limiter
 */

/**
 * Simple rate limiter using sliding window algorithm
 */
class RateLimiter {
	/**
	 * Create a RateLimiter
	 * @param {number} maxRequests - Maximum requests allowed in window
	 * @param {number} windowMs - Time window in milliseconds
	 * @param {object} [options] - Additional options
	 * @param {string} [options.name] - Name for logging
	 * @param {boolean} [options.burst] - Allow burst then throttle
	 */
	constructor(maxRequests, windowMs, options = {}) {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
		this.name = options.name || "RateLimiter";
		this.burst = options.burst || false;

		this.requests = [];
		this.queue = [];
		this.processing = false;
	}

	/**
	 * Clean up old requests outside the window
	 * @private
	 */
	_cleanup() {
		const now = Date.now();
		this.requests = this.requests.filter((t) => t > now - this.windowMs);
	}

	/**
	 * Check if a request can be made immediately
	 * @returns {boolean} True if request is allowed
	 */
	canMakeRequest() {
		this._cleanup();
		return this.requests.length < this.maxRequests;
	}

	/**
	 * Get remaining requests in current window
	 * @returns {number} Number of remaining requests
	 */
	getRemainingRequests() {
		this._cleanup();
		return Math.max(0, this.maxRequests - this.requests.length);
	}

	/**
	 * Get time until next available request slot
	 * @returns {number} Milliseconds until next slot (0 if available now)
	 */
	getTimeUntilAvailable() {
		this._cleanup();

		if (this.requests.length < this.maxRequests) {
			return 0;
		}

		// Calculate when the oldest request will expire
		const oldestRequest = Math.min(...this.requests);
		const expiresAt = oldestRequest + this.windowMs;
		return Math.max(0, expiresAt - Date.now());
	}

	/**
	 * Record a request
	 */
	recordRequest() {
		this.requests.push(Date.now());
	}

	/**
	 * Wait for a request slot to become available
	 * @returns {Promise<void>}
	 */
	async waitForSlot() {
		while (!this.canMakeRequest()) {
			const waitTime = this.getTimeUntilAvailable();
			if (waitTime > 0) {
				console.log(`[${this.name}] Rate limited, waiting ${waitTime}ms`);
				await new Promise((resolve) => setTimeout(resolve, waitTime + 10));
			}
		}
	}

	/**
	 * Execute a function with rate limiting
	 * Will wait if rate limit is reached
	 * @param {Function} fn - Function to execute
	 * @returns {Promise<*>} Result of the function
	 */
	async throttle(fn) {
		await this.waitForSlot();
		this.recordRequest();
		return fn();
	}

	/**
	 * Add a request to the queue
	 * @param {Function} fn - Function to execute
	 * @returns {Promise<*>} Result of the function
	 */
	async enqueue(fn) {
		return new Promise((resolve, reject) => {
			this.queue.push({ fn, resolve, reject });
			this._processQueue();
		});
	}

	/**
	 * Process queued requests
	 * @private
	 */
	async _processQueue() {
		if (this.processing || this.queue.length === 0) {
			return;
		}

		this.processing = true;

		while (this.queue.length > 0) {
			await this.waitForSlot();

			const { fn, resolve, reject } = this.queue.shift();
			this.recordRequest();

			try {
				const result = await fn();
				resolve(result);
			} catch (error) {
				reject(error);
			}
		}

		this.processing = false;
	}

	/**
	 * Reset the rate limiter
	 */
	reset() {
		this.requests = [];
		this.queue = [];
	}

	/**
	 * Get statistics about the rate limiter
	 * @returns {object} Statistics
	 */
	getStats() {
		this._cleanup();
		return {
			name: this.name,
			maxRequests: this.maxRequests,
			windowMs: this.windowMs,
			currentRequests: this.requests.length,
			remainingRequests: this.getRemainingRequests(),
			queueLength: this.queue.length,
			timeUntilAvailable: this.getTimeUntilAvailable()
		};
	}
}

/**
 * Rate limiter per key (e.g., per API endpoint)
 */
class KeyedRateLimiter {
	/**
	 * Create a KeyedRateLimiter
	 * @param {number} maxRequests - Maximum requests per key per window
	 * @param {number} windowMs - Time window in milliseconds
	 * @param {object} [options] - Additional options
	 * @param {number} [options.cleanupInterval] - Interval to clean up old limiters
	 */
	constructor(maxRequests, windowMs, options = {}) {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
		this.options = options;
		this.limiters = new Map();

		// Periodic cleanup of unused limiters
		const cleanupInterval = options.cleanupInterval || 60000;
		this.cleanupTimer = setInterval(() => this._cleanup(), cleanupInterval);
	}

	/**
	 * Get or create a rate limiter for a key
	 * @param {string} key - Rate limit key
	 * @returns {RateLimiter} Rate limiter for the key
	 */
	getLimiter(key) {
		if (!this.limiters.has(key)) {
			this.limiters.set(key, new RateLimiter(
				this.maxRequests,
				this.windowMs,
				{ name: key, ...this.options }
			));
		}
		return this.limiters.get(key);
	}

	/**
	 * Throttle a request for a specific key
	 * @param {string} key - Rate limit key
	 * @param {Function} fn - Function to execute
	 * @returns {Promise<*>} Result of the function
	 */
	async throttle(key, fn) {
		return this.getLimiter(key).throttle(fn);
	}

	/**
	 * Check if a request can be made for a key
	 * @param {string} key - Rate limit key
	 * @returns {boolean} True if request is allowed
	 */
	canMakeRequest(key) {
		return this.getLimiter(key).canMakeRequest();
	}

	/**
	 * Clean up unused limiters
	 * @private
	 */
	_cleanup() {
		for (const [key, limiter] of this.limiters.entries()) {
			if (limiter.requests.length === 0 && limiter.queue.length === 0) {
				this.limiters.delete(key);
			}
		}
	}

	/**
	 * Destroy the rate limiter
	 */
	destroy() {
		clearInterval(this.cleanupTimer);
		this.limiters.clear();
	}
}

/**
 * Pre-configured rate limiters for common APIs
 */
const CommonLimiters = {
	/**
	 * Create a limiter for Fitbit API (150 requests per hour)
	 * @returns {RateLimiter}
	 */
	fitbit() {
		return new RateLimiter(140, 60 * 60 * 1000, { name: "Fitbit" });
	},

	/**
	 * Create a limiter for Spotify API (no hard limit, but be reasonable)
	 * @returns {RateLimiter}
	 */
	spotify() {
		return new RateLimiter(100, 60 * 1000, { name: "Spotify" });
	},

	/**
	 * Create a limiter for Google Maps API
	 * @returns {RateLimiter}
	 */
	googleMaps() {
		return new RateLimiter(50, 1000, { name: "GoogleMaps" }); // 50 QPS
	},

	/**
	 * Create a limiter for Home Assistant
	 * @returns {RateLimiter}
	 */
	homeAssistant() {
		return new RateLimiter(30, 60 * 1000, { name: "HomeAssistant" });
	},

	/**
	 * Create a limiter for SmartThings
	 * @returns {RateLimiter}
	 */
	smartThings() {
		return new RateLimiter(250, 60 * 1000, { name: "SmartThings" });
	},

	/**
	 * Create a limiter for AfterShip
	 * @returns {RateLimiter}
	 */
	afterShip() {
		return new RateLimiter(10, 1000, { name: "AfterShip" }); // 10 per second
	},

	/**
	 * Create a limiter for USPS
	 * @returns {RateLimiter}
	 */
	usps() {
		return new RateLimiter(5, 1000, { name: "USPS" }); // Conservative
	},

	/**
	 * Generic conservative limiter
	 * @returns {RateLimiter}
	 */
	generic() {
		return new RateLimiter(10, 60 * 1000, { name: "Generic" });
	}
};

module.exports = {
	RateLimiter,
	KeyedRateLimiter,
	CommonLimiters
};
