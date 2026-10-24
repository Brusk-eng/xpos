# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Read-only bootstrap for the XPOS Mobile (Android) app.

The browser gets its boot data from server-rendered HTML; a native shell has no page, so it asks
once, right after a normal Frappe login. Nothing here is accepted from the client except an
optional POS Profile *name*, and everything returned is derived from existing checks.
"""

import math
import time
from decimal import Decimal

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from xpos.api.auth import get_my_pos_permissions
from xpos.api.customers import require_customer_access
from xpos.api.profile_rules import get_line_rate, resolve_selling_price_list
from xpos.api.profiles import resolve_pos_profile
from xpos.api.shifts import get_open_shift_rows
from xpos.api.taxes import get_item_tax_template
from xpos.api.utilities import get_invoice_type

SUPPORTED_MAJOR = 16
# Longest the app may accept offline unlock before it must reach the server again.
LEASE_TTL_SECONDS = 24 * 60 * 60
MAX_MINOR_DIGITS = 4


def major_version(version: str | None) -> int | None:
	try:
		return int(str(version).split(".")[0])
	except (TypeError, ValueError):
		return None


def minor_digits_for(currency: str | None) -> int:
	"""Minor units for a currency, from its smallest fraction (0.01 -> 2, 0.001 -> 3, none -> 2)."""
	fraction = (
		frappe.get_cached_value("Currency", currency, "smallest_currency_fraction_value")
		if currency
		else None
	)
	if not fraction:
		return 2
	value = Decimal(str(fraction))
	if value <= 0 or value >= 1:
		return 0
	return min(MAX_MINOR_DIGITS, max(0, math.ceil(-math.log10(value))))


def erpnext_version() -> str | None:
	try:
		return frappe.get_attr("erpnext.__version__")
	except Exception:
		return None


def profile_choices(user: str) -> list[dict]:
	"""Enabled POS Profiles the user is listed on (the same boundary resolve_pos_profile enforces)."""
	return frappe.db.sql(
		"""
		SELECT DISTINCT p.name, p.company, p.warehouse
		FROM `tabPOS Profile` p
		INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
		WHERE p.disabled = 0 AND u.user = %(user)s
		ORDER BY p.name
		""",
		{"user": user},
		as_dict=True,
	)


def payment_modes_for(profile_name: str) -> list[dict]:
	"""Payment modes configured on the profile, with the Mode of Payment type (Cash / Bank / General)."""
	rows = frappe.get_all(
		"POS Payment Method",
		filters={"parent": profile_name, "parenttype": "POS Profile"},
		fields=["mode_of_payment", "default"],
		order_by="idx",
	)
	for row in rows:
		row["type"] = frappe.get_cached_value("Mode of Payment", row["mode_of_payment"], "type")
		row["default"] = bool(row["default"])
	return rows


def open_shift_for(user: str, profile_name: str) -> str | None:
	"""Name of the user's open POS Opening Shift on this profile, if any."""
	for shift in get_open_shift_rows(user):
		if shift.get("pos_profile") == profile_name:
			return shift.get("name")
	return None


