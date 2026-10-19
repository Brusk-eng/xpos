/**
 * itemStore.fetchItems: a search that lands while another fetch is in flight must not be lost,
 * and a failed load must be told apart from an empty catalogue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const call = vi.fn();
vi.mock("@/services/api", () => ({
	call: (...args: unknown[]) => call(...args),
	isNetworkError: () => false,
}));
vi.mock("@/utils", () => ({ isOnline: () => true }));
vi.mock("@/stores/posStore", () => ({ usePosStore: () => ({ useOfflineMode: false }) }));
vi.mock("@/stores/settingsStore", () => ({ useSettingsStore: () => ({}) }));
vi.mock("@/services/dbBridge", () => ({}));

import { useItemStore } from "@/stores/itemStore";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("itemStore.fetchItems", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		call.mockReset();
	});

	it("re-runs a search that arrived while the previous fetch was in flight", async () => {
		const store = useItemStore();
		const first = deferred<unknown[]>();
		call.mockImplementationOnce(() => first.promise);
		call.mockImplementationOnce(async (_m: string, args: Record<string, unknown>) => [
			{ item_code: "DRILL", item_name: `match for ${args.search_term}` },
		]);

		const initial = store.fetchItems("Main");
		store.setSearchTerm("Cordless");
		await store.fetchItems("Main"); // dropped before the fix

		first.resolve([{ item_code: "OLD", item_name: "Initial page" }]);
		await initial;
		await vi.waitFor(() => expect(store.items.map((i) => i.item_code)).toEqual(["DRILL"]));
		expect(call).toHaveBeenCalledTimes(2);
		expect(call.mock.calls[1][1]).toMatchObject({ search_term: "Cordless", start: 0 });
	});

	it("does not queue a re-run for load-more pages", async () => {
		const store = useItemStore();
		const first = deferred<unknown[]>();
		call.mockImplementationOnce(() => first.promise);
		const initial = store.fetchItems("Main");
		await store.fetchItems("Main", true);
		first.resolve([]);
		await initial;
		expect(call).toHaveBeenCalledTimes(1);
	});

	it("records a failed load and clears it on the next attempt", async () => {
		const store = useItemStore();
		vi.spyOn(console, "error").mockImplementation(() => {});
		call.mockRejectedValueOnce(new Error("Item service unavailable"));
		await store.fetchItems("Main");
		expect(store.loadError).toBe("Item service unavailable");
		expect(store.items).toEqual([]);

		call.mockResolvedValueOnce([{ item_code: "A", item_name: "A" }]);
		await store.fetchItems("Main");
		expect(store.loadError).toBeNull();
		expect(store.items).toHaveLength(1);
	});
});
