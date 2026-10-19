# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt


import frappe
from frappe import _
from frappe.utils import add_days, flt

from xpos.api.profile_rules import validate_delivery_charge
from xpos.api.tender import validate_tender_currency_legs
from xpos.x_pos.api.payments import get_pos_credit_redeem_remark
from xpos.x_pos.api.utilities import get_company_domain
from xpos.x_pos.doctype.delivery_charges.delivery_charges import (
	get_applicable_delivery_charges,
)
from xpos.x_pos.doctype.pos_coupon.pos_coupon import update_coupon_usage, validate_invoice_coupons
from xpos.x_pos.gift_cards import (
	apply_gift_cards_on_submit,
	reverse_gift_cards_on_cancel,
	validate_invoice_gift_cards,
)
from xpos.x_pos.integrations.fbr import fiscalize_invoice


def validate(doc, method):
	validate_shift(doc)
	set_patient(doc)
	validate_delivery_charge(doc)
	auto_set_delivery_charges(doc)
	calc_delivery_charges(doc)
	apply_tax_inclusive(doc)
	validate_tender_currency_legs(doc)
	validate_invoice_gift_cards(doc)


def before_submit(doc, method):
	validate_invoice_coupons(doc)
	apply_gift_cards_on_submit(doc)
	fiscalize_invoice(doc)
	add_loyalty_point(doc)
	update_coupon_usage(doc, "used")


def settle_order_deposits(doc, method=None):
	"""Deduct Sales Order deposits from an xPOS sale: ERPNext skips advances on POS invoices."""
	if doc.is_pos and not doc.is_return and doc.get("pos_opening_shift") and doc.get("advances"):
		doc.update_against_document_in_jv()


def before_cancel(doc, method):
	update_coupon_usage(doc, "cancelled")
	reverse_gift_cards_on_cancel(doc)


def on_cancel(doc, method):
	cancel_pos_credit_journal_entries(doc)


def cancel_pos_credit_journal_entries(doc):
	remark = get_pos_credit_redeem_remark(doc.name)
	linked_journal_entries = frappe.get_all(
		"Journal Entry",
		filters={"docstatus": 1, "user_remark": remark},
		pluck="name",
	)

	for journal_entry in linked_journal_entries:
		je_doc = frappe.get_doc("Journal Entry", journal_entry)

		if je_doc.docstatus != 1:
			continue

		has_reference = any(
			d.reference_type == doc.doctype and d.reference_name == doc.name for d in je_doc.accounts
		)

		if not has_reference:
			continue

		try:
			je_doc.cancel()
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				"X POS Credit Journal Cancellation Error",
			)
			frappe.throw(
				_(
					"Unable to cancel Journal Entry {0} linked to this invoice. Please cancel it manually and try again."
				).format(journal_entry)
			)


def add_loyalty_point(invoice_doc):
	for offer in getattr(invoice_doc, "offers", []):
		if offer.offer == "Loyalty Point":
			original_offer = frappe.get_doc("POS Offer", offer.offer_name)
			if original_offer.loyalty_points > 0:
				loyalty_program = frappe.get_value("Customer", invoice_doc.customer, "loyalty_program")
				if not loyalty_program:
					loyalty_program = original_offer.loyalty_program
				doc = frappe.get_doc(
					{
						"doctype": "Loyalty Point Entry",
						"loyalty_program": loyalty_program,
						"loyalty_program_tier": original_offer.name,
						"customer": invoice_doc.customer,
						"invoice_type": "Sales Invoice",
						"invoice": invoice_doc.name,
						"loyalty_points": original_offer.loyalty_points,
						"expiry_date": add_days(invoice_doc.posting_date, 10000),
						"posting_date": invoice_doc.posting_date,
						"company": invoice_doc.company,
					}
				)
				doc.insert(ignore_permissions=True)


def set_patient(doc):
	domain = get_company_domain(doc.company)
	if domain != "Healthcare":
		return
	patient_list = frappe.get_all("Patient", filters={"customer": doc.customer}, page_length=1)
	if len(patient_list) > 0:
		doc.patient = patient_list[0].name


def auto_set_delivery_charges(doc):
	if not doc.pos_profile or is_consolidated(doc):
		return

	if getattr(getattr(doc, "flags", None), "xpos_skip_auto_delivery_charges", False):
		return
	use_delivery, auto_set = frappe.get_cached_value(
		"POS Profile", doc.pos_profile, ["use_delivery_charges", "auto_set_delivery_charges"]
	)
	if not use_delivery or not auto_set:
		return

	delivery_charges = get_applicable_delivery_charges(
		doc.company,
		doc.pos_profile,
		doc.customer,
		doc.shipping_address_name,
		doc.pos_delivery_charges,
		restrict=True,
	)

	if doc.pos_delivery_charges:
		if doc.pos_delivery_charges_rate:
			return
		else:
			if len(delivery_charges) > 0:
				doc.pos_delivery_charges_rate = delivery_charges[0].rate
	else:
		if len(delivery_charges) > 0:
			doc.pos_delivery_charges = delivery_charges[0].name
			doc.pos_delivery_charges_rate = delivery_charges[0].rate
		else:
			doc.pos_delivery_charges = None
			doc.pos_delivery_charges_rate = None


