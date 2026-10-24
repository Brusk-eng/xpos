# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe

from xpos.api import catalog_sync, mobile
from xpos.api.tests.test_mobile_bootstrap import profile


class FakeInvoice(SimpleNamespace):
	"""An unsaved invoice that records every write-like call so the tests can prove there are none."""

	def __init__(self):
		super().__init__(items=[], taxes=[], net_total=0, total_taxes_and_charges=0, grand_total=0)
		self.writes = []

	def update(self, values):
		self.__dict__.update(values)

	def append(self, table, row):
		getattr(self, table).append(frappe._dict(row))

	def get(self, key, default=None):
		return getattr(self, key, default)

	def calculate_taxes_and_totals(self):
		self.grand_total = self.net_total = sum(r.rate * r.qty for r in self.items)
		for row in self.items:
			row.net_amount = row.rate * row.qty

	def save(self, *a, **k):
		self.writes.append("save")

	insert = submit = save


@contextmanager
def quoting(rates, item_flags=None, pos=None):
	"""Run quote_sale against stubbed lookups. ``rates`` is {item_code: rate or None}."""
	doc = FakeInvoice()
	flags = item_flags or {}

	def item_values(doctype, name, fields):
		stock_uom, serial, batch = flags.get(name, ("Nos", 0, 0))
		return stock_uom, serial, batch

	pos = pos or profile(taxes_and_charges=None, customer="Walk-in", allow_zero_rated_items=0)
	with (
		patch("xpos.api.mobile.resolve_pos_profile", return_value=pos) as resolve,
		patch("xpos.api.mobile.require_customer_access") as access,
		patch("xpos.api.mobile.resolve_selling_price_list", return_value="Standard Selling"),
		patch("xpos.api.mobile.get_invoice_type", return_value="POS Invoice"),
		patch("xpos.api.mobile.frappe.new_doc", return_value=doc),
		patch("xpos.api.mobile.frappe.db.exists", return_value=True),
		patch("xpos.api.mobile.frappe.get_cached_value", side_effect=item_values),
		patch("xpos.api.mobile.get_line_rate", side_effect=lambda pl, code, *a, **k: rates[code]),
		patch("xpos.api.mobile.get_item_tax_template", return_value={}),
	):
		yield SimpleNamespace(doc=doc, resolve=resolve, access=access)


def line(code, qty=1, **over):
	return {"item_code": code, "qty": qty, **over}


class TestQuoteSale(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_guest_is_denied(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			mobile.quote_sale("Main", [line("A")])

	def test_profile_and_customer_go_through_the_existing_checks(self):
		with quoting({"A": 10.0}) as q:
			mobile.quote_sale("Main", [line("A")])
		q.resolve.assert_called_once()
		q.access.assert_called_once_with("Walk-in", "read", "Main")

	def test_profile_denial_stops_the_quote(self):
		with patch("xpos.api.mobile.resolve_pos_profile", side_effect=frappe.PermissionError("no")):
			with self.assertRaises(frappe.PermissionError):
				mobile.quote_sale("Other", [line("A")])

	def test_missing_price_is_reported_not_sold_as_zero(self):
		with quoting({"A": None, "B": 5.0}):
			out = mobile.quote_sale("Main", [line("A"), line("B")])
		self.assertEqual(out["price_unavailable"], ["A"])
		self.assertIsNone(out["lines"][0]["rate"])
		self.assertNotIn("payable", out)

	def test_positive_price_is_quoted(self):
		with quoting({"A": 12.5}):
			out = mobile.quote_sale("Main", [line("A", 2)])
		self.assertEqual(out["grand_total"], 25)
		self.assertEqual(out["lines"][0]["rate"], 12.5)

	def test_zero_price_is_refused_unless_the_profile_allows_it(self):
		with quoting({"A": 0.0}):
			with self.assertRaises(frappe.ValidationError):
				mobile.quote_sale("Main", [line("A")])
		allowed = profile(taxes_and_charges=None, customer="Walk-in", allow_zero_rated_items=1)
		with quoting({"A": 0.0}, pos=allowed):
			out = mobile.quote_sale("Main", [line("A")])
		self.assertEqual(out["lines"][0]["rate"], 0.0)
		self.assertEqual(out["payable"], 0)
		self.assertNotIn("price_unavailable", out)

	def test_unsupported_lines_are_rejected_explicitly(self):
		cases = [
			({"A": ("Nos", 1, 0)}, line("A")),
			({"A": ("Nos", 0, 1)}, line("A")),
			({"A": ("Nos", 0, 0)}, line("A", uom="Box")),
			({"A": ("Nos", 0, 0)}, line("A", serial_no="S1")),
			({"A": ("Nos", 0, 0)}, line("A", batch_no="B1")),
		]
		for flags, bad in cases:
			with self.subTest(bad=bad), quoting({"A": 1.0}, item_flags=flags):
				with self.assertRaises(frappe.ValidationError):
					mobile.quote_sale("Main", [bad])

	def test_quote_performs_no_writes(self):
		with quoting({"A": 3.0}) as q, patch("xpos.api.mobile.frappe.db", new_callable=MagicMock) as db:
			db.exists.return_value = True
			mobile.quote_sale("Main", [line("A")])
		self.assertEqual(q.doc.writes, [])
		for call in ("sql", "set_value", "commit", "delete", "bulk_insert"):
			getattr(db, call).assert_not_called()


class TestCatalogPriceFlag(unittest.TestCase):
	def test_missing_zero_and_positive_prices_are_distinguished(self):
		items = [frappe._dict(item_code=c) for c in ("MISSING", "ZERO", "POSITIVE")]
		with (
			patch("xpos.api.catalog_sync.price_list_of", return_value="Standard Selling"),
			patch("xpos.api.catalog_sync.get_price_map", return_value={"ZERO": 0.0, "POSITIVE": 7.5}),
		):
			catalog_sync.attach_rates(MagicMock(), items)
		self.assertEqual([i.rate for i in items], [0, 0.0, 7.5])
		self.assertEqual([i.price_missing for i in items], [1, 0, 0])
