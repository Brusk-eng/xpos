# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from xpos.reports.sales import pos_invoices


def execute(filters=None):
	filters = frappe._dict(filters or {})
	_doctype, invoices = pos_invoices(filters, ["owner", "grand_total", "is_return"])
	return get_columns(), get_data(invoices)


def get_data(invoices):
	cashiers = {}
	for invoice in invoices:
		row = cashiers.setdefault(
			invoice["owner"], {"cashier": invoice["owner"], "invoices": 0, "returns": 0, "grand_total": 0}
		)
		row["invoices"] += 1
		row["returns"] += 1 if invoice["is_return"] else 0
		row["grand_total"] += flt(invoice["grand_total"])
	return sorted(cashiers.values(), key=lambda row: -row["grand_total"])


def get_columns():
	return [
		{"label": _("Cashier"), "fieldname": "cashier", "fieldtype": "Link", "options": "User", "width": 220},
		{"label": _("Invoices"), "fieldname": "invoices", "fieldtype": "Int", "width": 100},
		{"label": _("Returns"), "fieldname": "returns", "fieldtype": "Int", "width": 100},
		{"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 140},
	]
