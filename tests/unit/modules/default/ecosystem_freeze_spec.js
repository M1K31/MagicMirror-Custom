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

	it("a freeze requested during startup is not overwritten by the older record on disk", async () => {
		const { helper, statePath } = makeHelper();
		fs.writeFileSync(statePath, JSON.stringify({ frozen: true, info: { reason: "old", since: "2026-01-01T00:00:00.000Z" }, seq: 7 }));
		helper._freezeRestoreDone = false;
		helper._freezeSeq = 1;
		helper._localFrozen = true;
		helper._localFreezeInfo = { reason: "new" };
		await helper._restoreFreezeState();
		expect(helper._localFreezeInfo.reason).toBe("new");
		expect(helper._freezeSeq).toBe(1);
		expect(helper._freezeRestoreDone).toBe(true);
	});

	it("a poll waits for restore instead of reporting unfrozen", async () => {
		const { helper, sent, statePath } = makeHelper();
		fs.writeFileSync(statePath, JSON.stringify({ frozen: true, info: { reason: "saved" }, seq: 2 }));
		helper._freezeRestoreDone = false;
		helper._freezeRestorePromise = helper._restoreFreezeState();
		await helper.fetchPolicyState();
		expect(sent[0].payload.frozen).toBe(true);
		expect(sent[0].payload.freeze_info.reason).toBe("saved");
	});

	it("a freeze requested while restore is still reading keeps its own reason and outranks the saved record", async () => {
		const { helper, statePath } = makeHelper();
		fs.writeFileSync(statePath, JSON.stringify({ frozen: true, info: { reason: "saved" }, seq: 5 }));
		helper._freezeRestoreDone = false;
		helper._freezeRestorePromise = helper._restoreFreezeState();
		await helper.requestFreeze({ reason: "fresh" });
		expect(helper._localFreezeInfo.reason).toBe("fresh");
		const onDisk = JSON.parse(fs.readFileSync(statePath, "utf8"));
		expect(onDisk.info.reason).toBe("fresh");
		expect(onDisk.seq).toBeGreaterThan(5);
	});

	it("a restored freeze has a non-zero sequence even if the file carried none", async () => {
		const { helper, statePath } = makeHelper();
		fs.writeFileSync(statePath, JSON.stringify({ frozen: true, info: { reason: "saved" } }));
		await helper._restoreFreezeState();
		expect(helper._localFrozen).toBe(true);
		expect(helper._freezeSeq).toBe(1);
	});

	it("a corrupt state file is ignored and later overwritten", async () => {
		const { helper, statePath } = makeHelper();
		fs.writeFileSync(statePath, "{not json");
		await helper._restoreFreezeState();
		expect(helper._localFrozen).toBeFalsy();
		await helper.requestFreeze({ reason: "r" });
		expect(JSON.parse(fs.readFileSync(statePath, "utf8")).frozen).toBe(true);
	});
});
