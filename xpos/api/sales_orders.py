# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
Sales Orders & Quotations from the POS cart.

- Save the cart as a Sales Order (with an optional deposit) or as a Quotation
- Search open Sales Orders and valid Quotations
- Load what is left to bill on an order, or a quotation, back into the cart

Every endpoint needs a POS Profile the user may use with "Allow Sales Order" on, and the
documents are saved with the user's own ERPNext permissions.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from xpos.api.invoices import OPEN_ORDER_STATUSES, apply_sales_person
from xpos.api.profile_rules import get_line_rate, price_unavailable
from xpos.api.profiles import ensure_profile_allows, resolve_pos_profile
from xpos.api.utilities import get_invoice_type

OPEN_QUOTATION_STATUSES = ("Open", "Replied", "Partially Ordered")


def order_profile(pos_profile: str | None):
	pos = resolve_pos_profile(pos_profile)
	ensure_profile_allows(pos, "allow_sales_order", _("Sales Orders"))
	return pos


def parse(data: str | dict) -> dict:
	return json.loads(data) if isinstance(data, str) else (data or {})


def ensure_company(doc, pos) -> None:
	if doc.company != pos.company:
		frappe.throw(
			_("{0} {1} belongs to another company.").format(_(doc.doctype), doc.name),
			frappe.PermissionError,
		)


def search_filters(search: str | None) -> list | None:
	if not search:
		return None
	like = f"%{search}%"
	return [["name", "like", like], ["customer_name", "like", like]]


@frappe.whitelist()
def search_orders(pos_profile: str | None = None, search: str | None = None):
	"""Submitted Sales Orders of the profile's company that still have something to bill."""
	pos = order_profile(pos_profile)
	return frappe.get_list(
		"Sales Order",
		filters={
			"company": pos.company,
			"docstatus": 1,
			"status": ["in", OPEN_ORDER_STATUSES],
			"per_billed": ["<", 100],
		},
		or_filters=search_filters(search),
		fields=[
			"name",
			"customer",
			"customer_name",
			"transaction_date",
			"delivery_date",
			"grand_total",
			"advance_paid",
			"currency",
			"status",
			"per_billed",
			"per_delivered",
		],
		limit_page_length=50,
		order_by="transaction_date desc, name desc",
	)


@frappe.whitelist()
def search_quotations(pos_profile: str | None = None, search: str | None = None):
	"""Submitted customer Quotations of the profile's company that can still be taken up."""
	pos = order_profile(pos_profile)
	filters = {
		"company": pos.company,
		"docstatus": 1,
		"quotation_to": "Customer",
		"status": ["in", OPEN_QUOTATION_STATUSES],
	}
	if not cint(
		frappe.db.get_single_value("Selling Settings", "allow_sales_order_creation_for_expired_quotation")
	):
		filters["valid_till"] = [">=", nowdate()]

	return frappe.get_list(
		"Quotation",
		filters=filters,
		or_filters=search_filters(search),
		fields=[
			"name",
			"party_name as customer",
			"customer_name",
			"transaction_date",
			"valid_till",
			"grand_total",
			"currency",
			"status",
		],
		limit_page_length=50,
		order_by="transaction_date desc, name desc",
	)


def cart_line(row, **extra) -> dict:
	return {
		"item_code": row.item_code,
		"item_name": row.item_name,
		"qty": flt(row.qty),
		"uom": row.uom,
		"stock_uom": row.stock_uom,
		"conversion_factor": flt(row.conversion_factor) or 1,
		"price_list_rate": flt(row.price_list_rate) or flt(row.rate),
		"rate": flt(row.rate),
		"discount_percentage": flt(row.discount_percentage),
		"discount_amount": flt(row.discount_amount),
		"warehouse": row.get("warehouse"),
		**extra,
	}


@frappe.whitelist()
def get_order_for_cart(sales_order: str, pos_profile: str | None = None) -> dict:
	"""What is left to bill on a Sales Order, as cart lines that stay linked to the order."""
	from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice

	pos = order_profile(pos_profile)
	so = frappe.get_doc("Sales Order", sales_order)
	so.check_permission("read")
	ensure_company(so, pos)
	if so.docstatus != 1 or so.status not in OPEN_ORDER_STATUSES:
		frappe.throw(_("Sales Order {0} is not open for billing.").format(so.name))

	si = make_sales_invoice(so.name)
	if not si.items:
		frappe.throw(_("Everything on Sales Order {0} is already billed.").format(so.name))

	advance = 0.0
	if flt(so.advance_paid):
		if get_invoice_type() != "Sales Invoice":
			frappe.throw(
				_("Sales Order {0} has a deposit, which POS Invoices cannot deduct. Bill it in Desk.").format(
					so.name
				)
			)
		si.only_include_allocated_payments = 1
		si.set_advances()
		advance = sum(flt(d.advance_amount) for d in si.advances)

	return {
		"name": so.name,
		"customer": so.customer,
		"customer_name": so.customer_name,
		"currency": so.currency,
		"delivery_date": str(so.delivery_date) if so.delivery_date else None,
		"advance": advance,
		"items": [
			cart_line(row, sales_order=so.name, so_detail=row.so_detail, delivery_date=None)
			for row in si.items
		],
	}


