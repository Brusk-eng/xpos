from typing import Any

import frappe
from frappe.utils import cint, cstr, flt


def get_scale_barcode_settings():
	"""Return the Scale Barcode Settings single document"""
	return frappe.get_cached_doc("Scale Barcode Settings")


def extract_numeric_segment(barcode: str, start: int, length: int, decimals: int = 0):
	"""Extract a numeric value from ``barcode`` using 1-indexed ``start`` and ``length``."""

	if not (start and length):
		return None

	start_index = max(start - 1, 0)
	end_index = start_index + max(length, 0)
	if len(barcode) < end_index:
		return None

	whole = barcode[start_index:end_index]
	decimal_part = ""
	if decimals and decimals > 0:
		decimal_end = end_index + decimals
		if len(barcode) < decimal_end:
			return None
		decimal_part = barcode[end_index:decimal_end]

	number_str = whole
	if decimal_part:
		number_str = f"{whole}.{decimal_part}"

	try:
		return flt(number_str)
	except Exception:
		return None


def parse_scale_barcode_data(barcode: str) -> dict[str, Any] | None:
	"""Parse barcode data according to the configured scale barcode settings."""

	barcode_value = cstr(barcode or "").strip()
	if not barcode_value:
		return None

	settings = get_scale_barcode_settings()
	if not settings:
		return None

	prefix_included = cint(settings.prefix_included_or_not)
	prefix_length = cint(settings.no_of_prefix_characters) if prefix_included else 0
	prefix_value = cstr(settings.prefix or "").strip()

	if prefix_value and not barcode_value.startswith(prefix_value):
		return None

	if prefix_included and prefix_length and len(barcode_value) < prefix_length:
		return None

	item_start = cint(settings.item_code_starting_digit)
	item_digits = cint(settings.item_code_total_digits)
	if not (item_start and item_digits):
		return None

	item_start_index = max(item_start - 1, 0)
	item_end_index = item_start_index + item_digits
	if len(barcode_value) < item_end_index:
		return None

	item_code = barcode_value[item_start_index:item_end_index]
	data: dict[str, Any] = {"barcode": barcode_value, "item_code": item_code}

	qty = extract_numeric_segment(
		barcode_value,
		cint(settings.weight_starting_digit),
		cint(settings.weight_total_digits),
		cint(settings.weight_decimals),
	)
	if qty is not None:
		data["qty"] = qty

	if cint(settings.price_included_in_barcode_or_not):
		price = extract_numeric_segment(
			barcode_value,
			cint(settings.price_starting_digit),
			cint(settings.price_total_digit),
			cint(settings.price_decimals),
		)
		if price is not None:
			data["price"] = price

	return data


@frappe.whitelist()
def search_serial_or_batch_or_barcode_number(
	search_value: str, search_serial_no: bool = False, search_batch_no: bool = False
):
	"""Search for items by serial number, batch number, or barcode."""
	barcode_data = frappe.db.get_value(
		"Item Barcode",
		{"barcode": search_value},
		["parent as item_code", "barcode"],
		as_dict=True,
	)
	if barcode_data:
		return {"item_code": barcode_data.item_code, "barcode": barcode_data.barcode}

	if search_batch_no:
		batch_data = frappe.db.get_value(
			"Batch",
			{"name": search_value},
			["item as item_code", "name as batch_no"],
			as_dict=True,
		)
		if batch_data:
			return {
				"item_code": batch_data.item_code,
				"batch_no": batch_data.batch_no,
			}

	if search_serial_no:
		serial_data = frappe.db.get_value(
			"Serial No",
			{"name": search_value},
			["item_code", "name as serial_no"],
			as_dict=True,
		)
		if serial_data:
			return {
				"item_code": serial_data.item_code,
				"serial_no": serial_data.serial_no,
			}

	return {}
