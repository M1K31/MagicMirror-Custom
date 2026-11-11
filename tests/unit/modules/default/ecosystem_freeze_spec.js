// Standalone-freeze durability and hub hand-off for the ecosystem node helper.
// Uses Jest's module registry (not Module.prototype.require, which Jest's own
// resolver bypasses) to stand in for the MagicMirror framework modules.
jest.mock("node_helper", () => ({ create: (def) => Object.assign({}, def) }), { virtual: true });
jest.mock("logger", () => ({ log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const fs = require("fs");
const os = require("os");
const path = require("path");

const helperDef = require("../../../../modules/default/ecosystem/node_helper.js");

/**
 * A helper instance with its freeze state file in a fresh temp directory.
 * @param {{hub?: object}} [opts] hub: stand-in for HubClient (getPolicyState / requestFreeze)
 * @returns {{helper: object, sent: Array<{notif: string, payload: object}>, statePath: string}}
 */
function makeHelper ({ hub } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-freeze-"));
	const helper = Object.create(helperDef);
	helper.name = "ecosystem";
	helper.freezeStatePath = path.join(dir, "ecosystem-freeze.json");
	helper._freezeRestoreDone = true;
	helper._hubClient = hub || null;
	const sent = [];
	helper.sendSocketNotification = (notif, payload) => sent.push({ notif, payload });
	return { helper, sent, statePath: helper.freezeStatePath };
}

describe("ecosystem freeze durability", () => {
	it("writes the freeze to disk before notifying the UI", async () => {
		const { helper, statePath } = makeHelper();
		let onDiskAtNotify = null;
		helper.sendSocketNotification = () => {
			onDiskAtNotify = fs.existsSync(statePath);
		};
		await helper.requestFreeze({ reason: "r", channel: "magicmirror_display" });
		expect(onDiskAtNotify).toBe(true);
		expect(JSON.parse(fs.readFileSync(statePath, "utf8")).frozen).toBe(true);
	});

	it("stop() waits for a pending freeze write", async () => {
		const { helper, statePath } = makeHelper();
		helper._localFrozen = true;
		helper._localFreezeInfo = { reason: "r" };
		helper._persistFreezeState(); // deliberately not awaited
		await helper.stop();
		expect(fs.existsSync(statePath)).toBe(true);
	});
});

module.exports = { makeHelper };
