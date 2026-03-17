/* global Log, Module */

Module.register("network-security", {
	defaults: {
		loganalysisHost: "http://localhost:8088",
		maxEvents: 5,
		updateInterval: 30000,
		compactMode: false,
		notifyOnThreat: true,
		notifyOnBlock: true,
		threatIcons: {
			threat_blocked: "fa-ban",
			network_anomaly: "fa-wifi",
			security_alert: "fa-shield-alt",
			brute_force: "fa-key",
			deauth_flood: "fa-signal",
			dns_rebinding: "fa-globe",
			default: "fa-exclamation-triangle"
		},
		severityColors: {
			CRITICAL: "#ff4444",
			HIGH: "#ff8800",
			MEDIUM: "#ffcc00",
			LOW: "#44aa44"
		}
	},

	getStyles: function () {
		return [this.file("network-security.css")];
	},

	start: function () {
		Log.info(`[${this.name}] Starting network security module`);
		this.events = [];
		this.status = null;
		this.connected = false;
		this.error = null;

		this.sendSocketNotification("NETSEC_INIT", {
			loganalysisHost: this.config.loganalysisHost,
			updateInterval: this.config.updateInterval
		});
	},

	socketNotificationReceived: function (notification, payload) {
		switch (notification) {
			case "NETSEC_CONNECTED":
				this.connected = true;
				this.error = null;
				this.updateDom(300);
				break;

			case "NETSEC_STATUS":
				this.status = payload;
				this.updateDom(300);
				break;

			case "NETSEC_EVENTS":
				this.processEvents(payload.events || []);
				this.updateDom(300);
				break;

			case "NETSEC_THREAT_EVENT":
				this.handleThreatEvent(payload);
				break;

			case "NETSEC_ERROR":
				this.error = payload.message;
				this.connected = false;
				this.updateDom(300);
				break;
		}
	},

	processEvents: function (events) {
		this.events = events.slice(0, this.config.maxEvents);
	},

	handleThreatEvent: function (event) {
		this.events.unshift(event);
		this.events = this.events.slice(0, this.config.maxEvents);
		this.updateDom(300);

		if (event.type === "threat_blocked" && this.config.notifyOnBlock) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "Threat Blocked",
				message: `${event.ip} — ${event.reason}`,
				timer: 5000
			});
		} else if (event.type === "security_alert" && this.config.notifyOnThreat) {
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: "Security Alert",
				message: `${event.threat_type} from ${event.ip}`,
				timer: 8000
			});
		}
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = `netsec-module${this.config.compactMode ? " compact" : ""}`;

		if (this.error) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "netsec-error";
			const icon = document.createElement("i");
			icon.className = "fa fa-exclamation-triangle";
			errorDiv.appendChild(icon);
			const span = document.createElement("span");
			span.textContent = this.error;
			errorDiv.appendChild(span);
			wrapper.appendChild(errorDiv);
			return wrapper;
		}

		if (!this.connected) {
			const statusDiv = document.createElement("div");
			statusDiv.className = "netsec-status connecting";
			const icon = document.createElement("i");
			icon.className = "fa fa-spinner fa-spin";
			statusDiv.appendChild(icon);
			const span = document.createElement("span");
			span.textContent = "Connecting to AsusGuard...";
			statusDiv.appendChild(span);
			wrapper.appendChild(statusDiv);
			return wrapper;
		}

		// Status summary
		if (this.status) {
			wrapper.appendChild(this.renderStatus());
		}

		// Events timeline
		wrapper.appendChild(this.renderEvents());

		return wrapper;
	},

	renderStatus: function () {
		const section = document.createElement("div");
		section.className = "netsec-summary";

		const items = [
			{ icon: "fa-shield-alt", label: "Threats", value: this.status.open_threats || 0 },
			{ icon: "fa-ban", label: "Blocked", value: this.status.blocked_ips || 0 },
		];

		items.forEach((item) => {
			const el = document.createElement("div");
			el.className = "netsec-stat";

			const icon = document.createElement("i");
			icon.className = `fa ${item.icon}`;
			el.appendChild(icon);

			const value = document.createElement("span");
			value.className = "netsec-stat-value";
			value.textContent = item.value;
			el.appendChild(value);

			const label = document.createElement("span");
			label.className = "netsec-stat-label dimmed xsmall";
			label.textContent = item.label;
			el.appendChild(label);

			section.appendChild(el);
		});

		return section;
	},

	renderEvents: function () {
		const section = document.createElement("div");
		section.className = "netsec-events";

		const header = document.createElement("div");
		header.className = "section-header";
		header.textContent = "Network Security";
		section.appendChild(header);

		if (this.events.length === 0) {
			const emptyDiv = document.createElement("div");
			emptyDiv.className = "netsec-empty dimmed";
			emptyDiv.textContent = "No recent events";
			section.appendChild(emptyDiv);
			return section;
		}

		const list = document.createElement("div");
		list.className = "netsec-events-list";

		this.events.forEach((event) => {
			const el = document.createElement("div");
			el.className = `netsec-event ${event.severity || ""}`.trim().toLowerCase();

			const iconClass = this.config.threatIcons[event.type]
				|| this.config.threatIcons[event.threat_type]
				|| this.config.threatIcons.default;
			const iconDiv = document.createElement("div");
			iconDiv.className = "netsec-event-icon";
			const icon = document.createElement("i");
			icon.className = `fa ${iconClass}`;
			iconDiv.appendChild(icon);
			el.appendChild(iconDiv);

			const info = document.createElement("div");
			info.className = "netsec-event-info";

			const typeDiv = document.createElement("div");
			typeDiv.className = "netsec-event-type";
			typeDiv.textContent = this.formatEventType(event);
			info.appendChild(typeDiv);

			const detailDiv = document.createElement("div");
			detailDiv.className = "netsec-event-detail dimmed xsmall";
			const detailParts = [];
			if (event.ip) detailParts.push(event.ip);
			if (event.timestamp) detailParts.push(this.formatTime(event.timestamp));
			detailDiv.textContent = detailParts.join(" • ");
			info.appendChild(detailDiv);

			el.appendChild(info);
			list.appendChild(el);
		});

		section.appendChild(list);
		return section;
	},

	formatEventType: function (event) {
		switch (event.type) {
			case "threat_blocked":
				return `Blocked: ${event.reason || "threat"}`;
			case "network_anomaly":
				return `Anomaly: ${event.anomaly_type || "detected"}`;
			case "security_alert":
				return `Alert: ${event.threat_type || "detected"}`;
			default:
				return event.type || "Event";
		}
	},

	formatTime: function (timestamp) {
		if (!timestamp) return "";
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now - date;
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		return date.toLocaleDateString();
	}
});
