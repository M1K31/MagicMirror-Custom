// Use Jest's global describe/it/expect so these cases register with the Jest
// runner (`npm run test:unit`). Importing node:test instead registered them with
// node's own runner, outside Jest, which failed the suite as empty.
const assert = require("node:assert");
const path = require("path");
const Module = require("module");

// Stub framework globals for standalone test execution
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
	if (id === "node_helper") {
		return {
			create: function (def) {
				return Object.assign({}, def);
			}
		};
	}
	if (id === "logger") {
		return {
			log: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
		};
	}
	return originalRequire.apply(this, arguments);
};

const helperPath = path.resolve(__dirname, "../../../../modules/default/ecosystem/node_helper.js");
const helper = require(helperPath);

describe("MagicMirror Ecosystem Policy Integration", () => {
	it("rejects privileged policy actions with ECOSYSTEM_POLICY_FORBIDDEN", () => {
		const sent = [];
		const testHelper = Object.create(helper);
		testHelper.name = "ecosystem";
		testHelper.sendSocketNotification = (notif, payload) => sent.push({ notif, payload });

		const forbiddenList = [
			"ECOSYSTEM_POLICY_RESUME",
			"ECOSYSTEM_POLICY_RESTRICTIONS_OFF",
			"ECOSYSTEM_APPROVE",
			"ECOSYSTEM_DENY"
		];

		for (const forbidden of forbiddenList) {
			sent.length = 0;
			testHelper.socketNotificationReceived(forbidden, {});
			assert.strictEqual(sent.length, 1);
			assert.strictEqual(sent[0].notif, "ECOSYSTEM_POLICY_FORBIDDEN");
			assert.strictEqual(sent[0].payload.action, forbidden);
		}
	});

	it("returns valid policy state on ECOSYSTEM_GET_POLICY_STATE", async () => {
		const sent = [];
		const testHelper = Object.create(helper);
		testHelper.name = "ecosystem";
		testHelper._localFrozen = false;
		testHelper.sendSocketNotification = (notif, payload) => sent.push({ notif, payload });

		await testHelper.socketNotificationReceived("ECOSYSTEM_GET_POLICY_STATE");
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(sent[0].notif, "ECOSYSTEM_POLICY_STATE");
		assert.strictEqual(sent[0].payload.frozen, false);
		assert.strictEqual(sent[0].payload.mode, "normal");
	});

	it("engages freeze mode on ECOSYSTEM_REQUEST_FREEZE", async () => {
		const sent = [];
		const testHelper = Object.create(helper);
		testHelper.name = "ecosystem";
		testHelper._localFrozen = false;
		testHelper.sendSocketNotification = (notif, payload) => sent.push({ notif, payload });

		await testHelper.socketNotificationReceived("ECOSYSTEM_REQUEST_FREEZE", {
			reason: "Emergency freeze button tapped",
			channel: "magicmirror_display"
		});
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(sent[0].notif, "ECOSYSTEM_POLICY_STATE");
		assert.strictEqual(sent[0].payload.frozen, true);
		assert.strictEqual(sent[0].payload.mode, "freeze");
		assert.strictEqual(sent[0].payload.freeze_info.reason, "Emergency freeze button tapped");
	});
});