def is_consolidated(doc):
	"""
	True for the Sales Invoice / credit note produced by POS consolidation.
	"""

	return bool(doc.get("is_consolidated"))


def calc_delivery_charges(doc):
	if not doc.pos_profile or is_consolidated(doc):
		return

	old_doc = None
	calculate_taxes_and_totals = False
	if not doc.is_new():
		old_doc = doc.get_doc_before_save()
		if not doc.pos_delivery_charges and not old_doc.pos_delivery_charges:
			return
	else:
		if not doc.pos_delivery_charges:
			return
	if not doc.pos_delivery_charges:
		doc.pos_delivery_charges_rate = 0

	charges_doc = None
	if doc.pos_delivery_charges:
		charges_doc = frappe.get_cached_doc("Delivery Charges", doc.pos_delivery_charges)
		doc.pos_delivery_charges_rate = charges_doc.default_rate
		charges_profile = next((i for i in charges_doc.profiles if i.pos_profile == doc.pos_profile), None)
		if charges_profile:
			doc.pos_delivery_charges_rate = charges_profile.rate
		conversion_rate = doc.conversion_rate or 1
		doc.pos_delivery_charges_rate = flt(
			doc.pos_delivery_charges_rate / conversion_rate,
			doc.precision("pos_delivery_charges_rate"),
		)

	if old_doc and old_doc.pos_delivery_charges:
		old_charges = next(
			(
				i
				for i in doc.taxes
				if i.charge_type == "Actual" and i.description == old_doc.pos_delivery_charges
			),
			None,
		)
		if old_charges:
			doc.taxes.remove(old_charges)
			calculate_taxes_and_totals = True

	if doc.pos_delivery_charges:
		existing_charges = [
			i
			for i in list(doc.taxes)
			if i.charge_type == "Actual" and i.description == doc.pos_delivery_charges
		]
		for existing_charge in existing_charges:
			doc.taxes.remove(existing_charge)
			calculate_taxes_and_totals = True

	if doc.pos_delivery_charges:
		doc.append(
			"taxes",
			{
				"charge_type": "Actual",
				"description": doc.pos_delivery_charges,
				"rate": 0,
				"tax_amount": doc.pos_delivery_charges_rate,
				"cost_center": charges_doc.cost_center,
				"account_head": charges_doc.shipping_account,
			},
		)
		calculate_taxes_and_totals = True

		if doc.get("additional_discount_percentage") and doc.apply_discount_on == "Grand Total":
			doc.apply_discount_on = "Net Total"

	if calculate_taxes_and_totals:
		doc.calculate_taxes_and_totals()


def apply_tax_inclusive(doc):
	"""Mark taxes as inclusive based on POS Profile setting."""
	if not doc.pos_profile:
		return
	try:
		tax_inclusive = frappe.get_cached_value("POS Profile", doc.pos_profile, "tax_inclusive")
	except Exception:
		tax_inclusive = 0

	has_changes = False
	for tax in doc.get("taxes", []):
		if tax.charge_type == "Actual":
			if tax.included_in_print_rate:
				tax.included_in_print_rate = 0
				has_changes = True
			continue
		if tax_inclusive and not tax.included_in_print_rate:
			tax.included_in_print_rate = 1
			has_changes = True
		elif not tax_inclusive and tax.included_in_print_rate:
			tax.included_in_print_rate = 0
			has_changes = True
	if has_changes:
		doc.calculate_taxes_and_totals()


def validate_shift(doc):
	if getattr(doc, "is_consolidated", None):
		return
	if getattr(doc, "pos_opening_shift", None) and doc.pos_profile and doc.is_pos:
		shift = frappe.get_cached_doc("POS Opening Shift", doc.pos_opening_shift)
		if shift.status != "Open":
			frappe.throw(_("POS Shift {0} is not open").format(shift.name))

		if shift.pos_profile != doc.pos_profile:
			frappe.throw(_("POS Opening Shift {0} is not for the same POS Profile").format(shift.name))

		if shift.company != doc.company:
			frappe.throw(_("POS Opening Shift {0} is not for the same company").format(shift.name))
