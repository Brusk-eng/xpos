import { computed, reactive } from "vue";
import type { CatalogItem } from "@mobile/ports";
import { lineTotalMinor, QTY_SCALE } from "@mobile/domain/money";

export interface CartLine {
	itemCode: string;
	name: string;
	uom: string;
	priceMinor: number;
	qtyMilli: number;
	attrs: Record<string, string>;
}

/**
 * ONE cart for all three selling layouts. It is a module-level singleton, so switching layout (or
 * tabs) never recreates it. The sale id is created when the sale is captured (see useCheckout), not here.
 */
const cart = reactive({
	lines: [] as CartLine[],
	error: "",
});

/** A price of 0 means the price list has no price for the item: it is never sold for nothing. */
export const sellable = (item: CatalogItem) => item.priceMinor > 0;

export function useCart(currency = { code: "PKR", minorDigits: 2 }) {
	const total = computed(() =>
		cart.lines.reduce((s, l) => s + lineTotalMinor(l.priceMinor, l.qtyMilli), 0),
	);
	const count = computed(() => cart.lines.reduce((s, l) => s + l.qtyMilli, 0) / QTY_SCALE);

	function add(item: CatalogItem, qty = 1): boolean {
		if (!sellable(item)) {
			cart.error = `${item.name} has no price in the price list, so it cannot be sold. Ask a manager to add a price.`;
			return false;
		}
		cart.error = "";
		const ex = cart.lines.find((l) => l.itemCode === item.itemCode);
		if (ex) ex.qtyMilli += qty * QTY_SCALE;
		else
			cart.lines.push({
				itemCode: item.itemCode,
				name: item.name,
				uom: item.uom,
				priceMinor: item.priceMinor,
				qtyMilli: qty * QTY_SCALE,
				attrs: { ...item.attrs },
			});
		return true;
	}
	function change(itemCode: string, deltaUnits: number) {
		const l = cart.lines.find((x) => x.itemCode === itemCode);
		if (!l) return;
		l.qtyMilli += deltaUnits * QTY_SCALE;
		if (l.qtyMilli <= 0) remove(itemCode);
	}
	function remove(itemCode: string) {
		cart.lines = cart.lines.filter((l) => l.itemCode !== itemCode);
	}
	function clear() {
		cart.lines = [];
		cart.error = "";
	}

	return {
		cart,
		total,
		count,
		add,
		change,
		remove,
		clear,
	};
}
