/**
 * @vitest-environment jsdom
 *
 * Checkout gating, the rounding row and completing a tracked line's serial/batch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/services/api", () => ({ call: vi.fn(), default: { call: vi.fn() } }));

const pos = {
	taxes: [] as unknown[],
	taxInclusiveMode: false,
	disableRoundedTotal: false,
	blockSaleBeyondAvailableQty: true,
	stockSettings: { allow_negative_stock: false },
	allowZeroRatedItems: true,
	profile: { name: "P", warehouse: "W", currency: "USD" },
	currency: "USD",
	tenderModeFor: vi.fn(() => undefined),
};
vi.mock("@/stores/posStore", () => ({ usePosStore: vi.fn(() => pos) }));

import { useCartStore } from "@/stores/cartStore";
import type { CartItem, POSItem } from "@/types/pos.types";

const SERIAL: POSItem = {
	item_code: "SER",
	item_name: "Scanner",
	rate: 250,
	stock_uom: "Nos",
	uom: "Nos",
	has_serial_no: true,
	has_batch_no: false,
	actual_qty: 10,
	is_stock_item: 1,
} as POSItem;
const BATCH: POSItem = {
	...SERIAL,
	item_code: "BAT",
	item_name: "Brew",
	rate: 12.5,
	has_serial_no: false,
	has_batch_no: true,
};

function cartWithCustomer() {
	const cart = useCartStore();
	cart.setCustomer({ name: "C1", customer_name: "Ada" } as never);
	return cart;
}

describe("checkout gating", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		pos.disableRoundedTotal = false;
	});

	it("blocks payment on a missing serial but only warns on a missing batch", () => {
		const cart = cartWithCustomer();
		cart.addItem(BATCH);
		expect(cart.pendingRequirements).toMatchObject([{ kind: "batch", blocking: false }]);
		expect(cart.openPaymentDialog().success).toBe(true);
		cart.closePaymentDialog();

		cart.addItem(SERIAL);
		expect(cart.checkoutBlockers).toHaveLength(1);
		const opened = cart.openPaymentDialog();
		expect(opened.success).toBe(false);
		expect(opened.message).toContain("Scanner");
		expect(cart.showPaymentDialog).toBe(false);
	});

	it("refuses payment without a customer or items", () => {
		const cart = useCartStore();
		expect(cart.openPaymentDialog().success).toBe(false);
		cart.addItem({ ...BATCH, has_batch_no: false } as POSItem);
		expect(cart.openPaymentDialog().success).toBe(false);
	});

	it("needs nothing on a return", () => {
		const cart = cartWithCustomer();
		cart.enterReturnMode("SINV-1");
		cart.addItem(SERIAL);
		expect(cart.pendingRequirements).toEqual([]);
	});
});

describe("rounding row", () => {
	beforeEach(() => setActivePinia(createPinia()));

	function cartAt12_80() {
		const cart = cartWithCustomer();
		cart.addItem({ ...BATCH, has_batch_no: false } as POSItem);
		cart.addItem({ ...BATCH, item_code: "X", has_batch_no: false, rate: 0.3 } as POSItem);
		return cart;
	}

	it("is exactly what rounding changed", () => {
		pos.disableRoundedTotal = false;
		const cart = cartAt12_80();
		expect(cart.unroundedTotal).toBeCloseTo(12.8);
		expect(cart.grandTotal).toBe(13);
		expect(cart.roundingAdjustment).toBeCloseTo(0.2);
	});

	it("is zero when the profile disables rounding", () => {
		pos.disableRoundedTotal = true;
		const cart = cartAt12_80();
		expect(cart.grandTotal).toBeCloseTo(12.8);
		expect(cart.roundingAdjustment).toBe(0);
	});
});

describe("resolveLineTracking", () => {
	beforeEach(() => setActivePinia(createPinia()));

	it("splits a two-unit serial line into one line per serial, keeping price and discount", () => {
		const cart = cartWithCustomer();
		cart.addItem(SERIAL);
		cart.addItem(SERIAL);
		cart.updateItemDiscount(0, "percentage", 10);
		const localId = cart.getInvoiceData("P", "S").local_id;
		const uid = cart.items[0].uid;

		expect(cart.resolveLineTracking(0, { serials: ["SN-1"] }).success).toBe(false);
		expect(cart.resolveLineTracking(0, { serials: ["SN-1", "SN-2"] }).success).toBe(true);

		const lines = cart.items as CartItem[];
		expect(lines.map((l) => [l.serial_no, l.qty, l.rate, l.discount_percentage])).toEqual([
			["SN-1", 1, 250, 10],
			["SN-2", 1, 250, 10],
		]);
		expect(lines[0].uid).toBe(uid);
		expect(lines[1].uid).not.toBe(uid);
		expect(cart.pendingRequirements).toEqual([]);
		expect(cart.getInvoiceData("P", "S").local_id).toBe(localId);
	});

	it("refuses a batch without enough stock and leaves the line untouched", () => {
		const cart = cartWithCustomer();
		cart.addItem(BATCH);
		cart.updateItemQty(0, 5);
		const batches = [
			{ batch_no: "B1", qty: 2 },
			{ batch_no: "B2", qty: 50 },
		];
		const refused = cart.resolveLineTracking(0, { batch: "B1", batches: batches as never });
		expect(refused.success).toBe(false);
		expect(cart.items[0].batch_no).toBe("");
		expect(cart.resolveLineTracking(0, { batch: "B2", batches: batches as never }).success).toBe(true);
		expect(cart.items[0].batch_no).toBe("B2");
		expect(cart.items[0].qty).toBe(5);
	});

	it("will not split a serial line carrying a fixed discount amount", () => {
		const cart = cartWithCustomer();
		cart.addItem(SERIAL);
		cart.addItem(SERIAL);
		cart.updateItemDiscount(0, "amount", 20);
		expect(cart.resolveLineTracking(0, { serials: ["A", "B"] }).success).toBe(false);
		expect(cart.items).toHaveLength(1);
	});
});