@frappe.whitelist(methods=["GET", "POST"])
def bootstrap(pos_profile: str | None = None) -> dict:
	"""Authorized context for the signed-in cashier; denied for guests and unassigned users."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)

	# Existing boundary: the profile must list this user (or the user is a superuser).
	profile = resolve_pos_profile(pos_profile, user)

	frappe_version = frappe.__version__
	erp_version = erpnext_version()  # never the Frappe version: None means "could not be determined"
	currency = profile.get("currency") or frappe.get_cached_value(
		"Company", profile.company, "default_currency"
	)

	return {
		"user": user,
		"full_name": frappe.get_cached_value("User", user, "full_name"),
		"site": frappe.local.site,
		"pos_profile": profile.name,
		"company": profile.company,
		"warehouse": profile.warehouse,
		"currency": currency,
		"price_list": profile.get("selling_price_list")
		or frappe.db.get_single_value("Selling Settings", "selling_price_list"),
		"customer": profile.get("customer"),
		"profiles": profile_choices(user),
		"payment_modes": payment_modes_for(profile.name),
		"open_shift": open_shift_for(user, profile.name),
		"minor_digits": minor_digits_for(currency),
		"permissions": get_my_pos_permissions(profile.name),
		"frappe_version": frappe_version,
		"erpnext_version": erp_version,
		"supported": major_version(erp_version) == SUPPORTED_MAJOR
		and major_version(frappe_version) == SUPPORTED_MAJOR,
		"lease_ttl_seconds": LEASE_TTL_SECONDS,
		"issued_at": int(time.time() * 1000),
	}


MAX_QUOTE_LINES = 200


@frappe.whitelist(methods=["POST"])
def quote_sale(pos_profile: str, items: str | list, customer: str | None = None) -> dict:
	"""What ERPNext would charge for these lines: prices, item tax templates, taxes and the amount to collect.

	Computed in memory on an unsaved document, so nothing is written, no stock is touched and no fiscal
	service is called. ``create_invoice`` stays authoritative: it re-prices on save and refuses a sale
	whose rates moved. Quantities are decimals, so the client converts from its integer thousandths.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	pos = resolve_pos_profile(pos_profile)
	lines = frappe.parse_json(items) if isinstance(items, str) else items
	if not isinstance(lines, list) or not lines or len(lines) > MAX_QUOTE_LINES:
		frappe.throw(_("A quote needs between 1 and {0} lines.").format(MAX_QUOTE_LINES))

	customer = customer or pos.get("customer")
	if not customer:
		frappe.throw(_("Customer is required"))
	require_customer_access(customer, "read", pos.name)

	currency = pos.get("currency") or frappe.get_cached_value("Company", pos.company, "default_currency")
	price_list = resolve_selling_price_list(pos, customer)
	doc = frappe.new_doc(get_invoice_type())
	doc.update(
		{
			"is_pos": 1,
			"customer": customer,
			"company": pos.company,
			"pos_profile": pos.name,
			"currency": currency,
			"selling_price_list": price_list,
			"posting_date": nowdate(),
			"set_warehouse": pos.warehouse,
		}
	)

	result_lines = []
	for index, line in enumerate(lines):
		item_code = line.get("item_code")
		if not item_code or not frappe.db.exists("Item", item_code):
			frappe.throw(_("Item {0} not found").format(item_code))
		qty = flt(line.get("qty"), 3)
		uom = line.get("uom") or frappe.get_cached_value("Item", item_code, "stock_uom")
		rate = get_line_rate(price_list, item_code, uom, customer, qty, doc.posting_date)
		row_id = line.get("row_id") or index
		if rate is None:
			result_lines.append(
				{"row_id": row_id, "item_code": item_code, "rate": None, "price_unavailable": 1}
			)
			continue
		tax = get_item_tax_template(item_code, pos.company)
		doc.append(
			"items",
			{
				"item_code": item_code,
				"qty": qty,
				"uom": uom,
				"rate": rate,
				"price_list_rate": rate,
				"warehouse": pos.warehouse,
				"item_tax_template": tax.get("item_tax_template"),
				"item_tax_rate": frappe.as_json(tax.get("item_tax_map") or {}),
			},
		)
		result_lines.append(
			{
				"row_id": row_id,
				"item_code": item_code,
				"rate": rate,
				"item_tax_template": tax.get("item_tax_template"),
			}
		)

	unpriced = [row["item_code"] for row in result_lines if row.get("price_unavailable")]
	if unpriced:
		return {"price_unavailable": unpriced, "lines": result_lines}

	if pos.taxes_and_charges:
		doc.taxes_and_charges = pos.taxes_and_charges
		for tax in frappe.get_cached_doc("Sales Taxes and Charges Template", pos.taxes_and_charges).taxes:
			doc.append(
				"taxes",
				{
					"charge_type": tax.charge_type,
					"account_head": tax.account_head,
					"description": tax.description,
					"rate": tax.rate,
					"cost_center": tax.cost_center,
					"included_in_print_rate": tax.included_in_print_rate,
				},
			)
	doc.calculate_taxes_and_totals()

	rounded = cint(not cint(doc.get("disable_rounded_total"))) and flt(doc.get("rounded_total"))
	return {
		"price_list": price_list,
		"currency": currency,
		"net_total": flt(doc.net_total),
		"total_taxes_and_charges": flt(doc.total_taxes_and_charges),
		"grand_total": flt(doc.grand_total),
		"payable": rounded or flt(doc.grand_total),
		"lines": result_lines,
	}
