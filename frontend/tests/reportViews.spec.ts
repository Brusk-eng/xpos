import { describe, expect, it } from "vitest";
import { createReportViewStore, MAX_RECENTS } from "@/services/reportViews";
import { createRunGuard } from "@/services/reportRunGuard";
import { documentPath, drillTarget } from "@/services/reportDrill";
import { emptyLayout } from "@/services/reportGrid";

function memory() {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
	};
}

describe("view store", () => {
	it("toggles favorites and keeps recents newest-first and capped", () => {
		let t = 0;
		const store = createReportViewStore("k", memory(), () => ++t);
		expect(store.toggleFavorite("a")).toBe(true);
		expect(store.toggleFavorite("a")).toBe(false);
		for (let i = 0; i < MAX_RECENTS + 3; i++) store.touchRecent(`r${i}`);
		store.touchRecent("r5");
		const recents = store.recents();
		expect(recents[0]).toBe("r5");
		expect(recents).toHaveLength(MAX_RECENTS);
	});

	it("saves, defaults (one at a time) and deletes views", () => {
		const store = createReportViewStore("k", memory());
		const first = store.saveView("r", { name: "One", layout: emptyLayout(), sort: null })[0];
		const list = store.saveView("r", { name: "Two", layout: emptyLayout(), sort: null, isDefault: true });
		expect(list.filter((v) => v.isDefault)).toHaveLength(1);
		expect(store.setDefault("r", first.id).find((v) => v.isDefault)?.id).toBe(first.id);
		expect(store.deleteView("r", first.id)).toHaveLength(1);
	});

	it("survives blocked or corrupt storage", () => {
		const broken = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("full");
			},
		};
		const store = createReportViewStore("k", broken);
		expect(store.favorites()).toEqual([]);
		expect(() => store.toggleFavorite("a")).not.toThrow();
		const corrupt = createReportViewStore("k", { getItem: () => "{nope", setItem: () => {} });
		expect(corrupt.views("r")).toEqual([]);
		expect(createReportViewStore("k", null).recents()).toEqual([]);
	});
});

describe("run guard", () => {
	it("invalidates older tokens when a newer run or cancel happens", () => {
		const guard = createRunGuard();
		const a = guard.next();
		const b = guard.next();
		expect(guard.isCurrent(a)).toBe(false);
		expect(guard.isCurrent(b)).toBe(true);
		guard.cancel();
		expect(guard.isCurrent(b)).toBe(false);
	});
});

describe("drill-down targets", () => {
	it("resolves Link and Dynamic Link cells and builds a desk path", () => {
		const link = { fieldname: "inv", label: "Inv", fieldtype: "Link", options: "POS Invoice" };
		const dyn = { fieldname: "doc", label: "Doc", fieldtype: "Dynamic Link", options: "doctype" };
		expect(drillTarget(link, { inv: "INV-1" })).toEqual({ doctype: "POS Invoice", name: "INV-1" });
		expect(drillTarget(dyn, { doc: "X-1", doctype: "Sales Order" })).toEqual({
			doctype: "Sales Order",
			name: "X-1",
		});
		expect(drillTarget(dyn, { doc: "X-1" })).toBeNull();
		expect(drillTarget(link, { inv: "" })).toBeNull();
		expect(documentPath({ doctype: "POS Invoice", name: "A/B 1" })).toBe("/desk/pos-invoice/A%2FB%201");
	});
});
