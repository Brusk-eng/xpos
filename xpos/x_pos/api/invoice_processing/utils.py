import frappe
from erpnext.setup.utils import get_exchange_rate
from frappe.utils import (
	flt,
	nowdate,
)


def get_latest_rate(from_currency: str, to_currency: str, cache=None):
	"""Return the most recent Currency Exchange rate and its date."""
	if cache is not None:
		key = (from_currency, to_currency)
		if key in cache:
			return cache[key]

	rate_doc = frappe.get_all(
		"Currency Exchange",
		filters={"from_currency": from_currency, "to_currency": to_currency},
		fields=["exchange_rate", "date"],
		order_by="date desc, creation desc",
		limit=1,
	)
	if rate_doc:
		result = flt(rate_doc[0].exchange_rate), rate_doc[0].date
	else:
		rate = get_exchange_rate(from_currency, to_currency, nowdate())
		result = flt(rate), nowdate()

	if cache is not None:
		cache[key] = result

	return result
