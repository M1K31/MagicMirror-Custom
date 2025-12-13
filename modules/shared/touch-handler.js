/**
 * Touch Handler for MagicMirror Modules
 *
 * Provides touch and gesture recognition for modules that support
 * interactive mode. Disabled by default (display-only mode).
 *
 * Supported gestures:
 * - tap: Single tap
 * - doubletap: Double tap
 * - longpress: Long press (500ms+)
 * - swipeleft: Swipe left
 * - swiperight: Swipe right
 * - swipeup: Swipe up
 * - swipedown: Swipe down
 */

/* global Log */

const TouchHandler = {
	/**
	 * Default configuration
	 */
	defaults: {
		enabled: false,
		tapThreshold: 10, // Max movement for tap (px)
		swipeThreshold: 50, // Min distance for swipe (px)
		swipeVelocity: 0.3, // Min velocity for swipe (px/ms)
		longPressDelay: 500, // Delay for long press (ms)
		doubleTapDelay: 300 // Max delay between taps for double tap (ms)
	},

	/**
	 * Active touch handlers
	 */
	handlers: new Map(),

	/**
	 * Initialize touch handling for an element
	 * @param {HTMLElement} element - Element to attach handlers to
	 * @param {object} callbacks - Gesture callbacks
	 * @param {object} options - Configuration options
	 * @returns {object} Handler instance
	 */
	init(element, callbacks = {}, options = {}) {
		const config = { ...this.defaults, ...options };

		if (!config.enabled) {
			Log.info("[TouchHandler] Touch handling disabled (display-only mode)");
			return null;
		}

		if (!element) {
			Log.error("[TouchHandler] No element provided");
			return null;
		}

		const state = {
			element,
			callbacks,
			config,
			touchStart: null,
			touchEnd: null,
			lastTap: 0,
			longPressTimer: null,
			isLongPress: false
		};

		// Bind event handlers
		const handleTouchStart = this.onTouchStart.bind(this, state);
		const handleTouchMove = this.onTouchMove.bind(this, state);
		const handleTouchEnd = this.onTouchEnd.bind(this, state);
		const handleTouchCancel = this.onTouchCancel.bind(this, state);

		element.addEventListener("touchstart", handleTouchStart, { passive: true });
		element.addEventListener("touchmove", handleTouchMove, { passive: true });
		element.addEventListener("touchend", handleTouchEnd, { passive: true });
		element.addEventListener("touchcancel", handleTouchCancel, { passive: true });

		// Also support mouse events for testing
		if (config.supportMouse) {
			element.addEventListener("mousedown", handleTouchStart);
			element.addEventListener("mousemove", handleTouchMove);
			element.addEventListener("mouseup", handleTouchEnd);
			element.addEventListener("mouseleave", handleTouchCancel);
		}

		const handler = {
			state,
			destroy: () => {
				element.removeEventListener("touchstart", handleTouchStart);
				element.removeEventListener("touchmove", handleTouchMove);
				element.removeEventListener("touchend", handleTouchEnd);
				element.removeEventListener("touchcancel", handleTouchCancel);

				if (config.supportMouse) {
					element.removeEventListener("mousedown", handleTouchStart);
					element.removeEventListener("mousemove", handleTouchMove);
					element.removeEventListener("mouseup", handleTouchEnd);
					element.removeEventListener("mouseleave", handleTouchCancel);
				}

				this.clearLongPress(state);
				this.handlers.delete(element);
			}
		};

		this.handlers.set(element, handler);
		Log.info("[TouchHandler] Touch handling enabled for element");

		return handler;
	},

	/**
	 * Get touch/mouse coordinates from event
	 * @param {Event} event - Touch or mouse event
	 * @returns {object} Coordinates {x, y, time}
	 */
	getCoords(event) {
		const touch = event.touches ? event.touches[0] || event.changedTouches[0] : event;
		return {
			x: touch.clientX || touch.pageX,
			y: touch.clientY || touch.pageY,
			time: Date.now()
		};
	},

	/**
	 * Handle touch start
	 * @param {object} state - Handler state
	 * @param {Event} event - Touch event
	 */
	onTouchStart(state, event) {
		state.touchStart = this.getCoords(event);
		state.touchEnd = null;
		state.isLongPress = false;

		// Start long press timer
		this.clearLongPress(state);
		state.longPressTimer = setTimeout(() => {
			state.isLongPress = true;
			this.trigger(state, "longpress", {
				x: state.touchStart.x,
				y: state.touchStart.y
			});
		}, state.config.longPressDelay);
	},

	/**
	 * Handle touch move
	 * @param {object} state - Handler state
	 * @param {Event} event - Touch event
	 */
	onTouchMove(state, event) {
		if (!state.touchStart) return;

		const current = this.getCoords(event);
		const deltaX = current.x - state.touchStart.x;
		const deltaY = current.y - state.touchStart.y;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// Cancel long press if moved too much
		if (distance > state.config.tapThreshold) {
			this.clearLongPress(state);
		}

		state.touchEnd = current;
	},

	/**
	 * Handle touch end
	 * @param {object} state - Handler state
	 * @param {Event} event - Touch event
	 */
	onTouchEnd(state, event) {
		this.clearLongPress(state);

		if (!state.touchStart) return;

		const end = state.touchEnd || this.getCoords(event);
		const deltaX = end.x - state.touchStart.x;
		const deltaY = end.y - state.touchStart.y;
		const deltaTime = end.time - state.touchStart.time;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const velocity = distance / deltaTime;

		// Skip if was a long press
		if (state.isLongPress) {
			state.touchStart = null;
			return;
		}

		// Check for swipe
		if (distance >= state.config.swipeThreshold && velocity >= state.config.swipeVelocity) {
			const direction = this.getSwipeDirection(deltaX, deltaY);
			this.trigger(state, `swipe${direction}`, {
				direction,
				distance,
				velocity,
				deltaX,
				deltaY
			});
		}
		// Check for tap
		else if (distance < state.config.tapThreshold) {
			const now = Date.now();

			// Check for double tap
			if (now - state.lastTap < state.config.doubleTapDelay) {
				this.trigger(state, "doubletap", {
					x: end.x,
					y: end.y
				});
				state.lastTap = 0;
			} else {
				// Single tap (with delay to check for double tap)
				state.lastTap = now;
				setTimeout(() => {
					if (state.lastTap === now) {
						this.trigger(state, "tap", {
							x: end.x,
							y: end.y
						});
					}
				}, state.config.doubleTapDelay);
			}
		}

		state.touchStart = null;
	},

	/**
	 * Handle touch cancel
	 * @param {object} state - Handler state
	 */
	onTouchCancel(state) {
		this.clearLongPress(state);
		state.touchStart = null;
		state.touchEnd = null;
	},

	/**
	 * Clear long press timer
	 * @param {object} state - Handler state
	 */
	clearLongPress(state) {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = null;
		}
	},

	/**
	 * Get swipe direction
	 * @param {number} deltaX - X delta
	 * @param {number} deltaY - Y delta
	 * @returns {string} Direction (left, right, up, down)
	 */
	getSwipeDirection(deltaX, deltaY) {
		if (Math.abs(deltaX) > Math.abs(deltaY)) {
			return deltaX > 0 ? "right" : "left";
		}
		return deltaY > 0 ? "down" : "up";
	},

	/**
	 * Trigger a gesture callback
	 * @param {object} state - Handler state
	 * @param {string} gesture - Gesture name
	 * @param {object} data - Gesture data
	 */
	trigger(state, gesture, data) {
		Log.info(`[TouchHandler] Gesture: ${gesture}`, data);

		// Call specific callback
		if (state.callbacks[gesture]) {
			state.callbacks[gesture](data);
		}

		// Call generic callback
		if (state.callbacks.onGesture) {
			state.callbacks.onGesture(gesture, data);
		}
	},

	/**
	 * Destroy all handlers
	 */
	destroyAll() {
		this.handlers.forEach((handler) => {
			handler.destroy();
		});
		this.handlers.clear();
	},

	/**
	 * Get handler for an element
	 * @param {HTMLElement} element - Element
	 * @returns {object|null} Handler or null
	 */
	getHandler(element) {
		return this.handlers.get(element) || null;
	},

	/**
	 * Check if touch is supported
	 * @returns {boolean}
	 */
	isTouchSupported() {
		return "ontouchstart" in window || navigator.maxTouchPoints > 0;
	},

	/**
	 * Create a gesture map for common module interactions
	 * @param {object} actions - Action callbacks
	 * @returns {object} Gesture callbacks
	 */
	createGestureMap(actions = {}) {
		return {
			tap: actions.select || actions.tap,
			doubletap: actions.activate || actions.doubletap,
			longpress: actions.options || actions.longpress,
			swipeleft: actions.next || actions.swipeleft,
			swiperight: actions.previous || actions.swiperight,
			swipeup: actions.scrollUp || actions.swipeup,
			swipedown: actions.scrollDown || actions.swipedown
		};
	}
};

// Export for use in modules
if (typeof module !== "undefined") {
	module.exports = TouchHandler;
}

// Also make available globally for browser context
if (typeof window !== "undefined") {
	window.TouchHandler = TouchHandler;
}
