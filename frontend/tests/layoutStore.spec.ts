/**
 * layoutStore: scoped offline cache, draft/save/cancel, offline edit then sync, conflicts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { builtinLayout, defaultPolicy, effectiveLayout, emptyPersonal } from "@/services/posLayout";

const call = vi.fn();
let online = true;
const meta = new Map<string, string>();

vi.mock("@/services/api", () => ({ call: (...args: unknown[]) => call(...args) }));
vi.mock("@/utils", () => ({
	isOnline: () => online,
	isNetworkError: (err: unknown) => err instanceof Error && err.message === "__offline__",
}));
vi.mock("@/services/dbBridge", () => ({
	getCachedItemByCode: async (code: string) => (code === "CACHED" ? { item_code: "CACHED" } : undefined),
	getSyncMeta: async (key: string) => meta.get(key),
	setSyncMeta: async (key: string, value: string) => {
		meta.set(key, value);
	},
}));

import { useLayoutStore } from "@/stores/layoutStore";

const ALICE = { user: "alice", company: "C", profile: "P" };
const BOB = { user: "bob", company: "C", profile: "P" };

function payloadFor(personal = emptyPersonal(), revision = 0) {
	const policy = defaultPolicy();
	const defaults = builtinLayout();
	return {
		pos_profile: "P",
		company: "C",
		revision,
		recovered: false,
		policy,
		defaults,
		personal,
		layout: effectiveLayout(personal, defaults, policy),
	};
}

/** A tiny server: one stored layout per scope, optimistic revision check. */
function fakeServer() {
	const rows = new Map<string, { personal: ReturnType<typeof emptyPersonal>; revision: number }>();
	let currentUser = "alice";
	call.mockImplementation(async (method: string, args: Record<string, unknown>) => {
		const row = rows.get(currentUser) ?? { personal: emptyPersonal(), revision: 0 };
		if (method.endsWith("get_layout")) return payloadFor(row.personal, row.revision);
		if (method.endsWith("get_pinned_items")) return [];
		if (method.endsWith("save_layout")) {
			if (Number(args.base_revision) !== row.revision) {
				return { status: "conflict", ...payloadFor(row.personal, row.revision) };
			}
			const personal = JSON.parse(args.layout as string);
			rows.set(currentUser, { personal, revision: row.revision + 1 });
			return { status: "saved", ...payloadFor(personal, row.revision + 1) };
		}
		if (method.endsWith("reset_layout")) {
			rows.delete(currentUser);
			return { status: "reset", ...payloadFor() };
		}
		throw new Error(`unexpected ${method}`);
	});
	return { rows, as: (user: string) => (currentUser = user) };
}

describe("layoutStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		call.mockReset();
		meta.clear();
		online = true;
	});

	it("saves an edit, then shows it", async () => {
		fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.view = "list";
		expect(store.shared.view).toBe("list"); // live preview before saving
		expect(await store.save()).toBe(true);
		expect(store.customizing).toBe(false);
		expect(store.shared.view).toBe("list");
		expect(store.payload?.revision).toBe(1);
	});

	it("cancel discards the draft and the preview", async () => {
		fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.view = "list";
		store.cancelCustomize();
		expect(store.shared.view).toBe("grid");
		expect(call.mock.calls.some(([m]) => String(m).endsWith("save_layout"))).toBe(false);
	});

	it("separate users on one terminal never see each other's cached layout", async () => {
		const server = fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.view = "list";
		await store.save();

		server.as("bob");
		online = false; // bob signs in offline: only bob's own (empty) cache may be read
		await store.load(BOB);
		expect(store.shared.view).toBe("grid");

		online = true;
		server.as("alice");
		await store.load(ALICE);
		expect(store.shared.view).toBe("list");
	});

	it("an offline edit is kept, applied locally and sent on reconnect", async () => {
		const server = fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		online = false;
		store.startCustomize();
		store.draft!.shared.view = "list";
		await store.save();
		expect(store.pendingSync).toBe(true);
		expect(store.shared.view).toBe("list");
		expect(server.rows.size).toBe(0);

		online = true;
		await store.syncPending();
		expect(store.pendingSync).toBe(false);
		expect(server.rows.get("alice")?.personal.shared.view).toBe("list");
	});

	it("an offline edit survives a reload", async () => {
		fakeServer();
		const first = useLayoutStore();
		await first.load(ALICE);
		online = false;
		first.startCustomize();
		first.draft!.shared.view = "list";
		await first.save();

		setActivePinia(createPinia());
		const second = useLayoutStore();
		await second.load(ALICE);
		expect(second.shared.view).toBe("list");
		expect(second.pendingSync).toBe(true);
	});

	it("a concurrent save from another device raises a conflict, and keep-mine wins on top", async () => {
		const server = fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.view = "list";

		// another device saves first
		server.rows.set("alice", {
			personal: { ...emptyPersonal(), shared: { favoriteCategories: ["Drinks"] } },
			revision: 1,
		});

		expect(await store.save()).toBe(false);
		expect(store.conflict?.revision).toBe(1);

		await store.keepMine();
		expect(store.conflict).toBeNull();
		expect(server.rows.get("alice")?.revision).toBe(2);
		expect(server.rows.get("alice")?.personal.shared.view).toBe("list");
	});

	it("use-theirs adopts the server copy and drops the edit", async () => {
		const server = fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.view = "list";
		server.rows.set("alice", { personal: { ...emptyPersonal(), shared: { view: "grid" } }, revision: 3 });
		await store.save();
		await store.useTheirs();
		expect(store.shared.view).toBe("grid");
		expect(store.pendingSync).toBe(false);
		expect(store.payload?.revision).toBe(3);
	});

	it("reset returns to the profile defaults", async () => {
		fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.view = "list";
		await store.save();
		await store.reset();
		expect(store.shared.view).toBe("grid");
	});

	it("customization is unavailable when the profile switches it off", async () => {
		fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.payload!.policy.allow_customization = false;
		store.startCustomize();
		expect(store.customizing).toBe(false);
	});

	it("falls back to cached catalogue rows for pinned items offline", async () => {
		fakeServer();
		const store = useLayoutStore();
		await store.load(ALICE);
		store.startCustomize();
		store.draft!.shared.pinnedItems = ["CACHED", "GONE"];
		online = false;
		await store.save();
		expect(store.pinnedItems.map((row) => row.item_code)).toEqual(["CACHED"]);
	});
});
