import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

from xpos.api.items import (
	get_invoice_type,
	get_pending_pos_batch_qty_map,
	get_pending_pos_qty_map,
)
from xpos.x_pos.api.item_processing.stock import (
	get_bulk_stock_availability,
)


def is_stock_item(item):
	"""Return True when the provided row represents a stock item."""

	if item is None:
		return False

	flag = item.get("is_stock_item")
	if flag is not None:
		return bool(cint(flag))

	item_code = item.get("item_code")
	if not item_code:
		return False

	return bool(cint(frappe.get_cached_value("Item", item_code, "is_stock_item") or 0))


def allow_negative_stock(item, global_allow_negative=None):
	"""Return True if negative stock is allowed globally or for the item."""

	# Global setting overrides everything
	if global_allow_negative is None:
		global_allow_negative = cint(
			frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
		)

	if global_allow_negative:
		return True

	flag = item.get("allow_negative_stock")
	if flag is None and item.get("item_code"):
		flag = frappe.get_cached_value("Item", item.get("item_code"), "allow_negative_stock")

	return bool(cint(flag or 0))


def collect_stock_errors(items, pos_profile=None):
	"""Return list of items exceeding available stock."""
	errors = []
	items_to_check = []

	global_allow_negative = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0)

	for d in items:
		if flt(d.get("qty")) < 0:
			continue
		if not is_stock_item(d):
			continue
		if allow_negative_stock(d, global_allow_negative=global_allow_negative):
			continue
		items_to_check.append(d)

	if not items_to_check:
		return []

	stock_map = get_bulk_stock_availability(items_to_check)

	pending_map: dict[tuple[str, str], float] = {}
	pending_batch_map: dict[tuple[str, str], float] = {}
	if pos_profile:
		if get_invoice_type() == "POS Invoice":
			wh_items: dict[str, list[str]] = {}
			wh_batches: dict[str, list[str]] = {}
			for d in items_to_check:
				wh = d.get("warehouse")
				if not wh:
					continue
				wh_items.setdefault(wh, []).append(d.get("item_code"))
				if d.get("batch_no"):
					wh_batches.setdefault(wh, []).append(cstr(d.get("batch_no")))
			for wh, codes in wh_items.items():
				wh_list = [wh]
				if frappe.db.get_value("Warehouse", wh, "is_group"):
					wh_list = frappe.db.get_descendants("Warehouse", wh) or []
				pmap = get_pending_pos_qty_map(wh_list, item_codes=codes)
				for ic, qty in pmap.items():
					pending_map[(ic, wh)] = pending_map.get((ic, wh), 0.0) + qty

				batches = wh_batches.get(wh)
				if not batches:
					continue

				bmap = get_pending_pos_batch_qty_map(wh_list, batch_nos=batches)
				for (batch_no, _wh), qty in bmap.items():
					key = (batch_no, wh)
					pending_batch_map[key] = pending_batch_map.get(key, 0.0) + qty

	for d in items_to_check:
		item_code = d.get("item_code")
		warehouse = d.get("warehouse")
		batch_no = cstr(d.get("batch_no"))

		available = stock_map.get((item_code, warehouse, batch_no), 0.0)
		if batch_no:
			available -= pending_batch_map.get((batch_no, warehouse), 0.0)
		else:
			available -= pending_map.get((item_code, warehouse), 0.0)
		requested = flt(d.get("stock_qty") or (flt(d.get("qty")) * flt(d.get("conversion_factor") or 1)))
		if requested > available:
			errors.append(
				{
					"item_code": item_code,
					"warehouse": warehouse,
					"requested_qty": requested,
					"available_qty": available,
				}
			)
	return errors


def should_block(pos_profile):
	allow_negative = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0)
	if allow_negative:
		return False

	block_sale = None
	if pos_profile:
		block_sale = frappe.db.get_value("POS Profile", pos_profile, "block_sale_beyond_available_qty")
	return True if block_sale is None else bool(cint(block_sale))


def validate_stock_on_invoice(invoice_doc):
	if invoice_doc.doctype == "Sales Invoice" and not cint(getattr(invoice_doc, "update_stock", 0)):
		return

	items_to_check = [d.as_dict() for d in invoice_doc.items]
	if hasattr(invoice_doc, "packed_items"):
		items_to_check.extend([d.as_dict() for d in invoice_doc.packed_items])
	pos_profile = getattr(invoice_doc, "pos_profile", None)
	errors = collect_stock_errors(items_to_check, pos_profile=pos_profile)
	if errors and should_block(pos_profile):
		throw_insufficient_stock(errors)


class XPosInsufficientStockError(frappe.ValidationError):
	"""Raised when a sale would take stock below zero."""


def throw_insufficient_stock(errors) -> None:
	"""Raise a cashier-readable error for rows that exceed available stock."""

	rows = "".join(
		_("<li>{0} in {1}: requested {2}, available {3}</li>").format(
			frappe.bold(e.get("item_code")),
			frappe.bold(e.get("warehouse")),
			frappe.bold(flt(e.get("requested_qty"), 2)),
			frappe.bold(flt(e.get("available_qty"), 2)),
		)
		for e in errors
	)
	frappe.throw(
		_("Not enough stock to complete this sale.<br><ul>{0}</ul>").format(rows),
		XPosInsufficientStockError,
		title=_("Insufficient Stock"),
	)