@frappe.whitelist()
def get_quotation_for_cart(quotation: str, pos_profile: str | None = None) -> dict:
	"""A valid Quotation as cart lines; saving the cart as an order then marks it Ordered."""
	pos = order_profile(pos_profile)
	qt = frappe.get_doc("Quotation", quotation)
	qt.check_permission("read")
	ensure_company(qt, pos)
	if qt.docstatus != 1 or qt.status not in OPEN_QUOTATION_STATUSES or qt.quotation_to != "Customer":
		frappe.throw(_("Quotation {0} cannot be taken up.").format(qt.name))
	if (
		qt.valid_till
		and getdate(qt.valid_till) < getdate(nowdate())
		and not cint(
			frappe.db.get_single_value("Selling Settings", "allow_sales_order_creation_for_expired_quotation")
		)
	):
		frappe.throw(_("Quotation {0} has expired.").format(qt.name))

	return {
		"name": qt.name,
		"customer": qt.party_name,
		"customer_name": qt.customer_name,
		"currency": qt.currency,
		"items": [cart_line(row, quotation=qt.name, quotation_item=row.name) for row in qt.items],
	}


def fill_lines(doc, pos, data: dict, line_extra) -> None:
	"""Append the cart lines; prices are the price list's unless the user may change them."""
	from xpos.api.auth import user_has_pos_permission

	may_change_price = user_has_pos_permission("allow_change_price", pos_profile=pos.name)
	max_discount = flt(pos.get("max_discount_percentage_allowed"))

	for line in data.get("items") or []:
		if not line.get("item_code") or flt(line.get("qty")) <= 0:
			continue
		discount = flt(line.get("discount_percentage"))
		if max_discount and discount > max_discount:
			frappe.throw(
				_("Item {0}: Discount {1}% exceeds maximum allowed {2}%").format(
					line.get("item_code"), discount, max_discount
				)
			)
		row = doc.append(
			"items",
			{
				"item_code": line.get("item_code"),
				"qty": flt(line.get("qty")),
				"uom": line.get("uom") or line.get("stock_uom"),
				"discount_percentage": discount,
			},
		)
		if may_change_price and line.get("price_list_rate") is not None:
			row.price_list_rate = flt(line.get("price_list_rate"))
		else:
			listed = get_line_rate(
				pos.selling_price_list, row.item_code, row.uom, data.get("customer"), row.qty
			)
			if listed is None:
				price_unavailable(row.item_code, pos.selling_price_list)
			row.price_list_rate = listed
		line_extra(row, line)

	if not doc.items:
		frappe.throw(_("At least one item is required"))

	if pos.taxes_and_charges and not doc.get("taxes"):
		doc.taxes_and_charges = pos.taxes_and_charges
		doc.append_taxes_from_master()
	# the same prices the cart showed: inclusive when the profile sells tax-inclusive
	for tax in doc.get("taxes"):
		tax.included_in_print_rate = (
			1 if cint(pos.get("tax_inclusive")) and tax.charge_type != "Actual" else 0
		)


def link_quotation_line(row, line) -> None:
	"""Tie an order line to the quotation line it came from, after checking that it did."""
	if not line.get("quotation_item"):
		return
	quoted = frappe.db.get_value(
		"Quotation Item",
		line["quotation_item"],
		["parent", "item_code", "price_list_rate", "discount_percentage"],
		as_dict=True,
	)
	if not quoted or quoted.parent != line.get("quotation") or quoted.item_code != row.item_code:
		frappe.throw(
			_("Row for {0} does not belong to Quotation {1}.").format(row.item_code, line.get("quotation"))
		)
	row.prevdoc_docname = quoted.parent
	row.quotation_item = line["quotation_item"]
	# the customer was quoted this price
	row.price_list_rate = flt(quoted.price_list_rate)
	row.discount_percentage = flt(quoted.discount_percentage)


def add_notes(doc, notes: str | None) -> None:
	if notes and notes.strip():
		doc.add_comment("Comment", frappe.utils.escape_html(notes.strip()))


