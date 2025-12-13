/**
 * Storage Helper for MagicMirror Modules
 *
 * Provides a consistent API for storing and retrieving data
 * with support for localStorage (client) and file system (server).
 * Includes automatic serialization, namespacing, and expiration.
 */

/* global Log */

const Storage = {
	/**
	 * Namespace prefix for all storage keys
	 */
	namespace: "mm_",

	/**
	 * Check if localStorage is available
	 * @returns {boolean}
	 */
	isAvailable() {
		try {
			const test = "__storage_test__";
			localStorage.setItem(test, test);
			localStorage.removeItem(test);
			return true;
		} catch (e) {
			return false;
		}
	},

	/**
	 * Get the full key with namespace
	 * @param {string} key - Key name
	 * @param {string} moduleId - Optional module identifier
	 * @returns {string} Namespaced key
	 */
	getKey(key, moduleId = "") {
		const prefix = moduleId ? `${this.namespace}${moduleId}_` : this.namespace;
		return `${prefix}${key}`;
	},

	/**
	 * Store a value
	 * @param {string} key - Key name
	 * @param {*} value - Value to store (will be JSON serialized)
	 * @param {object} options - Storage options
	 * @returns {boolean} Success status
	 */
	set(key, value, options = {}) {
		const { moduleId = "", expiresIn = null } = options;

		if (!this.isAvailable()) {
			Log.warn("[Storage] localStorage not available");
			return false;
		}

		try {
			const fullKey = this.getKey(key, moduleId);
			const data = {
				value,
				timestamp: Date.now(),
				expires: expiresIn ? Date.now() + expiresIn : null
			};

			localStorage.setItem(fullKey, JSON.stringify(data));
			return true;
		} catch (e) {
			Log.error(`[Storage] Failed to store ${key}:`, e);
			return false;
		}
	},

	/**
	 * Retrieve a value
	 * @param {string} key - Key name
	 * @param {object} options - Retrieval options
	 * @returns {*} Stored value or default
	 */
	get(key, options = {}) {
		const { moduleId = "", defaultValue = null } = options;

		if (!this.isAvailable()) {
			return defaultValue;
		}

		try {
			const fullKey = this.getKey(key, moduleId);
			const stored = localStorage.getItem(fullKey);

			if (!stored) {
				return defaultValue;
			}

			const data = JSON.parse(stored);

			// Check expiration
			if (data.expires && Date.now() > data.expires) {
				this.remove(key, { moduleId });
				return defaultValue;
			}

			return data.value;
		} catch (e) {
			Log.error(`[Storage] Failed to retrieve ${key}:`, e);
			return defaultValue;
		}
	},

	/**
	 * Remove a value
	 * @param {string} key - Key name
	 * @param {object} options - Options
	 * @returns {boolean} Success status
	 */
	remove(key, options = {}) {
		const { moduleId = "" } = options;

		if (!this.isAvailable()) {
			return false;
		}

		try {
			const fullKey = this.getKey(key, moduleId);
			localStorage.removeItem(fullKey);
			return true;
		} catch (e) {
			Log.error(`[Storage] Failed to remove ${key}:`, e);
			return false;
		}
	},

	/**
	 * Check if a key exists (and is not expired)
	 * @param {string} key - Key name
	 * @param {object} options - Options
	 * @returns {boolean}
	 */
	has(key, options = {}) {
		return this.get(key, { ...options, defaultValue: undefined }) !== undefined;
	},

	/**
	 * Get all keys for a module
	 * @param {string} moduleId - Module identifier
	 * @returns {string[]} Array of keys (without namespace)
	 */
	keys(moduleId = "") {
		if (!this.isAvailable()) {
			return [];
		}

		const prefix = this.getKey("", moduleId);
		const keys = [];

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key.startsWith(prefix)) {
				keys.push(key.slice(prefix.length));
			}
		}

		return keys;
	},

	/**
	 * Clear all keys for a module
	 * @param {string} moduleId - Module identifier
	 * @returns {number} Number of keys removed
	 */
	clear(moduleId = "") {
		const keysToRemove = this.keys(moduleId);

		keysToRemove.forEach((key) => {
			this.remove(key, { moduleId });
		});

		return keysToRemove.length;
	},

	/**
	 * Clear all expired keys
	 * @returns {number} Number of expired keys removed
	 */
	clearExpired() {
		if (!this.isAvailable()) {
			return 0;
		}

		let removed = 0;
		const keysToCheck = [];

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key.startsWith(this.namespace)) {
				keysToCheck.push(key);
			}
		}

		keysToCheck.forEach((fullKey) => {
			try {
				const stored = localStorage.getItem(fullKey);
				if (stored) {
					const data = JSON.parse(stored);
					if (data.expires && Date.now() > data.expires) {
						localStorage.removeItem(fullKey);
						removed++;
					}
				}
			} catch (e) {
				// Invalid data, remove it
				localStorage.removeItem(fullKey);
				removed++;
			}
		});

		return removed;
	},

	/**
	 * Get storage usage info
	 * @param {string} moduleId - Optional module identifier
	 * @returns {object} Usage information
	 */
	getUsage(moduleId = "") {
		if (!this.isAvailable()) {
			return { keys: 0, bytes: 0 };
		}

		const prefix = moduleId ? this.getKey("", moduleId) : this.namespace;
		let keys = 0;
		let bytes = 0;

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key.startsWith(prefix)) {
				keys++;
				const value = localStorage.getItem(key);
				bytes += key.length + (value ? value.length : 0);
			}
		}

		return {
			keys,
			bytes,
			bytesFormatted: this.formatBytes(bytes)
		};
	},

	/**
	 * Format bytes to human-readable string
	 * @param {number} bytes - Bytes
	 * @returns {string} Formatted string
	 */
	formatBytes(bytes) {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
	},

	/**
	 * Create a scoped storage instance for a module
	 * @param {string} moduleId - Module identifier
	 * @returns {object} Scoped storage API
	 */
	createScope(moduleId) {
		const self = this;

		return {
			set(key, value, options = {}) {
				return self.set(key, value, { ...options, moduleId });
			},

			get(key, defaultValue = null) {
				return self.get(key, { moduleId, defaultValue });
			},

			remove(key) {
				return self.remove(key, { moduleId });
			},

			has(key) {
				return self.has(key, { moduleId });
			},

			keys() {
				return self.keys(moduleId);
			},

			clear() {
				return self.clear(moduleId);
			},

			getUsage() {
				return self.getUsage(moduleId);
			}
		};
	}
};

// Export for use in modules
if (typeof module !== "undefined") {
	module.exports = Storage;
}

// Also make available globally for browser context
if (typeof window !== "undefined") {
	window.MMStorage = Storage;
}
