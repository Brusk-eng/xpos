# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Server-side rules behind POS Profile settings.

The SPA previews these rules, but a submitted cart is always re-checked here
against the server-loaded profile: see docs/features/pos-profile-settings-status.md.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate
from frappe.utils.nestedset import get_ancestors_of

from xpos.api.profiles import resolve_pos_profile


def profile_flag(pos, fieldname: str) -> bool:
	return bool(cint(pos.get(fieldname)))


def customer_price_list(customer: str | None) -> str | None:
	"""The Customer's own selling price list, else the nearest Customer Group one."""
	if not customer:
		return None
	row = frappe.db.get_value("Customer", customer, ["default_price_list", "customer_group"], as_dict=True)
	if not row:
		return None
	if row.default_price_list:
		return row.default_price_list
	if not row.customer_group:
		return None
	for group in [row.customer_group, *get_ancestors_of("Customer Group", row.customer_group)]:
		price_list = frappe.db.get_value("Customer Group", group, "default_price_list")
		if price_list:
			return price_list
	return None


def price_list_usable(price_list: str, currency: str | None) -> bool:
	row = frappe.db.get_value("Price List", price_list, ["enabled", "selling", "currency"], as_dict=True)
	if not row or not row.enabled or not row.selling:
		return False
	return not currency or row.currency == currency


def resolve_selling_price_list(pos, customer: str | None) -> str | None:
	"""Price list for normal sale lines: customer → customer group → profile.

	A customer list is only used when the profile forces it and the list is an
	enabled selling list in the same currency as the profile's own list, so the
	existing currency conversion still applies.
	"""
	base = pos.get("selling_price_list")
	if not profile_flag(pos, "force_price_from_customer_price_list"):
		return base
	candidate = customer_price_list(customer)
	if not candidate or candidate == base:
		return base
	base_currency = frappe.db.get_value("Price List", base, "currency") if base else None
	return candidate if price_list_usable(candidate, base_currency) else base


def get_line_rate(
	price_list: str | None,
	item_code: str,
	uom: str | None = None,
	customer: str | None = None,
	qty: float = 1,
	posting_date: str | None = None,
	batch_no: str | None = None,
) -> float | None:
	"""Item Price for one line, honouring UOM, validity dates and customer-specific prices.

	Returns None when the price list has no usable price for the item.
	"""
	if not price_list or not item_code:
		return None
	from erpnext.stock.get_item_details import get_conversion_factor, get_price_list_rate_for

	stock_uom = frappe.get_cached_value("Item", item_code, "stock_uom")
	uom = uom or stock_uom
	conversion_factor = 1
	if uom != stock_uom:
		conversion_factor = flt(get_conversion_factor(item_code, uom).get("conversion_factor")) or 1
	rate = get_price_list_rate_for(
		frappe._dict(
			price_list=price_list,
			customer=customer,
			uom=uom,
			stock_uom=stock_uom,
			conversion_factor=conversion_factor,
			qty=abs(flt(qty)) or 1,
			transaction_date=posting_date or nowdate(),
			batch_no=batch_no,
		),
		item_code,
	)
	return None if rate is None else flt(rate)


@frappe.whitelist()
def get_customer_line_prices(
	pos_profile: str,
	customer: str | None = None,
	lines: str | list | None = None,
	posting_date: str | None = None,
):
	"""Prices from the effective price list for the given cart lines.

	``lines`` is ``[{row_id, item_code, uom, qty, batch_no}]``. A ``None`` price
	means the list has no price for that line ("price unavailable").
	"""
	pos = resolve_pos_profile(pos_profile)
	lines = frappe.parse_json(lines) if isinstance(lines, str) else (lines or [])
	price_list = resolve_selling_price_list(pos, customer)
	prices = {}
	for line in lines:
		prices[line.get("row_id")] = get_line_rate(
			price_list,
			line.get("item_code"),
			line.get("uom"),
			customer,
			line.get("qty") or 1,
			posting_date,
			line.get("batch_no"),
		)
	return {"price_list": price_list, "prices": prices}


def parse_rule_names(value) -> list[str]:
	"""ERPNext stores ``pricing_rules`` as a JSON list string; the SPA may send a plain name."""
	if not value:
		return []
	if isinstance(value, str) and value.strip().startswith("["):
		value = frappe.parse_json(value)
	if isinstance(value, str):
		value = value.split(",")
	return [str(v).strip() for v in value if str(v).strip()]


def verified_pricing_rule_free_line(pos, line: dict) -> bool:
	"""A free line is genuine only if a live Product pricing rule gives this item."""
	for rule_name in parse_rule_names(line.get("pricing_rules")):
		rule = frappe.db.get_value(
			"Pricing Rule",
			rule_name,
			["disable", "selling", "price_or_product_discount", "company", "same_item", "free_item"],
			as_dict=True,
		)
		if not rule or rule.disable or not rule.selling or rule.price_or_product_discount != "Product":
			continue
		if rule.company and rule.company != pos.company:
			continue
		if rule.same_item or rule.free_item == line.get("item_code"):
			return True
	return False


def offer_matches_item(offer, item: dict) -> bool:
	item_code = item.get("item_code")
	if offer.apply_on == "Item Code":
		return bool(offer.item) and offer.item == item_code
	if offer.apply_on == "Item Group":
		return bool(offer.item_group) and offer.item_group == frappe.get_cached_value(
			"Item", item_code, "item_group"
		)
	if offer.apply_on == "Brand":
		return bool(offer.brand) and offer.brand == frappe.get_cached_value("Item", item_code, "brand")
	return False


