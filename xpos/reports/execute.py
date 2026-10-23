# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Run a catalog report through Frappe's own report runner, after the POS-level checks."""

import frappe
from frappe import _
from frappe.desk.query_report import _run

from xpos.reports import scope
from xpos.reports.catalog import resolve_entry

PURPOSES = ("view", "export", "print")


def deny():
	frappe.throw(_("You do not have access to this report."), frappe.PermissionError)


def require_entry(identifier: str | None) -> dict:
	entry = resolve_entry(identifier)
	if not entry:
		deny()
	return entry


def run(identifier: str, filters, purpose: str = "view") -> dict:
	entry = require_entry(identifier)
	if purpose not in PURPOSES:
		frappe.throw(_("Unknown report purpose: {0}").format(purpose))
	if entry["capability"]["state"] != "supported":
		frappe.throw(_("This report cannot be run from the POS yet."), frappe.ValidationError)
	if purpose == "export" and not entry["export"]["allowed"]:
		frappe.throw(_("You are not permitted to export this report."), frappe.PermissionError)
	if purpose == "print" and not entry["print"]["allowed"]:
		frappe.throw(_("You are not permitted to print this report."), frappe.PermissionError)

	filters = frappe.parse_json(filters) if filters else {}
	if not isinstance(filters, dict):
		frappe.throw(_("Report filters must be an object."))
	scope.enforce(filters)

	return _run(report_name=entry["id"], filters=filters, are_default_filters=False)
