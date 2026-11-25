const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

jest.mock("node_helper", () => ({ create: (def) => Object.assign({}, def) }), { virtual: true });
jest.mock("logger", () => ({ log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const helperPath = path.resolve(__dirname, "../../../../modules/default/ecosystem/node_helper.js");
const modulePath = path.resolve(__dirname, "../../../../modules/default/ecosystem/ecosystem.js");
const sampleConfigPath = path.resolve(__dirname, "../../../../config/config.js.sample");

const helper = require(helperPath);

function loadEcosystemModule() {
	let registered = null;
	global.Module = {
		register: (_name, def) => {
			registered = def;
		}
	};
	global.Log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };
	jest.isolateModules(() => {
		require(modulePath);
	});
	return registered;
}

describe("WP7: MagicMirror Ecosystem Notifications Feed & Known Apps", () => {
	it("includes the ecosystem module in config.js.sample", () => {
		const sampleText = fs.readFileSync(sampleConfigPath, "utf8");
		assert.ok(sampleText.includes('module: "ecosystem"'));
		assert.ok(sampleText.includes('minSeverity: "medium"'));
	});

	it("configures corrected default ports for OpenEye (8200) and AI-for-Survival (8000)", () => {
		const mod = loadEcosystemModule();
		assert.strictEqual(mod.defaults.apps.openeye.defaultPort, 8200);
		assert.strictEqual(mod.defaults.apps.ai_for_survival.defaultPort, 8000);
		assert.strictEqual(mod.defaults.apps.aegissiem.defaultPort, 8089);
	});

	it("tracks per-app unread badges, filters minSeverity, and raises SHOW_ALERT for critical items", () => {
		const mod = loadEcosystemModule();
		const alerts = [];
		const inst = Object.assign(Object.create(mod), {
			name: "ecosystem",
			config: JSON.parse(JSON.stringify(mod.defaults)),
			updateDom: jest.fn(),
			sendNotification: (notif, payload) => alerts.push({ notif, payload })
		});

		inst.handleNotificationsFeed({
			notifications: [
				{ id: "1", dedupe_key: "k1", source_app: "ai_for_survival", severity: "low", title: "Ignored low" },
				{ id: "2", dedupe_key: "k2", source_app: "ai_for_survival", severity: "medium", title: "Scan complete", body: "Device clean" },
				{ id: "3", dedupe_key: "k3", source_app: "ai_for_survival", severity: "high", title: "Approval needed", body: "Step pending" },
				{ id: "4", dedupe_key: "k4", source_app: "aegissiem", severity: "critical", title: "Critical Flood", body: "Provisional block active" }
			]
		});

		// Low item filtered out; AFS has 2 unread, AegisSIEM has 1 unread
		assert.strictEqual(inst.notificationFeed.length, 3);
		assert.strictEqual(inst.unreadByApp.AFS, 2);
		assert.strictEqual(inst.unreadByApp.AegisSIEM, 1);

		// Critical item triggered SHOW_ALERT once
		assert.strictEqual(alerts.length, 1);
		assert.strictEqual(alerts[0].notif, "SHOW_ALERT");
		assert.strictEqual(alerts[0].payload.title, "Critical Flood");

		// Re-receiving the same feed does NOT duplicate unread counts or alerts
		inst.handleNotificationsFeed({
			notifications: [
				{ id: "4", dedupe_key: "k4", source_app: "aegissiem", severity: "critical", title: "Critical Flood", body: "Provisional block active" }
			]
		});
		assert.strictEqual(inst.unreadByApp.AegisSIEM, 1);
		assert.strictEqual(alerts.length, 1);

		// Clearing unread works
		inst.markFeedRead();
		assert.deepStrictEqual(inst.unreadByApp, {});
	});

	it("polls hub notifications with minSeverity and handles hub errors gracefully", async () => {
		const sent = [];
		const testHelper = Object.create(helper);
		testHelper.name = "ecosystem";
		testHelper.sendSocketNotification = (notif, payload) => sent.push({ notif, payload });
		testHelper._hubClient = {
			fetchRecentNotifications: jest.fn().mockResolvedValue([
				{ id: "n1", source_app: "openeye", severity: "high", title: "Unknown person" }
			])
		};

		await testHelper.fetchHubNotifications({ limit: 10, minSeverity: "high" });
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(sent[0].notif, "ECOSYSTEM_NOTIFICATIONS_FEED");
		assert.strictEqual(sent[0].payload.notifications.length, 1);

		// Hub error degrades cleanly to empty list
		sent.length = 0;
		testHelper._hubClient.fetchRecentNotifications = jest.fn().mockRejectedValue(new Error("hub offline"));
		await testHelper.fetchHubNotifications({ limit: 10, minSeverity: "medium" });
		assert.strictEqual(sent.length, 1);
		assert.deepStrictEqual(sent[0].payload.notifications, []);
	});
});