@frappe.whitelist()
def create_sales_order(data: str | dict) -> dict:
	"""Save the cart as a submitted Sales Order and take an optional deposit against it."""
	data = parse(data)
	pos = order_profile(data.get("pos_profile"))
	customer = data.get("customer")
	if not customer:
		frappe.throw(_("Customer is required"))

	delivery_date = data.get("delivery_date") or nowdate()
	if getdate(delivery_date) < getdate(nowdate()):
		frappe.throw(_("Delivery date cannot be in the past."))

	so = frappe.new_doc("Sales Order")
	so.update(
		{
			"customer": customer,
			"company": pos.company,
			"transaction_date": nowdate(),
			"delivery_date": delivery_date,
			"currency": pos.currency,
			"selling_price_list": pos.selling_price_list,
			"shipping_address_name": data.get("shipping_address_name") or None,
			"project": data.get("project") or pos.get("project") or None,
			"po_no": data.get("po_no") or None,
		}
	)
	if data.get("additional_discount_percentage"):
		so.additional_discount_percentage = flt(data["additional_discount_percentage"])
		so.apply_discount_on = pos.get("apply_discount_on") or "Grand Total"
	elif data.get("discount_amount"):
		so.discount_amount = flt(data["discount_amount"])
		so.apply_discount_on = pos.get("apply_discount_on") or "Grand Total"

	def order_line(row, line):
		line_date = line.get("delivery_date") or delivery_date
		if getdate(line_date) < getdate(nowdate()):
			frappe.throw(_("Delivery date cannot be in the past."))
		row.delivery_date = line_date
		row.warehouse = pos.warehouse
		if line.get("additional_notes"):
			row.pos_additional_notes = line["additional_notes"]
		link_quotation_line(row, line)

	fill_lines(so, pos, data, order_line)
	apply_sales_person(so, data.get("sales_person") or None, pos.name)

	so.insert()
	add_notes(so, data.get("notes"))
	so.submit()

	deposits = take_deposits(so, pos, data.get("deposits") or [], data.get("pos_opening_shift"))

	return {
		"name": so.name,
		"customer": so.customer,
		"customer_name": so.customer_name,
		"grand_total": so.grand_total,
		"deposit": sum(d["amount"] for d in deposits),
		"payment_entries": [d["name"] for d in deposits],
		"status": so.status,
	}


def take_deposits(so, pos, deposits: list[dict], pos_opening_shift: str | None) -> list[dict]:
	"""Record each deposit as a Payment Entry against the submitted order."""
	from xpos.api.payments import create_payment_entry

	deposits = [d for d in deposits if flt(d.get("amount")) > 0]
	if not deposits:
		return []
	if not pos_opening_shift:
		frappe.throw(_("An open shift is required to take a deposit."))

	allowed_modes = {p.mode_of_payment for p in pos.payments}
	if flt(sum(flt(d.get("amount")) for d in deposits)) - flt(so.rounded_total or so.grand_total) > 0.009:
		frappe.throw(_("The deposit cannot be more than the order total."))

	taken = []
	for deposit in deposits:
		if deposit.get("mode_of_payment") not in allowed_modes:
			frappe.throw(
				_("Mode of payment {0} is not set up on POS Profile {1}.").format(
					deposit.get("mode_of_payment"), pos.name
				)
			)
		result = create_payment_entry(
			{
				"customer": so.customer,
				"company": so.company,
				"amount": flt(deposit["amount"]),
				"mode_of_payment": deposit["mode_of_payment"],
				"reference_doctype": "Sales Order",
				"reference_name": so.name,
				"reference_no": pos_opening_shift,
				"submit": True,
			}
		)
		taken.append({"name": result["name"], "amount": flt(deposit["amount"])})
	return taken


@frappe.whitelist()
def create_quotation(data: str | dict) -> dict:
	"""Save the cart as a submitted Quotation."""
	data = parse(data)
	pos = order_profile(data.get("pos_profile"))
	customer = data.get("customer")
	if not customer:
		frappe.throw(_("Customer is required"))

	qt = frappe.new_doc("Quotation")
	qt.update(
		{
			"quotation_to": "Customer",
			"party_name": customer,
			"company": pos.company,
			"transaction_date": nowdate(),
			"valid_till": data.get("valid_till") or None,
			"currency": pos.currency,
			"selling_price_list": pos.selling_price_list,
			"shipping_address_name": data.get("shipping_address_name") or None,
		}
	)
	if data.get("additional_discount_percentage"):
		qt.additional_discount_percentage = flt(data["additional_discount_percentage"])
		qt.apply_discount_on = pos.get("apply_discount_on") or "Grand Total"
	elif data.get("discount_amount"):
		qt.discount_amount = flt(data["discount_amount"])
		qt.apply_discount_on = pos.get("apply_discount_on") or "Grand Total"

	fill_lines(qt, pos, data, lambda row, line: None)
	apply_sales_person(qt, data.get("sales_person") or None, pos.name)

	qt.insert()
	add_notes(qt, data.get("notes"))
	qt.submit()

	return {
		"name": qt.name,
		"customer": qt.party_name,
		"customer_name": qt.customer_name,
		"grand_total": qt.grand_total,
		"valid_till": str(qt.valid_till) if qt.valid_till else None,
		"status": qt.status,
	}
