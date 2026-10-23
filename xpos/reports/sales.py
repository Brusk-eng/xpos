# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""The submitted POS sales a shift report reads, limited to the caller's scope."""

import frappe
from frappe import _

from xpos.api.utilities import get_invoice_type
from xpos.reports import scope


def pos_invoices(filters, fields: list[str]) -> tuple[str, list[dict]]:
	"""(invoice doctype, submitted POS invoices in the filtered window the user may see)."""
	scope.enforce(filters)
	if not filters.get("company"):
		frappe.throw(_("Company is required"))
	report_scope = scope.get_scope()
	if filters.get("pos_profile") and not report_scope.allows_profile(filters["pos_profile"]):
		frappe.throw(
			_("You are not permitted to report on POS Profile {0}.").format(filters["pos_profile"]),
			frappe.PermissionError,
		)

	doctype = get_invoice_type()
	conditions = {
		"docstatus": 1,
		"company": filters["company"],
		"posting_date": [
			"between",
			[filters.get("from_date") or filters.get("to_date"), filters.get("to_date")],
		],
	}
	if doctype == "POS Invoice":
		conditions["consolidated_invoice"] = ["in", ["", None]]
	else:
		conditions["is_pos"] = 1
	if filters.get("pos_profile"):
		conditions["pos_profile"] = filters["pos_profile"]

	invoices = frappe.get_all(doctype, filters=conditions, fields=["pos_profile", *fields])
	return doctype, [inv for inv in invoices if report_scope.allows_profile(inv["pos_profile"])]
