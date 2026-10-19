/**
 * Sales Orders and Quotations from the cart (#181).
 *
 * Saving the cart as an order or quotation, the Sales Orders screen, and billing an order:
 * its lines stay linked and its deposit comes off what is due.
 */
import { CUSTOMER_IN_GROUP, ITEM_A, OPEN_SHIFT, POS_PROFILE_DOC } from "../fixtures/pos";
import { callsTo, lastCallTo } from "../support/frappeStub";

const SHOTS = String(Cypress.env("shotsDir") || "");

const ORDER_FOR_CART = {
	name: "SAL-ORD-0001",
	customer: CUSTOMER_IN_GROUP.name,
	customer_name: CUSTOMER_IN_GROUP.customer_name,
	currency: "USD",
	advance: 50,
	items: [
		{
			item_code: ITEM_A.item_code,
			item_name: ITEM_A.item_name,
			qty: 2,
			uom: "Nos",
			stock_uom: "Nos",
			conversion_factor: 1,
			price_list_rate: 100,
			rate: 100,
			discount_percentage: 0,
			sales_order: "SAL-ORD-0001",
			so_detail: "soi-1",
		},
	],
};

function routes(allowSalesOrder = 1): Record<string, unknown> {
	return {
		"xpos.api.shifts.check_open_shift": {
			...OPEN_SHIFT,
			pos_profile: { ...POS_PROFILE_DOC, allow_sales_order: allowSalesOrder },
		},
		"xpos.api.customers.get_customer_addresses": [
			{
				name: "ADDR-1",
				address_title: "Home",
				address_line1: "1 Main St",
				city: "Lahore",
				is_shipping_address: 1,
			},
		],
		"xpos.api.sales_orders.create_sales_order": { name: "SAL-ORD-0002", deposit: 50 },
		"xpos.api.sales_orders.create_quotation": { name: "SAL-QTN-0001" },
		"xpos.api.sales_orders.search_orders": [
			{
				name: "SAL-ORD-0001",
				customer: CUSTOMER_IN_GROUP.name,
				customer_name: CUSTOMER_IN_GROUP.customer_name,
				transaction_date: "2026-10-19",
				grand_total: 200,
				advance_paid: 50,
				per_billed: 0,
			},
		],
		"xpos.api.sales_orders.search_quotations": [],
		"xpos.api.sales_orders.get_order_for_cart": ORDER_FOR_CART,
	};
}

function openMore() {
	cy.get("[data-testid='cart-more']:visible").click();
}

describe("save the cart as a sales order or quotation", () => {
	it("is not offered when the profile does not allow sales orders", () => {
		cy.bootPos({ routes: routes(0) });
		cy.addItemToCart(ITEM_A.item_name);
		openMore();
		cy.get("[data-testid='save-as-order']").should("not.exist");
		cy.get("a[href$='/sales-orders']").should("not.exist");
	});

	it("saves the order with its delivery details and deposit, then starts a new sale", () => {
		cy.bootPos({ routes: routes() });
		cy.addItemToCart(ITEM_A.item_name);
		openMore();
		cy.get("[data-testid='save-as-order']:visible").click();

		cy.contains("[role='dialog']", "Save as Sales Order").should("be.visible");
		cy.get("[role='dialog'] textarea").type("Deliver after 5pm");
		cy.get("[data-testid='so-deposit'] input, input[data-testid='so-deposit']")
			.first()
			.clear()
			.type("50");
		if (SHOTS) cy.screenshot(`${SHOTS}/save-as-order`, { capture: "viewport" });
		cy.get("[data-testid='so-confirm']").click();

		cy.get("[role='dialog']").should("not.exist");
		cy.then(() => {
			const data = lastCallTo("xpos.api.sales_orders.create_sales_order")?.args.data as Record<
				string,
				any
			>;
			const sent = typeof data === "string" ? JSON.parse(data) : data;
			expect(sent.customer).to.eq(CUSTOMER_IN_GROUP.name);
			expect(sent.items[0]).to.include({ item_code: ITEM_A.item_code, qty: 1 });
			expect(sent.shipping_address_name).to.eq("ADDR-1");
			expect(sent.notes).to.eq("Deliver after 5pm");
			expect(sent.deposits).to.deep.eq([{ mode_of_payment: "Cash", amount: 50 }]);
			expect(sent.pos_opening_shift).to.eq(OPEN_SHIFT.pos_opening_shift.name);
		});
		cy.cartRows().should("have.length", 0);
	});

	it("saves a quotation without a deposit", () => {
		cy.bootPos({ routes: routes() });
		cy.addItemToCart(ITEM_A.item_name);
		openMore();
		cy.get("[data-testid='save-as-quotation']:visible").click();
		cy.get("[data-testid='so-deposit']").should("not.exist");
		cy.get("[data-testid='so-confirm']").click();
		cy.then(() => expect(callsTo("xpos.api.sales_orders.create_quotation")).to.have.length(1));
		cy.cartRows().should("have.length", 0);
	});
});

describe("bill a sales order from the Sales Orders screen", () => {
	it("loads what is left on the order and deducts its deposit", () => {
		cy.bootPos({ routes: routes() });
		cy.get("a[href$='/sales-orders']:visible").first().click();
		cy.get("[data-testid='so-row']").should("have.length", 1).and("contain", "SAL-ORD-0001");
		if (SHOTS) cy.screenshot(`${SHOTS}/sales-orders-screen`, { capture: "viewport" });
		cy.get("[data-testid='so-load']").click();

		cy.location("pathname").should("match", /\/pos$/);
		cy.get("[data-testid='cart-source-doc']:visible").should("contain", "SAL-ORD-0001");
		cy.get("[data-testid='cart-deposit']:visible").should("contain", "50");
		cy.get("[data-testid='cart-grand-total']:visible").should("contain", "150");
		if (SHOTS) cy.screenshot(`${SHOTS}/billing-order-cart`, { capture: "viewport" });

		openMore();
		cy.get("[data-testid='save-as-order']:visible").should("be.disabled");
	});
});
