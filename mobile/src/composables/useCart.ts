import { computed, reactive } from "vue";
import type { CatalogItem } from "@mobile/ports";
import { lineTotalMinor, QTY_SCALE } from "@mobile/domain/money";
import {
	newClientTxnId,
	TxnConflictError,
	TxnWriteError,
	type SampleReceipt,
	type SampleSale,
} from "@mobile/domain/txn";
import { getContainer } from "./useApp";

export interface CartLine {
	itemCode: string;
	name: string;
	priceMinor: number;
	qtyMilli: number;
	attrs: Record<string, string>;
}

/**
 * ONE cart for all three selling layouts. It is a module-level singleton, so switching layout (or
 * tabs) never recreates it. `clientTxnId` is generated once per sale attempt and reused on retry.
 */
const cart = reactive({
	lines: [] as CartLine[],
	clientTxnId: newClientTxnId(),
	saving: false,
	error: "",
	lastReceipt: null as SampleReceipt | null,
	lastStatus: "" as "" | "created" | "duplicate",
});

export function useCart(currency = { code: "PKR", minorDigits: 2 }) {
	const total = computed(() =>
		cart.lines.reduce((s, l) => s + lineTotalMinor(l.priceMinor, l.qtyMilli), 0),
	);
	const count = computed(() => cart.lines.reduce((s, l) => s + l.qtyMilli, 0) / QTY_SCALE);

	function add(item: CatalogItem, qty = 1) {
		cart.lastReceipt = null;
		const ex = cart.lines.find((l) => l.itemCode === item.itemCode);
		if (ex) ex.qtyMilli += qty * QTY_SCALE;
		else
			cart.lines.push({
				itemCode: item.itemCode,
				name: item.name,
				priceMinor: item.priceMinor,
				qtyMilli: qty * QTY_SCALE,
				attrs: { ...item.attrs },
			});
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
		cart.clientTxnId = newClientTxnId();
	}

	async function saveSample(scopeId: string, canWrite: () => Promise<boolean>) {
		if (!cart.lines.length || cart.saving) return;
		cart.saving = true;
		cart.error = "";
		try {
			if (!(await canWrite())) {
				cart.error =
					"New sales are blocked: the offline authorization has expired or the clock looks wrong. Reconnect and sign in.";
				return;
			}
			const sale: SampleSale = {
				clientTxnId: cart.clientTxnId,
				scopeId,
				currency: currency.code,
				minorDigits: currency.minorDigits,
				lines: cart.lines.map((l) => ({
					itemCode: l.itemCode,
					name: l.name,
					priceMinor: l.priceMinor,
					qtyMilli: l.qtyMilli,
				})),
			};
			const res = await getContainer().transactions.commitSample(sale);
			// Only after the durable commit resolved do we acknowledge and release the cart.
			cart.lastReceipt = res.receipt;
			cart.lastStatus = res.status;
			cart.lines = [];
			cart.clientTxnId = newClientTxnId();
		} catch (e) {
			// The cart is kept untouched so the cashier can retry with the same transaction id.
			cart.error =
				e instanceof TxnConflictError
					? "This sale id was already used with different contents. Clear the cart to start a new sale."
					: e instanceof TxnWriteError
						? "The sale could not be saved. Nothing was recorded; your cart is unchanged. Try again."
						: e instanceof Error
							? e.message
							: String(e);
		} finally {
			cart.saving = false;
		}
	}

	return {
		cart,
		total,
		count,
		add,
		change,
		remove,
		clear,
		saveSample,
		dismissReceipt: () => (cart.lastReceipt = null),
	};
}
