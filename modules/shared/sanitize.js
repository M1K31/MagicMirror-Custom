/**
 * Input Sanitization Module
 *
 * Provides utilities for sanitizing user input and data from external
 * sources to prevent XSS and injection attacks.
 *
 * @module shared/sanitize
 */

/**
 * HTML escape character map
 */
const HTML_ESCAPE_MAP = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#x27;",
	"/": "&#x2F;",
	"`": "&#x60;",
	"=": "&#x3D;"
};

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
	if (typeof str !== "string") {
		return str;
	}
	return str.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Unescape HTML entities back to characters
 * @param {string} str - String to unescape
 * @returns {string} Unescaped string
 */
function unescapeHtml(str) {
	if (typeof str !== "string") {
		return str;
	}
	return str
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, "/")
		.replace(/&#x60;/g, "`")
		.replace(/&#x3D;/g, "=");
}

/**
 * Remove all HTML tags from a string
 * @param {string} str - String containing HTML
 * @returns {string} Plain text without HTML
 */
function stripHtml(str) {
	if (typeof str !== "string") {
		return str;
	}
	// Remove script and style content first
	let result = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
	result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
	// Remove remaining tags
	result = result.replace(/<[^>]+>/g, "");
	// Decode entities
	return unescapeHtml(result);
}

/**
 * Sanitize a URL to prevent javascript: and data: exploits
 * @param {string} url - URL to sanitize
 * @returns {string|null} Safe URL or null if dangerous
 */
function sanitizeUrl(url) {
	if (typeof url !== "string") {
		return null;
	}

	// Trim and lowercase for checking
	const trimmed = url.trim().toLowerCase();

	// Block dangerous protocols
	const dangerousProtocols = [
		"javascript:",
		"data:",
		"vbscript:",
		"file:"
	];

	for (const protocol of dangerousProtocols) {
		if (trimmed.startsWith(protocol)) {
			console.warn(`Blocked dangerous URL: ${url.substring(0, 50)}...`);
			return null;
		}
	}

	// Allow http, https, and relative URLs
	if (trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("/") ||
		trimmed.startsWith("./") ||
		trimmed.startsWith("../") ||
		!trimmed.includes(":")) {
		return url;
	}

	console.warn(`Blocked URL with unknown protocol: ${url.substring(0, 50)}...`);
	return null;
}

/**
 * Sanitize an object recursively
 * @param {*} obj - Object to sanitize
 * @param {object} [options] - Sanitization options
 * @param {boolean} [options.escapeHtml=true] - Escape HTML in strings
 * @param {boolean} [options.sanitizeUrls=false] - Sanitize URL fields
 * @param {string[]} [options.urlFields] - Field names to treat as URLs
 * @returns {*} Sanitized object
 */
function sanitizeObject(obj, options = {}) {
	const opts = {
		escapeHtml: true,
		sanitizeUrls: false,
		urlFields: ["url", "href", "src", "link", "image", "icon"],
		...options
	};

	if (obj === null || obj === undefined) {
		return obj;
	}

	if (typeof obj === "string") {
		return opts.escapeHtml ? escapeHtml(obj) : obj;
	}

	if (typeof obj === "number" || typeof obj === "boolean") {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => sanitizeObject(item, opts));
	}

	if (typeof obj === "object") {
		const result = {};
		for (const key of Object.keys(obj)) {
			const value = obj[key];

			// Handle URL fields specially
			if (opts.sanitizeUrls && opts.urlFields.includes(key.toLowerCase())) {
				result[key] = sanitizeUrl(value);
			} else {
				result[key] = sanitizeObject(value, opts);
			}
		}
		return result;
	}

	return obj;
}

/**
 * Create safe DOM content from potentially unsafe data
 * Returns text content that can be safely assigned to textContent
 * @param {*} data - Data to convert to safe text
 * @returns {string} Safe text content
 */
function toSafeText(data) {
	if (data === null || data === undefined) {
		return "";
	}

	if (typeof data !== "string") {
		data = String(data);
	}

	return stripHtml(data);
}

/**
 * Validate that a string contains only allowed characters
 * @param {string} str - String to validate
 * @param {RegExp} [pattern] - Allowed character pattern
 * @returns {boolean} True if string is valid
 */
function isValidInput(str, pattern = /^[\w\s\-_.@]+$/) {
	if (typeof str !== "string") {
		return false;
	}
	return pattern.test(str);
}

/**
 * Sanitize a filename to prevent directory traversal
 * @param {string} filename - Filename to sanitize
 * @returns {string} Safe filename
 */
function sanitizeFilename(filename) {
	if (typeof filename !== "string") {
		return "";
	}

	// Remove directory traversal attempts
	let safe = filename.replace(/\.\./g, "");
	// Remove path separators
	safe = safe.replace(/[/\\]/g, "");
	// Keep only safe characters
	safe = safe.replace(/[^a-zA-Z0-9._-]/g, "_");

	return safe;
}

/**
 * Truncate a string to a maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} [suffix="..."] - Suffix to add if truncated
 * @returns {string} Truncated string
 */
function truncate(str, maxLength, suffix = "...") {
	if (typeof str !== "string") {
		return str;
	}

	if (str.length <= maxLength) {
		return str;
	}

	return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Sanitize data for safe DOM rendering
 * Use this before inserting any external data into the DOM
 * @param {*} data - Data from external source
 * @returns {*} Sanitized data
 */
function sanitizeForDom(data) {
	return sanitizeObject(data, {
		escapeHtml: true,
		sanitizeUrls: true
	});
}

/**
 * Create a safe HTML snippet with sanitized data
 * For simple templating with external data
 * @param {string} template - HTML template with {placeholder} markers
 * @param {object} data - Data to insert (will be escaped)
 * @returns {string} Safe HTML string
 */
function safeTemplate(template, data) {
	let result = template;

	for (const [key, value] of Object.entries(data)) {
		const safeValue = escapeHtml(String(value ?? ""));
		const placeholder = new RegExp(`\\{${key}\\}`, "g");
		result = result.replace(placeholder, safeValue);
	}

	return result;
}

module.exports = {
	escapeHtml,
	unescapeHtml,
	stripHtml,
	sanitizeUrl,
	sanitizeObject,
	sanitizeForDom,
	toSafeText,
	isValidInput,
	sanitizeFilename,
	truncate,
	safeTemplate
};
