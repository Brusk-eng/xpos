# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from xpos.x_pos.doctype.xpos_closing_shift.closing_processing.invoices import (
	_clear_closing_entry_invoices,
	_set_closing_entry_invoices,
	consolidate_closing_shift_invoices,
	delete_draft_invoices,
)
from xpos.x_pos.doctype.xpos_closing_shift.closing_processing.overview import (
	get_payment_reconciliation_details,
)


class XPOSClosingShift(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from xpos.x_pos.doctype.sales_invoice_reference.sales_invoice_reference import (
			SalesInvoiceReference,
		)
		from xpos.x_pos.doctype.xpos_closing_shift_detail.xpos_closing_shift_detail import (
			XPOSClosingShiftDetail,
		)
		from xpos.x_pos.doctype.xpos_closing_shift_taxes.xpos_closing_shift_taxes import (
			XPOSClosingShiftTaxes,
		)
		from xpos.x_pos.doctype.xpos_payment_entry_reference.xpos_payment_entry_reference import (
			XPOSPaymentEntryReference,
		)

		amended_from: DF.Link | None
		company: DF.Link
		grand_total: DF.Currency
		net_total: DF.Currency
		payment_reconciliation: DF.Table[XPOSClosingShiftDetail]
		period_end_date: DF.Datetime
		period_start_date: DF.Datetime
		pos_opening_shift: DF.Link
		pos_payments: DF.Table[XPOSPaymentEntryReference]
		pos_profile: DF.Link
		pos_transactions: DF.Table[SalesInvoiceReference]
		posting_date: DF.Date
		taxes: DF.Table[XPOSClosingShiftTaxes]
		total_quantity: DF.Float
		user: DF.Link
	# end: auto-generated types

	def validate(self):
		user = frappe.get_all(
			"XPOS Closing Shift",
			filters={
				"user": self.user,
				"docstatus": 1,
				"pos_opening_shift": self.pos_opening_shift,
				"name": ["!=", self.name],
			},
		)

		if user:
			frappe.throw(
				_("XPOS Closing Shift {0} against {1} between selected period").format(
					frappe.bold("already exists"), frappe.bold(self.user)
				)
			)

		if frappe.db.get_value("XPOS Opening Shift", self.pos_opening_shift, "status") != "Open":
			frappe.throw(
				_("Selected POS Opening Shift should be open."),
				title=_("Invalid Opening Entry"),
			)
		self.update_payment_reconciliation()

	def update_payment_reconciliation(self):
		precision = frappe.get_cached_value("System Settings", None, "currency_precision") or 3
		for d in self.payment_reconciliation:
			d.difference = +flt(d.closing_amount, precision) - flt(d.expected_amount, precision)

	def on_submit(self):
		opening_entry = frappe.get_doc("XPOS Opening Shift", self.pos_opening_shift)
		opening_entry.pos_closing_shift = self.name
		opening_entry.set_status()
		self.delete_draft_invoices()
		opening_entry.save()
		_set_closing_entry_invoices(self)
		consolidate_closing_shift_invoices(self)

	def on_cancel(self):
		if frappe.db.exists("XPOS Opening Shift", self.pos_opening_shift):
			opening_entry = frappe.get_doc("XPOS Opening Shift", self.pos_opening_shift)
			if opening_entry.pos_closing_shift == self.name:
				opening_entry.pos_closing_shift = ""
				opening_entry.set_status()
				opening_entry.save()

		_clear_closing_entry_invoices(self)

	def delete_draft_invoices(self):
		delete_draft_invoices(self.pos_opening_shift, self.pos_profile)

	@frappe.whitelist()
	def get_payment_reconciliation_details(self):
		return get_payment_reconciliation_details(self)
