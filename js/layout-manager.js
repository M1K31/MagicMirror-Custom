/**
 * MagicMirror Layout Manager
 *
 * Apple HIG-Inspired Adaptive Layout System
 * Manages dynamic module sizing based on available space and content priority.
 *
 * Core Principles (from Apple HIG Widgets):
 * 1. Hierarchy - Essential content always visible
 * 2. Progressive Disclosure - Details shown when space permits
 * 3. Glanceability - Key info readable at a distance
 * 4. No Truncation - Content adapts rather than clips
 *
 * Copyright (c) 2025 Mikel Smart
 */

/* global Log, MM */

const LayoutManager = (function () {
	// Layout modes from most to least information
	const LAYOUT_MODES = ["full", "compact", "minimal"];

	// Default module priorities (1 = highest)
	const DEFAULT_PRIORITIES = {
		clock: 1,
		weather: 2,
		calendar: 2,
		compliments: 3,
		newsfeed: 3,
		network: 3,
		"openeye-events": 3,
		alert: 1,
		updatenotification: 3,
		settings: 3
	};

	// Region space thresholds (percentage of viewport)
	const SPACE_THRESHOLDS = {
		full: { minHeight: 0.6, minWidth: 0.3 },
		compact: { minHeight: 0.35, minWidth: 0.25 },
		minimal: { minHeight: 0, minWidth: 0 }
	};

	let currentMode = "full";
	let resizeObserver = null;
	let layoutCheckInterval = null;
	let isInitialized = false;

	/**
	 * Initialize the layout manager
	 */
	function init() {
		if (isInitialized) return;

		Log.info("[LayoutManager] Initializing adaptive layout system");

		// Wait for DOM to be ready
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", setupLayoutSystem);
		} else {
			setupLayoutSystem();
		}

		isInitialized = true;
	}

	/**
	 * Setup the layout observation and management system
	 */
	function setupLayoutSystem() {
		// Initial layout calculation
		calculateLayout();

		// Setup ResizeObserver for viewport changes
		setupResizeObserver();

		// Periodic layout check (catches dynamic content changes)
		layoutCheckInterval = setInterval(checkLayoutNeeds, 5000);

		// Listen for module updates
		setupModuleListeners();

		Log.info("[LayoutManager] Layout system ready");
	}

	/**
	 * Setup ResizeObserver for responsive behavior
	 */
	function setupResizeObserver() {
		if (!window.ResizeObserver) {
			Log.warn("[LayoutManager] ResizeObserver not supported, using fallback");
			window.addEventListener("resize", debounce(calculateLayout, 250));
			return;
		}

		resizeObserver = new ResizeObserver(debounce((entries) => {
			for (const entry of entries) {
				if (entry.target === document.body) {
					calculateLayout();
				}
			}
		}, 250));

		resizeObserver.observe(document.body);
	}

	/**
	 * Setup listeners for module DOM updates
	 */
	function setupModuleListeners() {
		// Use MutationObserver to detect when modules update their content
		const contentObserver = new MutationObserver(debounce(() => {
			checkLayoutNeeds();
		}, 500));

		// Observe all module containers
		const containers = document.querySelectorAll(".region .container");
		containers.forEach((container) => {
			contentObserver.observe(container, {
				childList: true,
				subtree: true,
				characterData: true
			});
		});
	}

	/**
	 * Calculate and apply optimal layout
	 */
	function calculateLayout() {
		const viewport = {
			width: window.innerWidth,
			height: window.innerHeight
		};

		// Determine layout mode based on viewport
		const newMode = determineLayoutMode(viewport);

		if (newMode !== currentMode) {
			Log.info(`[LayoutManager] Layout mode: ${currentMode} → ${newMode}`);
			currentMode = newMode;
			applyLayoutMode(newMode);
		}

		// Apply priorities and update module attributes
		applyModulePriorities();

		// Check for content overflow and adjust
		adjustOverflowingModules();
	}

	/**
	 * Determine appropriate layout mode based on viewport
	 */
	function determineLayoutMode(viewport) {
		const heightRatio = viewport.height / 1080; // Normalized to 1080p
		const widthRatio = viewport.width / 1920;

		if (heightRatio >= 0.8 && widthRatio >= 0.8) {
			return "full";
		} else if (heightRatio >= 0.5 && widthRatio >= 0.5) {
			return "compact";
		} else {
			return "minimal";
		}
	}

	/**
	 * Apply layout mode to all modules
	 */
	function applyLayoutMode(mode) {
		// Set CSS variable
		document.documentElement.style.setProperty("--layout-mode", mode);

		// Apply data attribute to all modules
		const modules = document.querySelectorAll(".module");
		modules.forEach((module) => {
			module.setAttribute("data-layout-mode", mode);
		});

		// Broadcast notification to MagicMirror modules
		if (typeof MM !== "undefined" && MM.sendNotification) {
			MM.sendNotification("LAYOUT_MODE_CHANGED", {
				mode: mode,
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Apply priority attributes to modules
	 */
	function applyModulePriorities() {
		const modules = document.querySelectorAll(".module");

		modules.forEach((module) => {
			// Get module name from class
			const classes = Array.from(module.classList);
			const moduleName = classes.find((c) => c !== "module" && !c.includes("hidden"));

			if (moduleName) {
				const priority = DEFAULT_PRIORITIES[moduleName] || 3;
				module.setAttribute("data-priority", priority);
			}
		});
	}

	/**
	 * Check for modules that need layout adjustment
	 */
	function checkLayoutNeeds() {
		const regions = document.querySelectorAll(".region");

		regions.forEach((region) => {
			const container = region.querySelector(".container");
			if (!container) return;

			const modules = container.querySelectorAll(".module:not(.hidden)");
			if (modules.length === 0) return;

			// Check if content is overflowing the region
			const regionRect = region.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();

			const isOverflowing =
				containerRect.height > regionRect.height * 0.9 ||
				containerRect.width > regionRect.width * 0.95;

			if (isOverflowing) {
				// Apply compact mode to lower priority modules in this region
				applyRegionCompaction(container, modules);
			}
		});
	}

	/**
	 * Apply compaction to modules in an overflowing region
	 */
	function applyRegionCompaction(container, modules) {
		// Sort modules by priority (higher priority = lower number)
		const sortedModules = Array.from(modules).sort((a, b) => {
			const priorityA = parseInt(a.getAttribute("data-priority")) || 3;
			const priorityB = parseInt(b.getAttribute("data-priority")) || 3;
			return priorityB - priorityA; // Lower priority first (to compact)
		});

		// Compact lower priority modules first
		let compacted = false;
		for (const module of sortedModules) {
			const currentLayoutMode = module.getAttribute("data-layout-mode");
			const currentModeIndex = LAYOUT_MODES.indexOf(currentLayoutMode);

			if (currentModeIndex < LAYOUT_MODES.length - 1) {
				const newMode = LAYOUT_MODES[currentModeIndex + 1];
				module.setAttribute("data-layout-mode", newMode);
				compacted = true;

				Log.debug(
					`[LayoutManager] Compacted ${module.classList[1]} to ${newMode}`
				);
				break; // Compact one at a time to avoid over-compaction
			}
		}

		// If we compacted, check again after transition
		if (compacted) {
			setTimeout(() => checkLayoutNeeds(), 500);
		}
	}

	/**
	 * Adjust modules that are overflowing their content
	 */
	function adjustOverflowingModules() {
		const modules = document.querySelectorAll(".module:not(.hidden)");

		modules.forEach((module) => {
			const content = module.querySelector(".module-content");
			if (!content) return;

			// Check if content is being clipped
			if (content.scrollHeight > content.clientHeight + 10) {
				// Module has overflow - it should be scrollable or compacted
				const layoutMode = module.getAttribute("data-layout-mode");

				if (layoutMode !== "minimal") {
					// Add subtle overflow indicator
					module.classList.add("has-overflow");
				}
			} else {
				module.classList.remove("has-overflow");
			}
		});
	}

	/**
	 * Get current layout state
	 */
	function getLayoutState() {
		return {
			mode: currentMode,
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight
			},
			modules: getModuleStates()
		};
	}

	/**
	 * Get all module states
	 */
	function getModuleStates() {
		const modules = document.querySelectorAll(".module");
		const states = [];

		modules.forEach((module) => {
			const classes = Array.from(module.classList);
			const name = classes.find((c) => c !== "module" && !c.includes("hidden"));

			states.push({
				name: name,
				priority: module.getAttribute("data-priority"),
				layoutMode: module.getAttribute("data-layout-mode"),
				hidden: module.classList.contains("hidden"),
				hasOverflow: module.classList.contains("has-overflow")
			});
		});

		return states;
	}

	/**
	 * Force a specific layout mode (for testing/manual override)
	 */
	function setLayoutMode(mode) {
		if (!LAYOUT_MODES.includes(mode)) {
			Log.warn(`[LayoutManager] Invalid layout mode: ${mode}`);
			return;
		}

		currentMode = mode;
		applyLayoutMode(mode);
	}

	/**
	 * Cleanup resources
	 */
	function destroy() {
		if (resizeObserver) {
			resizeObserver.disconnect();
		}

		if (layoutCheckInterval) {
			clearInterval(layoutCheckInterval);
		}

		isInitialized = false;
	}

	/**
	 * Debounce utility
	 */
	function debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	// Public API
	return {
		init: init,
		calculateLayout: calculateLayout,
		getLayoutState: getLayoutState,
		setLayoutMode: setLayoutMode,
		destroy: destroy,
		LAYOUT_MODES: LAYOUT_MODES
	};
})();

// Auto-initialize when script loads
if (typeof Log !== "undefined") {
	LayoutManager.init();
} else {
	// Wait for MagicMirror to load
	document.addEventListener("DOMContentLoaded", () => {
		setTimeout(() => LayoutManager.init(), 1000);
	});
}

// Export for module use
if (typeof module !== "undefined") {
	module.exports = LayoutManager;
}
