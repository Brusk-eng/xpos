import { CUSTOMER_IN_GROUP, ITEM_A, ITEM_B, OPEN_SHIFT, POS_PROFILE_DOC } from "./pos";

export const SERIAL_ITEM = {
	...ITEM_A,
	item_code: "ITEM-SER",
	item_name: "Wireless Barcode Scanner",
	item_group: "Supplies",
	rate: 250,
	has_serial_no: 1,
};

export const BATCH_ITEM = {
	...ITEM_A,
	item_code: "ITEM-BAT",
	item_name: "Cold Brew Concentrate",
	item_group: "Beverages",
	rate: 12.5,
	has_batch_no: 1,
};

export const UOM_ITEM = {
	...ITEM_B,
	item_code: "ITEM-UOM",
	item_name: "Paper Cups",
	rate: 2,
};

export const SERIALS = ["SN-0001", "SN-0002", "SN-0003"];
export const BATCHES = [
	{ batch_no: "CB-2026-09", qty: 40, expiry_date: "2026-11-30" },
	{ batch_no: "CB-2026-10", qty: 60, expiry_date: "2027-01-15" },
];

export const CART_ITEMS = [ITEM_A, ITEM_B, UOM_ITEM, SERIAL_ITEM, BATCH_ITEM];

export const VAT = {
	charge_type: "On Net Total",
	account_head: "VAT - TC",
	description: "VAT",
	rate: 10,
	included_in_print_rate: 0,
};

export const PAYMENT_MODES = [
	{ mode_of_payment: "Cash", default: 1, type: "Cash" },
	{ mode_of_payment: "Card", type: "Bank", takes_reference: 1, requires_reference: 1 },
	{ mode_of_payment: "Bank Transfer", type: "Bank", takes_reference: 1 },
];

export function cartShift(profile: Record<string, unknown> = {}, shift: Record<string, unknown> = {}) {
	return {
		...OPEN_SHIFT,
		pos_profile: {
			...POS_PROFILE_DOC,
			payments: PAYMENT_MODES,
			allow_coupon_entry: 1,
			display_additional_notes: 1,
			...profile,
		},
		taxes: [VAT],
		disable_rounded_total: 0,
		...shift,
	};
}

export function itemDetail(args: Record<string, unknown>) {
	const item = CART_ITEMS.find((i) => i.item_code === args.item_code) || ITEM_A;
	return {
		...item,
		uoms:
			item.item_code === UOM_ITEM.item_code
				? [
						{ uom: "Nos", conversion_factor: 1 },
						{ uom: "Sleeve", conversion_factor: 50 },
					]
				: [{ uom: item.stock_uom, conversion_factor: 1 }],
		batches: item.has_batch_no ? BATCHES : [],
		serial_numbers: item.has_serial_no ? SERIALS : [],
	};
}

let invoiceSeq = 0;

/** A create_invoice answer the way the server shapes a paid sale. */
export function paidInvoice(args: Record<string, unknown>) {
	const data = JSON.parse(String(args.data || "{}"));
	invoiceSeq += 1;
	return {
		name: `ACC-SINV-2026-${String(900 + invoiceSeq).padStart(5, "0")}`,
		status: "Paid",
		doctype: "Sales Invoice",
		customer: data.customer,
	};
}

export function cartRoutes(profile: Record<string, unknown> = {}, shift: Record<string, unknown> = {}) {
	return {
		"xpos.api.shifts.check_open_shift": cartShift(profile, shift),
		"xpos.api.items.get_pos_items": CART_ITEMS,
		"xpos.api.items.get_items_count": CART_ITEMS.length,
		"xpos.api.items.get_stock_availability": CART_ITEMS.map((i) => ({
			item_code: i.item_code,
			actual_qty: i.actual_qty,
		})),
		"xpos.api.items.get_item_detail": itemDetail,
		"xpos.api.customers.get_customer_credit": { sources: [], loyalty_points: 0, loyalty_amount: 0 },
		"xpos.api.customers.get_customer_info": {
			...CUSTOMER_IN_GROUP,
			balance: 120,
			credit_limit: 1000,
		},
		"xpos.api.invoices.create_invoice": paidInvoice,
		"xpos.api.invoices.save_draft_invoice": { name: "ACC-SINV-2026-00800" },
	};
}