def verified_offer_free_line(
	pos, line: dict, paid_lines: list[dict], coupon_offers: set, posting_date
) -> bool:
	"""Re-derive a POS Offer free line on the server; the client's ``is_offer`` flag alone proves nothing."""
	offer_name = line.get("offers")
	if not offer_name or not frappe.db.exists("POS Offer", offer_name):
		return False
	offer = frappe.get_cached_doc("POS Offer", offer_name)
	if offer.disabled or offer.offer != "Give Product" or flt(offer.given_qty) <= 0:
		return False
	if offer.company and offer.company != pos.company:
		return False
	if offer.pos_profile and offer.pos_profile != pos.name:
		return False
	date = getdate(posting_date or nowdate())
	if (offer.valid_from and getdate(offer.valid_from) > date) or (
		offer.valid_upto and getdate(offer.valid_upto) < date
	):
		return False
	if cint(offer.coupon_based) and offer.name not in coupon_offers:
		return False

	if offer.apply_on == "Transaction":
		matching = paid_lines
	else:
		matching = [i for i in paid_lines if offer_matches_item(offer, i)]
	if not matching:
		return False
	matched_qty = sum(abs(flt(i.get("qty"))) for i in matching)
	matched_amt = sum(abs(flt(i.get("qty"))) * flt(i.get("rate")) for i in matching)
	if (flt(offer.min_qty) and matched_qty < flt(offer.min_qty)) or (
		flt(offer.max_qty) and matched_qty > flt(offer.max_qty)
	):
		return False
	if (flt(offer.min_amt) and matched_amt < flt(offer.min_amt)) or (
		flt(offer.max_amt) and matched_amt > flt(offer.max_amt)
	):
		return False

	item_code = line.get("item_code")
	max_qty = flt(offer.given_qty)
	if cint(offer.replace_item) or cint(offer.replace_cheapest_item):
		if item_code not in {i.get("item_code") for i in matching}:
			return False
		if cint(offer.replace_item):
			max_qty = flt(offer.given_qty) * len(matching)
	elif offer.apply_type == "Item Code":
		if offer.apply_item_code != item_code:
			return False
	elif offer.apply_type == "Item Group":
		if offer.apply_item_group != frappe.get_cached_value("Item", item_code, "item_group"):
			return False
	else:
		return False
	return abs(flt(line.get("qty"))) <= max_qty


def check_zero_price_line(pos, item_code: str, net_rate: float, verified_free: bool) -> None:
	"""Reject an unauthorised zero-price sale line (100% discounts count as zero-price)."""
	if net_rate > 0 or verified_free:
		return
	if not profile_flag(pos, "allow_zero_rated_items"):
		frappe.throw(
			_("Item {0} has a zero price. Zero-price sale lines are not allowed on POS Profile {1}.").format(
				item_code, pos.name
			),
			title=_("Zero price not allowed"),
		)


def price_unavailable(item_code: str, price_list: str | None) -> None:
	frappe.throw(
		_("Price unavailable for item {0} in price list {1}.").format(item_code, price_list or "-"),
		title=_("Price unavailable"),
	)


def validate_delivery_charge(doc) -> None:
	"""``use_delivery_charges`` is the master switch for charging delivery on a POS sale.

	Only a newly set or changed charge is checked, so existing drafts and
	submitted history are left alone. The rate itself is always recomputed from
	the Delivery Charges record by ``calc_delivery_charges``.
	"""
	charge = doc.get("pos_delivery_charges")
	if not charge or not doc.get("pos_profile") or doc.get("is_return") or doc.get("is_consolidated"):
		return
	if not (doc.is_new() or doc.has_value_changed("pos_delivery_charges")):
		return

	pos = frappe.get_cached_doc("POS Profile", doc.pos_profile)
	if not profile_flag(pos, "use_delivery_charges"):
		frappe.throw(
			_("Delivery charges are disabled for POS Profile {0}.").format(pos.name),
			title=_("Delivery charges disabled"),
		)

	from xpos.x_pos.doctype.delivery_charges.delivery_charges import get_applicable_delivery_charges

	eligible = get_applicable_delivery_charges(doc.company, pos.name, delivery_charges=charge)
	if charge not in {c.name for c in eligible}:
		frappe.throw(
			_("Delivery charge {0} is not available for company {1} and POS Profile {2}.").format(
				charge, doc.company, pos.name
			),
			title=_("Delivery charge not allowed"),
		)


def is_blind_closing(pos_profile: str | None, user: str | None = None) -> bool:
	"""Whether ``user`` must count the drawer without seeing what it should hold.

	Applies when the profile hides expected amounts and the user lacks the
	``view_expected_amount`` POS permission; holds before and after closing.
	"""
	from xpos.api.auth import user_has_pos_permission

	if not pos_profile or not cint(
		frappe.get_cached_value("POS Profile", pos_profile, "hide_expected_amount")
	):
		return False
	return not user_has_pos_permission("view_expected_amount", user, pos_profile)


def customer_discount_rate(pos, customer: str | None) -> float:
	"""The customer's Discount (%) as this profile applies it, capped by the profile maximum."""
	if not customer or not profile_flag(pos, "apply_customer_discount"):
		return 0.0
	rate = flt(frappe.db.get_value("Customer", customer, "discount"))
	cap = flt(pos.get("max_discount_percentage_allowed"))
	return min(rate, cap) if cap > 0 else rate


def validate_customer_discount(pos, customer: str, percentage: float, amount: float) -> None:
	"""A discount the till labels as the customer's must be exactly that customer's discount."""
	expected = customer_discount_rate(pos, customer)
	if not expected or amount or abs(flt(percentage, 2) - flt(expected, 2)) > 0.005:
		frappe.throw(
			_("The customer discount of {0}% does not match the {1}% allowed for customer {2}.").format(
				flt(percentage, 2), flt(expected, 2), customer
			),
			title=_("Customer discount not allowed"),
		)
