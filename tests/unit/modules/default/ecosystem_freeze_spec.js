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

	it("a freeze tap while a restored freeze is active re-uses it instead of starting a new one", async () => {
		const { helper, statePath } = makeHelper();
		fs.writeFileSync(statePath, JSON.stringify({ frozen: true, info: { reason: "saved", since: "2026-11-09T00:00:00.000Z" }, seq: 5 }));
		helper._freezeRestoreDone = false;
		helper._freezeRestorePromise = helper._restoreFreezeState();
		await helper.requestFreeze({ reason: "tapped again after restart" });
		expect(helper._localFreezeInfo.reason).toBe("saved");
		expect(helper._freezeSeq).toBe(5);
		expect(JSON.parse(fs.readFileSync(statePath, "utf8")).info.since).toBe("2026-11-09T00:00:00.000Z");
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

	const hubStub = (over = {}) => ({
		getPolicyState: jest.fn(async () => ({ frozen: false, mode: "normal", authority: "hub_synced" })),
		requestFreeze: jest.fn(async () => {
			throw new Error("hub down");
		}),
		...over
	});

	it("an un-acked freeze survives an unfrozen poll and is re-delivered with its original details", async () => {
		const hub = hubStub();
		const { helper, sent, statePath } = makeHelper({ hub });
		await helper.requestFreeze({ reason: "smoke", channel: "magicmirror_display" });
		expect(hub.requestFreeze).toHaveBeenCalledTimes(1);
		expect(sent.at(-1).payload.frozen).toBe(true);
		const since = helper._localFreezeInfo.since;
		sent.length = 0;
		await helper.fetchPolicyState();
		expect(helper._localFrozen).toBe(true);
		expect(fs.existsSync(statePath)).toBe(true);
		expect(hub.requestFreeze).toHaveBeenCalledTimes(2);
		expect(hub.requestFreeze).toHaveBeenLastCalledWith("smoke", "magicmirror_display");
		expect(helper._localFreezeInfo.since).toBe(since);
		expect(sent[0].payload.frozen).toBe(true);
	});

	it("an acked freeze is cleared when the hub later reports unfrozen", async () => {
		const hub = hubStub({ requestFreeze: jest.fn(async () => ({ frozen: true, mode: "freeze", authority: "hub_synced" })) });
		const { helper, sent, statePath } = makeHelper({ hub });
		await helper.requestFreeze({ reason: "r" });
		expect(JSON.parse(fs.readFileSync(statePath, "utf8")).hub_acked).toBe(true);
		sent.length = 0;
		await helper.fetchPolicyState();
		await helper._freezeWriteChain;
		expect(helper._localFrozen).toBe(false);
		expect(fs.existsSync(statePath)).toBe(false);
		expect(sent[0].payload.frozen).toBe(false);
	});

	it("a restored un-acked freeze is re-delivered after restart", async () => {
		const hub = hubStub({ requestFreeze: jest.fn(async () => ({ frozen: true, mode: "freeze" })) });
		const { helper, statePath } = makeHelper({ hub });
		fs.writeFileSync(statePath, JSON.stringify({ frozen: true, info: { reason: "pre-restart", channel: "magicmirror_display", since: "2026-11-09T00:00:00.000Z" }, seq: 3 }));
		helper._freezeRestoreDone = false;
		helper._freezeRestorePromise = helper._restoreFreezeState();
		await helper.fetchPolicyState();
		expect(hub.requestFreeze).toHaveBeenCalledWith("pre-restart", "magicmirror_display");
		expect(helper._freezeHubAcked).toBe(true);
		expect(helper._localFrozen).toBe(true);
		expect(helper._localFreezeInfo.since).toBe("2026-11-09T00:00:00.000Z");
	});

	it("a stale unfrozen poll is not forwarded when a newer freeze exists", async () => {
		let release;
		const hub = hubStub({
			getPolicyState: jest.fn(() => new Promise((r) => {
				release = () => r({ frozen: false, mode: "normal" });
			})),
			requestFreeze: jest.fn(async () => ({ frozen: true, mode: "freeze" }))
		});
		const { helper, sent } = makeHelper({ hub });
		helper._localFrozen = true;
		helper._freezeHubAcked = true;
		helper._freezeSeq = 1;
		helper._localFreezeInfo = { reason: "first", channel: "c" };
		const poll = helper.fetchPolicyState();
		await new Promise((r) => setImmediate(r)); // let the poll reach the hub call
		helper._freezeSeq = 2; // newer freeze requested mid-poll
		release();
		await poll;
		expect(helper._localFrozen).toBe(true);
		expect(sent.length).toBeGreaterThan(0);
		expect(sent.every((m) => m.payload.frozen === true)).toBe(true);
	});

	it("a hub that reports frozen acknowledges the local freeze", async () => {
		const hub = hubStub({ getPolicyState: jest.fn(async () => ({ frozen: true, mode: "freeze", authority: "hub_synced" })) });
		const { helper, sent, statePath } = makeHelper({ hub });
		await helper.requestFreeze({ reason: "r" }); // delivery fails: un-acked
		expect(helper._freezeHubAcked).toBe(false);
		sent.length = 0;
		await helper.fetchPolicyState();
		await helper._freezeWriteChain;
		expect(helper._freezeHubAcked).toBe(true);
		expect(JSON.parse(fs.readFileSync(statePath, "utf8")).hub_acked).toBe(true);
		expect(sent[0].payload.authority).toBe("hub_synced");
		expect(hub.requestFreeze).toHaveBeenCalledTimes(1); // no redundant re-delivery
	});

	it("a hub answer that is not frozen does not count as acknowledgement", async () => {
		const hub = hubStub({ requestFreeze: jest.fn(async () => ({ frozen: false, mode: "normal" })) });
		const { helper, sent } = makeHelper({ hub });
		await helper.requestFreeze({ reason: "r" });
		expect(helper._freezeHubAcked).toBe(false);
		expect(helper._localFrozen).toBe(true);
		expect(sent.at(-1).payload.frozen).toBe(true);
		expect(sent.at(-1).payload.authority).toBe("standalone_local");
	});

	it("fallback state marks a freeze the hub has not acknowledged", async () => {
		const { helper, sent } = makeHelper(); // no hub client
		await helper.requestFreeze({ reason: "r" });
		const last = sent[sent.length - 1].payload;
		expect(last.frozen).toBe(true);
		expect(last.freeze_confirmed).toBe(false);
	});

	it("unfrozen fallback state has no freeze_confirmed key", async () => {
		const { helper, sent } = makeHelper();
		await helper.fetchPolicyState();
		expect("freeze_confirmed" in sent[0].payload).toBe(false);
	});

	it("a retry while frozen re-delivers without resetting the original freeze", async () => {
		const hub = hubStub();
		const { helper, sent } = makeHelper({ hub });
		await helper.requestFreeze({ reason: "first" });
		const { since } = helper._localFreezeInfo;
		const seq = helper._freezeSeq;
		sent.length = 0;
		await helper.requestFreeze({ reason: "retry tap" });
		expect(helper._localFreezeInfo.reason).toBe("first");
		expect(helper._localFreezeInfo.since).toBe(since);
		expect(helper._freezeSeq).toBe(seq);
		expect(hub.requestFreeze).toHaveBeenCalledTimes(2);
		expect(hub.requestFreeze).toHaveBeenLastCalledWith("first", "magicmirror_display");
		expect(sent).toHaveLength(1);
		expect(sent[0].payload.freeze_confirmed).toBe(false);
	});

	it("a retry that reaches the hub reports the hub's confirmed state", async () => {
		let up = false;
		const hub = hubStub({
			requestFreeze: jest.fn(async () => {
				if (!up) throw new Error("hub down");
				return { frozen: true, mode: "freeze", authority: "hub_synced" };
			})
		});
		const { helper, sent } = makeHelper({ hub });
		await helper.requestFreeze({ reason: "first" });
		expect(sent.at(-1).payload.freeze_confirmed).toBe(false);
		up = true;
		await helper.requestFreeze({ reason: "retry tap" });
		expect(sent.at(-1).payload.authority).toBe("hub_synced");
		expect("freeze_confirmed" in sent.at(-1).payload).toBe(false);
		expect(helper._freezeHubAcked).toBe(true);
	});

	// An acknowledgement belongs to the freeze it was obtained for. Applied to a
	// newer freeze it would let the next unfrozen poll clear a freeze the hub
	// never received.
	it("a frozen poll that started before a newer freeze does not acknowledge it", async () => {
		let release;
		const hub = hubStub({
			getPolicyState: jest.fn(() => new Promise((r) => {
				release = () => r({ frozen: true, mode: "freeze", authority: "hub_synced" });
			}))
		});
		const { helper, sent } = makeHelper({ hub });
		helper._localFrozen = true;
		helper._freezeHubAcked = false;
		helper._freezeSeq = 1;
		helper._localFreezeInfo = { reason: "first", channel: "c" };
		const poll = helper.fetchPolicyState();
		await new Promise((r) => setImmediate(r));
		helper._freezeSeq = 2; // a newer freeze replaced the one the poll saw
		release();
		await poll;
		expect(helper._freezeHubAcked).toBe(false);
		expect(sent.at(-1).payload.freeze_confirmed).toBe(false);
	});

	it("a delivery answered after a newer freeze was requested does not acknowledge it", async () => {
		let release;
		const hub = hubStub({
			requestFreeze: jest.fn(() => new Promise((r) => {
				release = () => r({ frozen: true, mode: "freeze" });
			}))
		});
		const { helper } = makeHelper({ hub });
		helper._localFrozen = true;
		helper._freezeSeq = 1;
		helper._localFreezeInfo = { reason: "first", channel: "c" };
		const delivery = helper._deliverFreezeToHub();
		await new Promise((r) => setImmediate(r));
		helper._freezeSeq = 2;
		release();
		expect(await delivery).toBeNull();
		expect(helper._freezeHubAcked).toBeFalsy();
	});
});
