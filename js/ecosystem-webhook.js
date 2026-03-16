/**
 * Express middleware for receiving ecosystem webhook events.
 * Routes events into MagicMirror's internal notification system.
 */

const Log = require("logger");

class EcosystemWebhookHandler {
	constructor(eco) {
		this._eco = eco;
		this._listeners = {};
	}

	/**
	 * Register a callback for an ecosystem event pattern.
	 * @param {string} pattern - Event pattern (e.g., "security.*")
	 * @param {Function} callback - Called with (envelope) when matched
	 */
	on(pattern, callback) {
		this._eco.on(pattern, callback);
		if (!this._listeners[pattern]) this._listeners[pattern] = [];
		this._listeners[pattern].push(callback);
	}

	/**
	 * Express route handler for POST /ecosystem/events
	 */
	routeHandler() {
		const eco = this._eco;
		return async (req, res) => {
			try {
				await eco.handleWebhook(req.body);
				res.json({ status: "ok" });
			} catch (e) {
				Log.error(`Ecosystem webhook error: ${e.message}`);
				res.status(500).json({ status: "error" });
			}
		};
	}

	get subscriptions() {
		return Object.keys(this._listeners);
	}
}

module.exports = { EcosystemWebhookHandler };
