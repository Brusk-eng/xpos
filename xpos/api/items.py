# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.utils import cint, flt, getdate, nowdate


@frappe.whitelist()
def get_pos_items(
	pos_profile: str,
	search_term: str = "",
	item_group: str = "",
	start: int = 0,
	page_length: int = 40,
	include_templates: bool = False,
):
	pos = frappe.get_cached_doc("POS Profile", pos_profile)
	warehouse = pos.warehouse

	filters = {"disabled": 0, "is_sales_item": 1}

	if not (include_templates or pos.get("show_template_items")):
		filters["has_variants"] = 0
	elif pos.get("hide_variants_items"):
		filters["variant_of"] = ["in", ["", None]]

	if item_group and item_group != "All Item Groups":
		lft, rgt = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"])
		groups = frappe.get_all("Item Group", filters={"lft": [">=", lft], "rgt": ["<=", rgt]}, pluck="name")
		filters["item_group"] = ["in", groups]

	or_filters = []
	if search_term:
		search_term = f"%{search_term.strip()}%"
		or_filters = [
			["name", "like", search_term],
			["item_name", "like", search_term],
			["item_code", "like", search_term],
			["local_item_name", "like", search_term],
		]

	hide_unavailable = pos.get("hide_unavailable_items") and warehouse

	if hide_unavailable:
		wh_list = [warehouse]
		if frappe.db.get_value("Warehouse", warehouse, "is_group"):
			wh_list = frappe.db.get_descendants("Warehouse", warehouse) or []

		in_stock_items = frappe.get_all(
			"Bin",
			filters={"warehouse": ["in", wh_list], "actual_qty": [">", 0]},
			pluck="item_code",
		)
		non_stock_items = frappe.get_all(
			"Item",
			filters={"is_stock_item": 0, "disabled": 0, "is_sales_item": 1},
			pluck="name",
		)
		available_items = list(set(in_stock_items + non_stock_items))
		if not available_items:
			return []
		filters["name"] = ["in", available_items]

	items = frappe.get_list(
		"Item",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name as item_code",
			"item_name",
			"local_item_name",
			"item_group",
			"stock_uom",
			"image",
			"description",
			"has_batch_no",
			"has_serial_no",
			"has_variants",
			"variant_of",
			"is_stock_item",
			"brand",
			"max_discount",
		],
		order_by="item_name asc",
		limit_start=cint(start),
		limit_page_length=cint(page_length),
	)

	price_list = pos.selling_price_list or frappe.db.get_single_value(
		"Selling Settings", "selling_price_list"
	)

	for item in items:
		item.rate = (
			frappe.db.get_value(
				"Item Price",
				{"item_code": item.item_code, "price_list": price_list, "selling": 1},
				"price_list_rate",
			)
			or 0
		)

		item.actual_qty = get_stock_qty(item.item_code, warehouse) if warehouse else 0

	return items


@frappe.whitelist()
def get_items_count(pos_profile: str, search_term: str = "", item_group: str = ""):
	"""Get total count of items matching the filters."""
	pos = frappe.get_cached_doc("POS Profile", pos_profile)

	conditions = "i.disabled = 0 AND i.is_sales_item = 1 AND i.has_variants = 0"
	values = {}
	bin_join = ""

	if pos.get("hide_unavailable_items") and pos.warehouse:
		bin_join = "LEFT JOIN `tabBin` bin ON bin.item_code = i.name AND bin.warehouse = %(warehouse)s"
		conditions += " AND (i.is_stock_item = 0 OR bin.actual_qty > 0)"
		values["warehouse"] = pos.warehouse

	if item_group and item_group != "All Item Groups":
		ig = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"], as_dict=True)
		if ig:
			conditions += " AND i.item_group IN (SELECT name FROM `tabItem Group` WHERE lft >= %(lft)s AND rgt <= %(rgt)s)"
			values["lft"] = ig.lft
			values["rgt"] = ig.rgt

	if search_term:
		search_term = search_term.strip()
		conditions += """ AND (
			i.name LIKE %(search)s
			OR i.item_name LIKE %(search)s
            OR COALESCE(i.local_item_name, '') LIKE %(search)s
			OR i.item_code LIKE %(search)s
		)"""
		values["search"] = f"%{search_term}%"

	sql = "SELECT COUNT(DISTINCT i.name) FROM `tabItem` i {bin_join} WHERE {conditions}".format(
		bin_join=bin_join, conditions=conditions
	)
	count = frappe.db.sql(
		sql,
		values,
	)
	return count[0][0] if count else 0


