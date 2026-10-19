import frappe


@frappe.whitelist()
def get_default_warehouse(company: str | None = None):
	"""Return the default warehouse for the given company.

	Delegates to `xpos.api.utilities.get_default_warehouse` so the two API
	layers cannot drift apart again; the local copy previously queried a
	`Company.default_warehouse` column that does not exist.
	"""
	from xpos.api.utilities import get_default_warehouse as resolve_default_warehouse

	return resolve_default_warehouse(company)


def get(flag: str, pos_profile: str | None = None):
	"""Helper to fetch and cache commonly used POS profile related data."""
	pp = frappe.get_cached_doc("POS Profile", pos_profile) if pos_profile else None
	if pp and flag:
		return pp.get(flag)

	return None
