/**
 * @vitest-environment jsdom
 *
 * Billing a Sales Order or taking up a Quotation from the cart (#181).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/services/api", () => ({ call: vi.fn(), default: { call: vi.fn() } }));

const pos = {
	taxes: [] as unknown[],
	taxInclusiveMode: false,
	disableRoundedTotal: false,
	profile: { name: "P", warehouse: "W", currency: "USD" },
	currency: "USD",
	tenderModeFor: vi.fn(() => undefined),
};
vi.mock("@/stores/posStore", () => ({ usePosStore: vi.fn(() => pos) }));

import { useCartStore } from "@/stores/cartStore";
import type { OrderForCart } from "@/types/pos.types";

function order(overrides: Partial<OrderForCart> = {}): OrderForCart {
	return {
		name: "SO-1",
		customer: "C1",
		customer_name: "Ada",
		currency: "USD",
		advance: 100,
		items: [
			{
				item_code: "ITEM-1",
				item_name: "Chair",
				qty: 2,
				uom: "Nos",
				stock_uom: "Nos",
				conversion_factor: 1,
				price_list_rate: 100,
				rate: 90,
				discount_percentage: 10,
				sales_order: "SO-1",
				so_detail: "SOI-1",
			},
		],
		...overrides,
	};
}

beforeEach(() => setActivePinia(createPinia()));

describe("loading a Sales Order", () => {
	it("bills the remaining lines at the order's price, linked to the order", () => {
		const cart = useCartStore();
		cart.loadSalesOrder(order());

		expect(cart.customer?.name).toBe("C1");
		expect(cart.items[0]).toMatchObject({ rate: 100, discount_percentage: 10, so_detail: "SOI-1" });
		const line = cart.getInvoiceData("P", "SHIFT").items[0];
		expect(line).toMatchObject({ sales_order: "SO-1", so_detail: "SOI-1", price_list_rate: 100 });
	});

	it("deducts the deposit from what is due", () => {
		const cart = useCartStore();
		cart.loadSalesOrder(order());

		expect(cart.depositApplied).toBe(100);
		expect(cart.grandTotal).toBe(80); // 2 × 90 − 100
	});

	it("never deducts more than the sale is worth", () => {
		const cart = useCartStore();
		cart.loadSalesOrder(order({ advance: 500 }));

		expect(cart.depositApplied).toBe(180);
		expect(cart.grandTotal).toBe(0);
	});

	it("forgets the order when the cart is cleared", () => {
		const cart = useCartStore();
		cart.loadSalesOrder(order());
		cart.clearCart();

		expect(cart.sourceOrder).toBeNull();
		expect(cart.depositApplied).toBe(0);
	});
});

describe("without an order", () => {
	it("leaves a return's negative total alone", () => {
		const cart = useCartStore();
		cart.enterReturnMode("SINV-1");
		cart.items.push({
			...order().items[0],
			qty: -2,
			so_detail: undefined,
			sales_order: undefined,
		} as never);

		expect(cart.depositApplied).toBe(0);
		expect(cart.grandTotal).toBeLessThan(0);
	});
});

describe("loading a Quotation", () => {
	it("keeps the quotation line on each cart line and takes no deposit", () => {
		const cart = useCartStore();
		cart.loadQuotation(
			order({
				name: "QTN-1",
				advance: undefined,
				items: [
					{
						...order().items[0],
						sales_order: undefined,
						so_detail: undefined,
						quotation: "QTN-1",
						quotation_item: "QI-1",
					},
				],
			}),
		);

		expect(cart.sourceQuotation).toBe("QTN-1");
		expect(cart.depositApplied).toBe(0);
		expect(cart.getInvoiceData("P", "SHIFT").items[0]).toMatchObject({
			quotation: "QTN-1",
			quotation_item: "QI-1",
		});
	});
});