@frappe.whitelist()
def get_item_groups():
	"""Get all item groups in a tree structure."""
	groups = frappe.get_all(
		"Item Group",
		filters={"is_group": 0},
		fields=["name", "parent_item_group", "image"],
		order_by="name asc",
		limit_page_length=0,
	)
	parent_groups = frappe.get_all(
		"Item Group",
		filters={"is_group": 1},
		fields=["name", "parent_item_group", "image"],
		order_by="lft asc",
		limit_page_length=0,
	)
	return {"groups": groups, "parent_groups": parent_groups}


@frappe.whitelist()
def search_barcode(barcode: str, pos_profile: str | None = None):
	"""Search item by barcode.

	Also supports scale barcodes (weighted items) if configured on the POS Profile.
	"""
	if not barcode:
		return None

	price_list = None
	pos = None
	warehouse = None
	if pos_profile:
		pos = frappe.get_cached_doc("POS Profile", pos_profile)
		price_list = pos.selling_price_list
		warehouse = pos.warehouse
	if not price_list:
		price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")

	def _get_item_rate(item_code):
		rate = (
			frappe.db.get_value(
				"Item Price",
				{"item_code": item_code, "price_list": price_list, "selling": 1},
				"price_list_rate",
			)
			if price_list
			else 0
		)
		return flt(rate)

	barcode_data = frappe.db.get_value(
		"Item Barcode",
		{"barcode": barcode},
		["parent as item_code", "barcode", "uom"],
		as_dict=True,
	)

	if barcode_data:
		item = frappe.get_cached_doc("Item", barcode_data.item_code)
		return {
			"item_code": item.name,
			"item_name": item.item_name,
			"local_item_name": item.get("local_item_name"),
			"barcode": barcode_data.barcode,
			"uom": barcode_data.uom or item.stock_uom,
			"stock_uom": item.stock_uom,
			"rate": _get_item_rate(item.name),
			"has_batch_no": item.has_batch_no,
			"has_serial_no": item.has_serial_no,
			"image": item.image,
			"actual_qty": get_stock_qty(item.name, warehouse) if warehouse else 0,
		}

	if frappe.db.exists("Item", barcode):
		item = frappe.get_cached_doc("Item", barcode)
		return {
			"item_code": item.name,
			"item_name": item.item_name,
			"local_item_name": item.get("local_item_name"),
			"barcode": barcode,
			"uom": item.stock_uom,
			"stock_uom": item.stock_uom,
			"rate": _get_item_rate(item.name),
			"has_batch_no": item.has_batch_no,
			"has_serial_no": item.has_serial_no,
			"image": item.image,
			"actual_qty": get_stock_qty(item.name, warehouse) if warehouse else 0,
		}

	if pos_profile:
		result = _parse_scale_barcode(barcode, pos_profile)
		if result:
			result["rate"] = _get_item_rate(result["item_code"])
			return result

	return None


@frappe.whitelist()
def get_item_detail(
	item_code: str,
	pos_profile: str,
	warehouse: str | None = None,
	price_list: str | None = None,
	customer: str | None = None,
):
	"""Get detailed info for a single item including batches, serial nos, UOMs, and pricing."""
	pos = frappe.get_cached_doc("POS Profile", pos_profile)
	warehouse = warehouse or pos.warehouse
	price_list = price_list or pos.selling_price_list
	today = nowdate()

	item = frappe.get_cached_doc("Item", item_code)
	result = {
		"item_code": item.name,
		"item_name": item.item_name,
		"local_item_name": item.get("local_item_name"),
		"description": item.description,
		"stock_uom": item.stock_uom,
		"image": item.image,
		"item_group": item.item_group,
		"brand": item.brand,
		"has_batch_no": item.has_batch_no,
		"has_serial_no": item.has_serial_no,
		"has_variants": item.has_variants,
		"is_stock_item": item.is_stock_item,
		"max_discount": item.max_discount,
		"allow_negative_stock": item.allow_negative_stock,
	}

	rate = frappe.db.get_value(
		"Item Price",
		{
			"item_code": item_code,
			"price_list": price_list,
			"selling": 1,
		},
		"price_list_rate",
	)
	result["rate"] = flt(rate)

	result["actual_qty"] = get_stock_qty(item_code, warehouse) if warehouse else 0

	batch_no_data = []
	if item.has_batch_no and warehouse:
		batch_no_data = _get_batch_data(item_code, warehouse, today)
	result["batch_no_data"] = batch_no_data

	serial_no_data = []
	if item.has_serial_no and warehouse:
		serial_no_data = frappe.get_all(
			"Serial No",
			filters={
				"item_code": item_code,
				"status": "Active",
				"warehouse": warehouse,
			},
			fields=["name as serial_no", "batch_no"],
		)
	result["serial_no_data"] = serial_no_data

	uoms = frappe.get_all(
		"UOM Conversion Detail",
		filters={"parent": item_code},
		fields=["uom", "conversion_factor"],
	)
	stock_uom_exists = any(u.get("uom") == item.stock_uom for u in uoms)
	if not stock_uom_exists:
		uoms.append({"uom": item.stock_uom, "conversion_factor": 1.0})
	result["item_uoms"] = uoms

	barcodes = frappe.get_all(
		"Item Barcode",
		filters={"parent": item_code},
		fields=["barcode", "uom"],
	)
	result["item_barcode"] = barcodes

	return result


