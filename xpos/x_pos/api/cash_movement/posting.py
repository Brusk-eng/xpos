import frappe


def cancel_journal_entry(journal_entry_name):
	if not journal_entry_name:
		return

	if not frappe.db.exists("Journal Entry", journal_entry_name):
		return

	je = frappe.get_doc("Journal Entry", journal_entry_name)
	if je.docstatus == 1:
		je.flags.ignore_permissions = True
		# Cash movement keeps a hard link to JE for audit trail; allow JE cancel from this controlled path.
		je.flags.ignore_links = True
		frappe.flags.ignore_account_permission = True
		je.cancel()
