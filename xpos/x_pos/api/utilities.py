# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt


import frappe
from frappe.utils import cstr


def add_taxes_from_tax_template(item, parent_doc):
	accounts_settings = frappe.get_cached_doc("Accounts Settings")
	add_taxes_from_item_tax_template = accounts_settings.add_taxes_from_item_tax_template
	if item.get("item_tax_template") and add_taxes_from_item_tax_template:
		item_tax_template = item.get("item_tax_template")
		taxes_template_details = frappe.get_all(
			"Item Tax Template Detail",
			filters={"parent": item_tax_template},
			fields=["tax_type"],
		)

		for tax_detail in taxes_template_details:
			tax_type = tax_detail.get("tax_type")

			found = any(tax.account_head == tax_type for tax in parent_doc.taxes)
			if not found:
				tax_row = parent_doc.append("taxes", {})
				tax_row.update(
					{
						"description": str(tax_type).split(" - ")[0],
						"charge_type": "On Net Total",
						"account_head": tax_type,
					}
				)

				if parent_doc.doctype == "Purchase Order":
					tax_row.update({"category": "Total", "add_deduct_tax": "Add"})
				tax_row.db_insert()


def get_company_domain(company):
	return frappe.get_cached_value("Company", cstr(company), "domain")
