/**
 * Countdown Module for MagicMirror
 *
 * Displays countdown timers to upcoming events like vacations,
 * birthdays, holidays, and custom dates.
 *
 * Features:
 * - Multiple countdown events
 * - Progress indicators (circular/bar)
 * - Recurring events (yearly, monthly)
 * - Auto-hide past events
 * - Holiday database integration
 * - Touch/voice control support
 */

/* global Module, Log */

Module.register("countdown", {
	/**
	 * Default module configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Events to count down to
		events: [
			// { name: "Vacation", date: "2025-06-15", icon: "fa-plane" },
			// { name: "Birthday", date: "2025-03-20", icon: "fa-cake-candles", recurring: "yearly" }
		],

		// Show progress indicator
		showProgress: true,

		// Progress style: "bar" or "circle"
		progressStyle: "bar",

		// Show only days (vs days/hours/minutes)
		daysOnly: false,

		// Maximum events to display
		maxEvents: 5,

		// Days after event to keep showing (0 = hide immediately)
		hideAfter: 7,

		// Sort order: "date" or "name"
		sortBy: "date",

		// Date format for display
		dateFormat: "MMM Do",

		// Show event date below name
		showDate: true,

		// Show event icon
		showIcon: true,

		// Compact display mode
		compact: false,

		// Update interval (ms)
		updateInterval: 60000,

		// Animation speed (ms)
		animationSpeed: 1000,

		// Urgency thresholds (days)
		urgentThreshold: 3,
		soonThreshold: 14,

		// Include common holidays
		includeHolidays: false,

		// Holiday country code (US, UK, CA, etc.)
		holidayCountry: "US"
	},

	/**
	 * Common holidays database
	 */
	holidays: {
		US: [
			{ name: "New Year's Day", month: 1, day: 1, icon: "fa-champagne-glasses" },
			{ name: "Valentine's Day", month: 2, day: 14, icon: "fa-heart" },
			{ name: "St. Patrick's Day", month: 3, day: 17, icon: "fa-clover" },
			{ name: "Easter", month: 4, day: 20, icon: "fa-egg", floating: true },
			{ name: "Mother's Day", month: 5, day: 11, icon: "fa-heart", floating: true },
			{ name: "Father's Day", month: 6, day: 15, icon: "fa-heart", floating: true },
			{ name: "Independence Day", month: 7, day: 4, icon: "fa-flag-usa" },
			{ name: "Halloween", month: 10, day: 31, icon: "fa-ghost" },
			{ name: "Thanksgiving", month: 11, day: 28, icon: "fa-turkey", floating: true },
			{ name: "Christmas Eve", month: 12, day: 24, icon: "fa-tree" },
			{ name: "Christmas", month: 12, day: 25, icon: "fa-gifts" },
			{ name: "New Year's Eve", month: 12, day: 31, icon: "fa-champagne-glasses" }
		]
	},

	/**
	 * Required scripts
	 */
	getScripts() {
		return ["moment.js", "modules/shared/utils.js"];
	},

	/**
	 * Required styles
	 */
	getStyles() {
		return ["countdown.css", "font-awesome.css"];
	},

	/**
	 * Module start
	 */
	start() {
		Log.info(`[${this.name}] Starting module`);

		// Process events
		this.processedEvents = [];
		this.processEvents();

		// Schedule updates
		this.scheduleUpdate();

		// Register voice commands if enabled
		if (this.config.mode === "voice") {
			this.registerVoiceCommands();
		}
	},

	/**
	 * Register voice commands
	 */
	registerVoiceCommands() {
		if (typeof VoiceHandler === "undefined") return;

		VoiceHandler.registerModuleCommands(this.identifier, {
			"how long until": (data) => {
				// Parse event name from transcript
				const eventName = data.transcript.replace("how long until", "").trim();
				this.announceCountdown(eventName);
			},
			"next event": () => this.announceNextEvent(),
			"upcoming events": () => this.announceUpcomingEvents()
		});
	},

	/**
	 * Process configured events
	 */
	processEvents() {
		const now = moment();
		const events = [];

		// Process user-defined events
		this.config.events.forEach((event) => {
			const processed = this.processEvent(event, now);
			if (processed) {
				events.push(processed);
			}
		});

		// Add holidays if enabled
		if (this.config.includeHolidays) {
			const countryHolidays = this.holidays[this.config.holidayCountry] || [];
			countryHolidays.forEach((holiday) => {
				const event = this.processHoliday(holiday, now);
				if (event) {
					events.push(event);
				}
			});
		}

		// Sort events
		if (this.config.sortBy === "date") {
			events.sort((a, b) => a.date - b.date);
		} else {
			events.sort((a, b) => a.name.localeCompare(b.name));
		}

		// Limit to maxEvents
		this.processedEvents = events.slice(0, this.config.maxEvents);
	},

	/**
	 * Process a single event
	 * @param {object} event - Event configuration
	 * @param {moment} now - Current moment
	 * @returns {object|null} Processed event or null
	 */
	processEvent(event, now) {
		let eventDate = moment(event.date);

		// Handle recurring events
		if (event.recurring) {
			eventDate = this.getNextOccurrence(eventDate, event.recurring, now);
		}

		// Check if event should be hidden
		const daysDiff = eventDate.diff(now, "days", true);

		if (daysDiff < -this.config.hideAfter) {
			return null;
		}

		// Calculate time remaining
		const remaining = this.calculateRemaining(eventDate, now);

		return {
			id: event.id || this.generateId(event.name),
			name: event.name,
			date: eventDate,
			dateFormatted: eventDate.format(this.config.dateFormat),
			icon: event.icon || "fa-calendar",
			recurring: event.recurring || null,
			...remaining
		};
	},

	/**
	 * Process a holiday
	 * @param {object} holiday - Holiday definition
	 * @param {moment} now - Current moment
	 * @returns {object|null} Processed event or null
	 */
	processHoliday(holiday, now) {
		const year = now.year();
		let eventDate = moment({ year, month: holiday.month - 1, day: holiday.day });

		// If holiday has passed this year, use next year
		if (eventDate.isBefore(now, "day")) {
			eventDate = moment({ year: year + 1, month: holiday.month - 1, day: holiday.day });
		}

		const daysDiff = eventDate.diff(now, "days", true);

		if (daysDiff < -this.config.hideAfter) {
			return null;
		}

		const remaining = this.calculateRemaining(eventDate, now);

		return {
			id: this.generateId(holiday.name),
			name: holiday.name,
			date: eventDate,
			dateFormatted: eventDate.format(this.config.dateFormat),
			icon: holiday.icon || "fa-calendar",
			recurring: "yearly",
			isHoliday: true,
			...remaining
		};
	},

	/**
	 * Get next occurrence of recurring event
	 * @param {moment} originalDate - Original event date
	 * @param {string} recurring - Recurring type (yearly, monthly, weekly)
	 * @param {moment} now - Current moment
	 * @returns {moment} Next occurrence date
	 */
	getNextOccurrence(originalDate, recurring, now) {
		let nextDate = originalDate.clone();

		while (nextDate.isBefore(now, "day")) {
			switch (recurring) {
				case "yearly":
					nextDate.add(1, "year");
					break;
				case "monthly":
					nextDate.add(1, "month");
					break;
				case "weekly":
					nextDate.add(1, "week");
					break;
				default:
					return nextDate;
			}
		}

		return nextDate;
	},

	/**
	 * Calculate remaining time
	 * @param {moment} eventDate - Event date
	 * @param {moment} now - Current moment
	 * @returns {object} Remaining time details
	 */
	calculateRemaining(eventDate, now) {
		const diff = eventDate.diff(now);
		const duration = moment.duration(diff);

		const days = Math.floor(duration.asDays());
		const hours = duration.hours();
		const minutes = duration.minutes();
		const totalDays = duration.asDays();

		let urgency = "normal";
		if (totalDays <= 0) {
			urgency = "today";
		} else if (totalDays <= this.config.urgentThreshold) {
			urgency = "urgent";
		} else if (totalDays <= this.config.soonThreshold) {
			urgency = "soon";
		}

		// Format display string
		let display;
		if (totalDays < 0) {
			display = "Past";
		} else if (totalDays < 1) {
			if (hours > 0) {
				display = `${hours}h ${minutes}m`;
			} else {
				display = `${minutes}m`;
			}
		} else if (this.config.daysOnly || days >= 7) {
			display = days === 1 ? "1 day" : `${days} days`;
		} else {
			display = `${days}d ${hours}h`;
		}

		// Calculate progress (for events with known start)
		const progress = null; // Would need start date to calculate

		return {
			days,
			hours,
			minutes,
			totalDays,
			display,
			urgency,
			progress,
			isPast: totalDays < 0,
			isToday: totalDays >= 0 && totalDays < 1
		};
	},

	/**
	 * Generate unique ID
	 * @param {string} name - Event name
	 * @returns {string}
	 */
	generateId(name) {
		return `event_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
	},

	/**
	 * Schedule the next update
	 */
	scheduleUpdate() {
		setInterval(() => {
			this.processEvents();
			this.updateDom(this.config.animationSpeed);
		}, this.config.updateInterval);
	},

	/**
	 * Announce countdown for an event (voice)
	 * @param {string} eventName - Event name to announce
	 */
	announceCountdown(eventName) {
		const event = this.processedEvents.find((e) => e.name.toLowerCase().includes(eventName.toLowerCase()));

		if (event) {
			this.sendNotification("VOICE_SPEAK", {
				text: `${event.name} is in ${event.display}`
			});
		} else {
			this.sendNotification("VOICE_SPEAK", {
				text: `I couldn't find an event matching ${eventName}`
			});
		}
	},

	/**
	 * Announce next event (voice)
	 */
	announceNextEvent() {
		if (this.processedEvents.length > 0) {
			const event = this.processedEvents[0];
			this.sendNotification("VOICE_SPEAK", {
				text: `The next event is ${event.name} in ${event.display}`
			});
		} else {
			this.sendNotification("VOICE_SPEAK", {
				text: "There are no upcoming events"
			});
		}
	},

	/**
	 * Announce upcoming events (voice)
	 */
	announceUpcomingEvents() {
		if (this.processedEvents.length > 0) {
			const eventList = this.processedEvents
				.slice(0, 3)
				.map((e) => `${e.name} in ${e.display}`)
				.join(", ");
			this.sendNotification("VOICE_SPEAK", {
				text: `Upcoming events: ${eventList}`
			});
		} else {
			this.sendNotification("VOICE_SPEAK", {
				text: "There are no upcoming events"
			});
		}
	},

	/**
	 * Get DOM
	 * @returns {HTMLElement}
	 */
	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = `countdown-module ${this.config.compact ? "compact" : ""}`;

		if (this.processedEvents.length === 0) {
			wrapper.innerHTML = '<div class="dimmed small">No upcoming events</div>';
			return wrapper;
		}

		const list = document.createElement("div");
		list.className = "countdown-list";

		this.processedEvents.forEach((event) => {
			list.appendChild(this.createEventElement(event));
		});

		wrapper.appendChild(list);
		return wrapper;
	},

	/**
	 * Create event element
	 * @param {object} event - Event data
	 * @returns {HTMLElement}
	 */
	createEventElement(event) {
		const element = document.createElement("div");
		element.className = `countdown-event ${event.urgency} ${event.isPast ? "past" : ""} ${event.isToday ? "today" : ""}`;

		// Icon
		if (this.config.showIcon) {
			const icon = document.createElement("div");
			icon.className = "countdown-icon";
			icon.innerHTML = `<i class="fa ${event.icon}"></i>`;
			element.appendChild(icon);
		}

		// Content
		const content = document.createElement("div");
		content.className = "countdown-content";

		// Name
		const name = document.createElement("div");
		name.className = "countdown-name";
		name.textContent = event.name;
		content.appendChild(name);

		// Date (optional)
		if (this.config.showDate) {
			const date = document.createElement("div");
			date.className = "countdown-date dimmed xsmall";
			date.textContent = event.dateFormatted;
			content.appendChild(date);
		}

		element.appendChild(content);

		// Time remaining
		const time = document.createElement("div");
		time.className = "countdown-time";

		if (event.isToday) {
			time.innerHTML = '<span class="countdown-today">Today!</span>';
		} else if (event.isPast) {
			time.innerHTML = '<span class="countdown-past">Past</span>';
		} else {
			time.innerHTML = `<span class="countdown-value">${event.days}</span><span class="countdown-unit">days</span>`;

			if (!this.config.daysOnly && event.days < 7) {
				time.innerHTML = `<span class="countdown-value">${event.display}</span>`;
			}
		}

		element.appendChild(time);

		// Progress bar
		if (this.config.showProgress && !event.isPast && !this.config.compact) {
			const progress = document.createElement("div");
			progress.className = "countdown-progress";

			// Visual progress based on urgency thresholds
			let pct = 0;
			if (event.totalDays <= 0) {
				pct = 100;
			} else if (event.totalDays <= this.config.urgentThreshold) {
				pct = 80 + (1 - event.totalDays / this.config.urgentThreshold) * 20;
			} else if (event.totalDays <= this.config.soonThreshold) {
				pct = 40 + ((this.config.soonThreshold - event.totalDays) / (this.config.soonThreshold - this.config.urgentThreshold)) * 40;
			} else if (event.totalDays <= 30) {
				pct = (30 - event.totalDays) / 30 * 40;
			}

			const fill = document.createElement("div");
			fill.className = `countdown-progress-fill ${event.urgency}`;
			fill.style.width = `${Math.min(100, pct)}%`;
			progress.appendChild(fill);

			element.appendChild(progress);
		}

		return element;
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived(notification, payload) {
		switch (notification) {
			case "COUNTDOWN_ADD_EVENT":
				this.config.events.push(payload);
				this.processEvents();
				this.updateDom();
				break;
			case "COUNTDOWN_REMOVE_EVENT":
				this.config.events = this.config.events.filter((e) => e.name !== payload.name);
				this.processEvents();
				this.updateDom();
				break;
			case "COUNTDOWN_REFRESH":
				this.processEvents();
				this.updateDom();
				break;
		}
	}
});
