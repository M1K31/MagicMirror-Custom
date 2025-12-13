/**
 * USPS Provider for Package Tracking
 *
 * Uses USPS Web Tools API
 *
 * Setup:
 * 1. Register at https://www.usps.com/business/web-tools-apis/
 * 2. Request access to Track & Confirm API
 * 3. Get your User ID
 */

const PackageProvider = require("./packageprovider");

PackageProvider.register("usps", {
	providerName: "USPS",

	defaults: {
		userId: "",
		baseUrl: "https://secure.shippingapis.com/ShippingAPI.dll"
	},

	/**
	 * Validate configuration
	 * @returns {boolean}
	 */
	validateConfig() {
		if (!this.config.userId) {
			this.setError("USPS User ID is required");
			return false;
		}
		return true;
	},

	/**
	 * Track a package
	 * @param {string} trackingNumber - Tracking number
	 * @returns {Promise<object>}
	 */
	async trackPackage(trackingNumber) {
		if (!this.validateConfig()) return this.getShipmentTemplate();

		try {
			const xml = this.buildTrackRequest(trackingNumber);
			const url = `${this.config.baseUrl}?API=TrackV2&XML=${encodeURIComponent(xml)}`;

			const response = await fetch(url);
			const text = await response.text();

			return this.parseTrackResponse(text, trackingNumber);
		} catch (error) {
			this.setError(`USPS error: ${error.message}`);
			return this.getShipmentTemplate();
		}
	},

	/**
	 * Build track request XML
	 * @param {string} trackingNumber - Tracking number
	 * @returns {string}
	 */
	buildTrackRequest(trackingNumber) {
		return `<?xml version="1.0" encoding="UTF-8" ?>
<TrackFieldRequest USERID="${this.config.userId}">
  <Revision>1</Revision>
  <ClientIp>127.0.0.1</ClientIp>
  <SourceId>MagicMirror</SourceId>
  <TrackID ID="${trackingNumber}"/>
</TrackFieldRequest>`;
	},

	/**
	 * Parse track response XML
	 * @param {string} xml - Response XML
	 * @param {string} trackingNumber - Tracking number
	 * @returns {object}
	 */
	parseTrackResponse(xml, trackingNumber) {
		// Check for errors
		const errorMatch = xml.match(/<Description>([^<]+)<\/Description>/);
		if (errorMatch && xml.includes("<Error>")) {
			throw new Error(errorMatch[1]);
		}

		// Parse tracking info
		const trackInfoMatch = xml.match(/<TrackInfo[^>]*>([\s\S]*?)<\/TrackInfo>/);
		if (!trackInfoMatch) {
			throw new Error("No tracking information found");
		}

		const trackInfo = trackInfoMatch[1];

		// Parse fields
		const status = this.extractField(trackInfo, "StatusSummary") || this.extractField(trackInfo, "Status");
		const summary = this.extractField(trackInfo, "TrackSummary");
		const expectedDelivery = this.extractField(trackInfo, "ExpectedDeliveryDate");
		const predictedDeliveryDate = this.extractField(trackInfo, "PredictedDeliveryDate");

		// Parse track detail events
		const events = this.parseTrackDetails(trackInfo);

		// Determine status
		const statusLower = (status || summary || "").toLowerCase();
		let mappedStatus = "in_transit";

		if (statusLower.includes("delivered")) {
			mappedStatus = "delivered";
		} else if (statusLower.includes("out for delivery")) {
			mappedStatus = "out_for_delivery";
		} else if (statusLower.includes("exception") || statusLower.includes("undeliverable") || statusLower.includes("returned")) {
			mappedStatus = "exception";
		} else if (statusLower.includes("pre-shipment") || statusLower.includes("shipping label")) {
			mappedStatus = "pending";
		}

		return {
			trackingNumber,
			carrier: "usps",
			carrierCode: "usps",
			status: mappedStatus,
			statusText: status || this.getStatusText(mappedStatus),
			origin: this.extractField(trackInfo, "OriginCity")
				? `${this.extractField(trackInfo, "OriginCity")}, ${this.extractField(trackInfo, "OriginState")} ${this.extractField(trackInfo, "OriginZip")}`
				: null,
			destination: this.extractField(trackInfo, "DestinationCity")
				? `${this.extractField(trackInfo, "DestinationCity")}, ${this.extractField(trackInfo, "DestinationState")} ${this.extractField(trackInfo, "DestinationZip")}`
				: null,
			estimatedDelivery: expectedDelivery || predictedDeliveryDate
				? this.parseUSPSDate(expectedDelivery || predictedDeliveryDate)
				: null,
			deliveredAt: mappedStatus === "delivered" && events.length > 0
				? events[0].timestamp
				: null,
			signedBy: this.extractField(trackInfo, "RecipientName"),
			weight: null,
			events,
			lastUpdate: events.length > 0 ? events[0].timestamp : null,
			customName: ""
		};
	},

	/**
	 * Parse TrackDetail elements
	 * @param {string} trackInfo - Track info XML
	 * @returns {Array}
	 */
	parseTrackDetails(trackInfo) {
		const events = [];

		// Get TrackSummary as first event
		const summaryMatch = trackInfo.match(/<TrackSummary>([\s\S]*?)<\/TrackSummary>/);
		if (summaryMatch) {
			const event = this.parseTrackDetailElement(summaryMatch[1]);
			if (event) events.push(event);
		}

		// Get all TrackDetail elements
		const detailMatches = trackInfo.matchAll(/<TrackDetail>([\s\S]*?)<\/TrackDetail>/g);
		for (const match of detailMatches) {
			const event = this.parseTrackDetailElement(match[1]);
			if (event) events.push(event);
		}

		return events;
	},

	/**
	 * Parse a single track detail element
	 * @param {string} detail - Detail XML
	 * @returns {object|null}
	 */
	parseTrackDetailElement(detail) {
		const eventDate = this.extractField(detail, "EventDate");
		const eventTime = this.extractField(detail, "EventTime");
		const event = this.extractField(detail, "Event");
		const city = this.extractField(detail, "EventCity");
		const state = this.extractField(detail, "EventState");
		const zip = this.extractField(detail, "EventZIPCode");

		if (!event) return null;

		// Build location
		let location = null;
		if (city || state || zip) {
			location = [city, state, zip].filter(Boolean).join(", ");
		}

		// Parse date/time
		let timestamp = new Date();
		if (eventDate) {
			const dateStr = eventTime ? `${eventDate} ${eventTime}` : eventDate;
			timestamp = new Date(dateStr);
		}

		// Determine status from event
		const eventLower = event.toLowerCase();
		let status = "in_transit";
		if (eventLower.includes("delivered")) status = "delivered";
		else if (eventLower.includes("out for delivery")) status = "out_for_delivery";
		else if (eventLower.includes("exception") || eventLower.includes("undeliverable")) status = "exception";
		else if (eventLower.includes("accepted") || eventLower.includes("origin")) status = "pending";

		return {
			timestamp,
			status,
			description: event,
			location
		};
	},

	/**
	 * Extract a field from XML
	 * @param {string} xml - XML string
	 * @param {string} fieldName - Field name
	 * @returns {string|null}
	 */
	extractField(xml, fieldName) {
		const regex = new RegExp(`<${fieldName}>([^<]*)</${fieldName}>`, "i");
		const match = xml.match(regex);
		return match ? match[1].trim() : null;
	},

	/**
	 * Parse USPS date format
	 * @param {string} dateStr - Date string (e.g., "January 15, 2024")
	 * @returns {Date|null}
	 */
	parseUSPSDate(dateStr) {
		if (!dateStr) return null;
		try {
			return new Date(dateStr);
		} catch {
			return null;
		}
	},

	/**
	 * Track multiple packages
	 * @param {Array<string>} trackingNumbers - Array of tracking numbers
	 * @returns {Promise<Array>}
	 */
	async trackMultiple(trackingNumbers) {
		if (!this.validateConfig()) return [];

		try {
			const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<TrackFieldRequest USERID="${this.config.userId}">
  <Revision>1</Revision>
  <ClientIp>127.0.0.1</ClientIp>
  <SourceId>MagicMirror</SourceId>
  ${trackingNumbers.map((tn) => `<TrackID ID="${tn}"/>`).join("\n  ")}
</TrackFieldRequest>`;

			const url = `${this.config.baseUrl}?API=TrackV2&XML=${encodeURIComponent(xml)}`;

			const response = await fetch(url);
			const text = await response.text();

			// Parse multiple track infos
			const trackInfoMatches = text.matchAll(/<TrackInfo ID="([^"]+)"[^>]*>([\s\S]*?)<\/TrackInfo>/g);
			const results = [];

			for (const match of trackInfoMatches) {
				const trackingNumber = match[1];
				const trackInfo = match[2];

				try {
					const result = this.parseTrackResponse(`<TrackInfo>${trackInfo}</TrackInfo>`, trackingNumber);
					results.push(result);
				} catch (error) {
					results.push({
						...this.getShipmentTemplate(),
						trackingNumber,
						carrier: "usps",
						statusText: error.message
					});
				}
			}

			return results;
		} catch (error) {
			this.setError(`USPS error: ${error.message}`);
			return [];
		}
	}
});

module.exports = PackageProvider;