@frappe.whitelist()
def get_item_variants(
	pos_profile: str,
	parent_item_code: str,
	price_list: str | None = None,
	customer: str | None = None,
):
	"""Return all variants of a template item with attribute metadata."""
	pos = frappe.get_cached_doc("POS Profile", pos_profile)
	price_list = price_list or pos.selling_price_list
	warehouse = pos.warehouse

	variants = frappe.get_all(
		"Item",
		filters={"variant_of": parent_item_code, "disabled": 0},
		fields=[
			"name as item_code",
			"item_name",
			"local_item_name",
			"description",
			"stock_uom",
			"image",
			"item_group",
			"has_batch_no",
			"has_serial_no",
			"is_stock_item",
			"brand",
			"max_discount",
		],
		order_by="item_name asc",
	)

	if not variants:
		return {"variants": [], "attributes_meta": {}}

	for v in variants:
		rate = frappe.db.get_value(
			"Item Price",
			{"item_code": v["item_code"], "price_list": price_list, "selling": 1},
			"price_list_rate",
		)
		v["rate"] = flt(rate)
		v["actual_qty"] = get_stock_qty(v["item_code"], warehouse) if warehouse else 0

	from collections import defaultdict

	variant_codes = [v["item_code"] for v in variants]
	attr_rows = frappe.get_all(
		"Item Variant Attribute",
		filters={"parent": ["in", variant_codes]},
		fields=["parent", "attribute", "attribute_value"],
	)

	attributes_meta = defaultdict(set)
	item_attr_map = defaultdict(list)
	for row in attr_rows:
		attributes_meta[row.attribute].add(row.attribute_value)
		item_attr_map[row.parent].append(
			{
				"attribute": row.attribute,
				"attribute_value": row.attribute_value,
			}
		)

	attributes_meta = {k: sorted(v) for k, v in attributes_meta.items()}
	for v in variants:
		v["item_attributes"] = item_attr_map.get(v["item_code"], [])

	return {"variants": variants, "attributes_meta": attributes_meta}


@frappe.whitelist()
def get_item_attributes(item_code: str):
	"""Get item attribute definitions for variant selection."""
	return frappe.get_all(
		"Item Attribute",
		fields=["name", "attribute_name"],
		filters={
			"name": [
				"in",
				[
					attr.attribute
					for attr in frappe.get_all(
						"Item Variant Attribute",
						fields=["attribute"],
						filters={"parent": item_code},
					)
				],
			]
		},
	)


@frappe.whitelist()
def get_stock_availability(items: str | list, warehouse: str | None = None):
	"""Bulk-fetch stock for multiple items.

	Accepts two calling conventions:
	1. items = JSON list of item-code strings + warehouse as a separate param.
	2. items = JSON list of dicts with item_code, warehouse, and optional batch_no.

	Returns:
	        list of {"item_code": str, "actual_qty": float}
	"""
	if isinstance(items, str):
		items = json.loads(items)
	if not items:
		return []

	results = []
	for d in items:
		if isinstance(d, str):
			item_code = d
			item_warehouse = warehouse
			batch_no = ""
		else:
			item_code = d.get("item_code")
			item_warehouse = d.get("warehouse") or warehouse
			batch_no = d.get("batch_no", "")

		if not item_code or not item_warehouse:
			continue

		if batch_no:
			from erpnext.stock.doctype.batch.batch import get_batch_qty

			qty = flt(get_batch_qty(batch_no, item_warehouse))
		else:
			qty = flt(get_stock_qty(item_code, item_warehouse))

		results.append({"item_code": item_code, "actual_qty": qty})

	return results


