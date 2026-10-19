# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt


from frappe import _


def get_pos_credit_redeem_remark(invoice_name: str) -> str:
	return _("POS credit redemption for Sales Invoice {0}").format(invoice_name)
