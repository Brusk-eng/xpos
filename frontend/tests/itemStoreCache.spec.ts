/**
 * itemStore.cacheAllItems keeps the offline catalogue current without re-downloading all of it
 * every time something asks: one download at a time, none while the last one is fresh, and the
 * stock request is split so it never carries every item code at once.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const call = vi.fn();
vi.mock("@/services/api", () => ({
	call: (...args: unknown[]) => call(...args),
	isNetworkError: () => false,
}));
vi.mock("@/utils", () => ({ isOnline: () => true }));
vi.mock("@/stores/posStore", () => ({
	usePosStore: () => ({ useOfflineMode: true, warehouse: "Stores - TC", profileName: "Main" }),
}));
vi.mock("@/stores/settingsStore", () => ({ useSettingsStore: () => ({ itemSearchFields: ["item_name"] }) }));

const idb = vi.hoisted(() => ({
	cacheItems: vi.fn(async (_items: unknown[]) => {}),
	cacheStockForWarehouse: vi.fn(async (_warehouse: string, _entries: unknown[]) => {}),
	warmCatalogIndex: vi.fn(async () => {}),
	getSyncMeta: vi.fn(async (_key: string): Promise<unknown> => undefined),
	setSyncMeta: vi.fn(async (_key: string, _value: string) => true),
}));
vi.mock("@/services/dbBridge", () => idb);

import { useItemStore } from "@/stores/itemStore";

const PAGE = 200;

function serve(total: number) {
	call.mockImplementation(async (method: string, args: Record<string, unknown>) => {
		if (method === "xpos.api.items.get_pos_items") {
			const start = Number(args.start);
			const n = Math.max(0, Math.min(PAGE, total - start));
			return Array.from({ length: n }, (_, i) => ({
				item_code: `I-${start + i}`,
				item_name: `Item ${start + i}`,
			}));
		}
		if (method === "xpos.api.items.get_stock_availability") {
			return (JSON.parse(String(args.items)) as string[]).map((item_code) => ({
				item_code,
				actual_qty: 3,
			}));
		}
		return null;
	});
}

const calls = (method: string) => call.mock.calls.filter((c) => c[0] === method);

describe("itemStore.cacheAllItems", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
		setActivePinia(createPinia());
		call.mockReset();
		Object.values(idb).forEach((fn) => fn.mockClear());
		// What the browser remembers between page loads: written by cacheItems and after a download.
		const meta = new Map<string, unknown>();
		idb.getSyncMeta.mockImplementation(async (key) => meta.get(key));
		idb.setSyncMeta.mockImplementation(async (key, value) => (meta.set(key, value), true));
		idb.cacheItems.mockImplementation(
			async () => void meta.set("items_cached_at", new Date().toISOString()),
		);
	});
	afterEach(() => vi.useRealTimers());

	it("stores every item exactly once, in page order, with its stock", async () => {
		serve(450);
		await useItemStore().cacheAllItems("Main");
		const stored = idb.cacheItems.mock.calls[0][0] as { item_code: string }[];
		expect(stored).toHaveLength(450);
		expect(stored.map((i) => i.item_code).slice(198, 202)).toEqual(["I-198", "I-199", "I-200", "I-201"]);
		const entries = idb.cacheStockForWarehouse.mock.calls[0][1] as { actual_qty: number }[];
		expect(entries).toHaveLength(450);
		expect(entries.every((e) => e.actual_qty === 3)).toBe(true);
		expect(idb.warmCatalogIndex).toHaveBeenCalledTimes(1);
	});

	it("shares one download between callers that ask while it runs", async () => {
		serve(450);
		const store = useItemStore();
		await Promise.all([
			store.cacheAllItems("Main"),
			store.cacheAllItems("Main"),
			store.cacheAllItems("Main"),
		]);
		expect(calls("xpos.api.items.get_pos_items")).toHaveLength(3); // 200 + 200 + 50
		expect(idb.cacheItems).toHaveBeenCalledTimes(1);
	});

	it("skips a download straight after one finished, and runs again once it is stale", async () => {
		serve(450);
		const store = useItemStore();
		await store.cacheAllItems("Main");
		await store.cacheAllItems("Main");
		expect(idb.cacheItems).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date("2026-10-22T09:05:00Z"));
		await store.cacheAllItems("Main");
		expect(idb.cacheItems).toHaveBeenCalledTimes(2);
	});

	it("does not download again after a page reload while the stored catalogue is fresh", async () => {
		serve(450);
		await useItemStore().cacheAllItems("Main");
		expect(idb.cacheItems).toHaveBeenCalledTimes(1);

		setActivePinia(createPinia()); // a reload: new store, same browser storage
		vi.setSystemTime(new Date("2026-10-22T09:01:00Z"));
		await useItemStore().cacheAllItems("Main");
		expect(idb.cacheItems).toHaveBeenCalledTimes(1);
	});

	it("builds the search index while idle even when the stored catalogue is fresh", async () => {
		serve(450);
		await useItemStore().cacheAllItems("Main");
		idb.warmCatalogIndex.mockClear();

		setActivePinia(createPinia()); // a reload: nothing to download, but the index is gone
		await useItemStore().cacheAllItems("Main");
		expect(idb.cacheItems).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2500);
		expect(idb.warmCatalogIndex).toHaveBeenCalledTimes(1);
	});

	it("downloads again when the stored catalogue belongs to another POS Profile", async () => {
		serve(450);
		await useItemStore().cacheAllItems("Main");
		await useItemStore().cacheAllItems("Other");
		expect(idb.cacheItems).toHaveBeenCalledTimes(2);
	});

	it("splits the stock request so it never carries every item code", async () => {
		serve(12_000);
		await useItemStore().cacheAllItems("Main");
		const stock = calls("xpos.api.items.get_stock_availability");
		expect(stock.length).toBeGreaterThan(1);
		const sizes = stock.map((c) => (JSON.parse(String(c[1].items)) as string[]).length);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(5000);
		expect(sizes.reduce((a, b) => a + b, 0)).toBe(12_000);
	});

	it("retries after a failed download instead of waiting out the freshness window", async () => {
		const store = useItemStore();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		call.mockRejectedValueOnce(new Error("offline"));
		await store.cacheAllItems("Main");
		expect(idb.cacheItems).not.toHaveBeenCalled();

		serve(10);
		await store.cacheAllItems("Main");
		expect(idb.cacheItems).toHaveBeenCalledTimes(1);
	});
});