@frappe.whitelist()
def update_price_list_rate(item_code: str, price_list: str, rate: float, uom: str | None = None):
	"""Create or update an Item Price record."""
	filters = {"item_code": item_code, "price_list": price_list, "selling": 1}
	if uom:
		filters["uom"] = uom

	existing = frappe.db.get_value("Item Price", filters, "name")
	if existing:
		frappe.db.set_value("Item Price", existing, "price_list_rate", flt(rate))
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": item_code,
				"price_list": price_list,
				"selling": 1,
				"price_list_rate": flt(rate),
				"uom": uom,
			}
		)
		doc.insert(ignore_permissions=True)

	return {"success": True, "rate": flt(rate)}


@frappe.whitelist()
def get_price_for_uom(item_code: str, price_list: str, uom: str):
	"""Return Item Price for a specific UOM."""
	rate = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": price_list, "selling": 1, "uom": uom},
		"price_list_rate",
	)
	return flt(rate) if rate else None


def get_stock_qty(item_code: str, warehouse: str):
	"""Get actual qty from Bin, supporting warehouse groups."""
	if not warehouse:
		return 0

	warehouses = [warehouse]
	if frappe.db.get_value("Warehouse", warehouse, "is_group"):
		warehouses = frappe.db.get_descendants("Warehouse", warehouse) or []

	from frappe.query_builder import DocType
	from frappe.query_builder.functions import Sum

	Bin = DocType("Bin")
	rows = (
		frappe.qb.from_(Bin)
		.select(Sum(Bin.actual_qty).as_("actual_qty"))
		.where(Bin.item_code == item_code)
		.where(Bin.warehouse.isin(warehouses))
		.run(as_dict=True)
	)
	return flt(rows[0].actual_qty) if rows else 0


def _get_batch_data(item_code: str, warehouse: str, today: str | None = None):
	"""Fetch available (non-expired) batches for an item in warehouse."""
	today = today or nowdate()
	batches = frappe.db.sql(
		"""
		SELECT
			sle.batch_no,
			SUM(sle.actual_qty) AS batch_qty,
			b.expiry_date,
			b.manufacturing_date
		FROM `tabStock Ledger Entry` sle
		INNER JOIN `tabBatch` b ON b.name = sle.batch_no
		WHERE sle.item_code = %(item_code)s
			AND sle.warehouse = %(warehouse)s
			AND sle.is_cancelled = 0
			AND sle.batch_no IS NOT NULL
		GROUP BY sle.batch_no
		HAVING batch_qty > 0
		ORDER BY b.expiry_date ASC, b.creation ASC
		""",
		{"item_code": item_code, "warehouse": warehouse},
		as_dict=True,
	)

	result = []
	for batch in batches:
		if batch.expiry_date and getdate(batch.expiry_date) < getdate(today):
			continue

		result.append(
			{
				"batch_no": batch.batch_no,
				"batch_qty": flt(batch.batch_qty),
				"expiry_date": batch.expiry_date,
				"manufacturing_date": batch.manufacturing_date,
			}
		)
	return result


def _parse_scale_barcode(barcode: str, pos_profile: str):
	"""Parse scale barcodes for weighted items (e.g. deli scale barcodes)."""
	try:
		settings = frappe.get_all(
			"Scale Barcode Settings",
			filters={"pos_profile": pos_profile},
			fields=[
				"barcode_prefix",
				"item_code_start",
				"item_code_end",
				"qty_start",
				"qty_end",
				"qty_decimals",
			],
			limit=1,
		)
		if not settings:
			return None

		s = settings[0]
		prefix = s.get("barcode_prefix", "")
		if prefix and not barcode.startswith(prefix):
			return None

		ic_start = cint(s.get("item_code_start", 0))
		ic_end = cint(s.get("item_code_end", 0))
		qty_start = cint(s.get("qty_start", 0))
		qty_end = cint(s.get("qty_end", 0))
		qty_decimals = cint(s.get("qty_decimals", 3))

		if not ic_start or not ic_end or not qty_start or not qty_end:
			return None

		item_barcode = barcode[ic_start:ic_end]
		qty_str = barcode[qty_start:qty_end]

		barcode_data = frappe.db.get_value(
			"Item Barcode",
			{"barcode": item_barcode},
			["parent as item_code", "barcode", "uom"],
			as_dict=True,
		)
		if not barcode_data:
			return None

		qty = flt(qty_str) / (10**qty_decimals) if qty_str else 0

		item = frappe.get_cached_doc("Item", barcode_data.item_code)
		return {
			"item_code": item.name,
			"item_name": item.item_name,
			"barcode": barcode_data.barcode,
			"uom": barcode_data.uom or item.stock_uom,
			"has_batch_no": item.has_batch_no,
			"has_serial_no": item.has_serial_no,
			"qty": qty,
			"is_scale_barcode": True,
		}
	except Exception:
		return None
