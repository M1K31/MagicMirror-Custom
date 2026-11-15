// Which ecosystem client the helper ends up with. The 0.1.0 npm release loaded
// fine but had no HubClient; the old loader only fell back to a sibling checkout
// when require() THREW, so the helper silently ran without a hub.
jest.mock("node_helper", () => ({ create: (def) => Object.assign({}, def) }), { virtual: true });
jest.mock("logger", () => ({ log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const helperDef = require("../../../../modules/default/ecosystem/node_helper.js");

const load = helperDef._loadEcosystemClient;
const NPM = "@smartindustriesllc/ecosystem-client";

class Eco {}
class Hub {}

function requireFrom (modules) {
	const calls = [];
	const fn = (id) => {
		calls.push(id);
		const key = id === NPM ? "npm" : "sibling";
		if (!(key in modules)) throw new Error(`Cannot find module '${id}'`);
		return modules[key];
	};
	fn.calls = calls;
	return fn;
}

describe("ecosystem client loader", () => {
	it("uses the installed package when it has HubClient, without touching the sibling checkout", () => {
		const req = requireFrom({ npm: { EcosystemClient: Eco, HubClient: Hub }, sibling: { EcosystemClient: class {}, HubClient: class {} } });
		const got = load(req);
		expect(got.HubClient).toBe(Hub);
		expect(got.source).toBe("installed");
		expect(req.calls).toEqual([NPM]);
	});

	it("falls back to the sibling checkout when the installed package has no HubClient", () => {
		const req = requireFrom({ npm: { EcosystemClient: Eco }, sibling: { EcosystemClient: class {}, HubClient: Hub } });
		const got = load(req);
		expect(got.HubClient).toBe(Hub);
		expect(got.source).toBe("sibling");
	});

	it("keeps the installed EcosystemClient when no HubClient exists anywhere", () => {
		const req = requireFrom({ npm: { EcosystemClient: Eco } });
		const got = load(req);
		expect(got.EcosystemClient).toBe(Eco);
		expect(got.HubClient).toBeNull();
		expect(got.source).toBe("installed-without-hub");
	});

	it("reports nothing available when neither can be loaded", () => {
		const got = load(requireFrom({}));
		expect(got).toEqual({ EcosystemClient: null, HubClient: null, source: "none" });
	});
});
