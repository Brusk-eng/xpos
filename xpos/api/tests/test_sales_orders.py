# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import importlib
import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import add_days, nowdate

from xpos.api import sales_orders


def profile(**overrides):
	return frappe._dict(
		{
			"name": "P",
			"company": "C",
			"currency": "USD",
			"allow_sales_order": 1,
			"payments": [frappe._dict(mode_of_payment="Cash")],
			**overrides,
		}
	)


class TestSalesOrderGates(unittest.TestCase):
	"""The Sales Order endpoints are reachable only through a profile that allows them (#181)."""

	@patch("xpos.api.sales_orders.resolve_pos_profile", return_value=profile(allow_sales_order=0))
	def test_refused_when_the_profile_does_not_allow_sales_orders(self, _resolve):
		for call in (
			lambda: sales_orders.search_orders("P"),
			lambda: sales_orders.search_quotations("P"),
			lambda: sales_orders.create_sales_order({"pos_profile": "P", "customer": "X"}),
			lambda: sales_orders.create_quotation({"pos_profile": "P", "customer": "X"}),
		):
			with self.assertRaises(frappe.ValidationError):
				call()

	@patch("xpos.api.sales_orders.resolve_pos_profile", return_value=profile())
	def test_delivery_date_cannot_be_in_the_past(self, _resolve):
		with self.assertRaises(frappe.ValidationError):
			sales_orders.create_sales_order(
				{"pos_profile": "P", "customer": "X", "delivery_date": add_days(nowdate(), -1)}
			)

	def test_the_unguarded_legacy_module_is_gone(self):
		"""It saved any document type from request data with ignore_permissions."""
		with self.assertRaises(ImportError):
			importlib.import_module("xpos.x_pos.api.sales_orders")


class TestDeposits(unittest.TestCase):
	def order(self):
		return MagicMock(customer="X", company="C", rounded_total=300, grand_total=300)

	def test_no_deposit_takes_nothing(self):
		self.assertEqual(sales_orders.take_deposits(self.order(), profile(), [{"amount": 0}], None), [])

	def test_a_deposit_needs_an_open_shift(self):
		with self.assertRaises(frappe.ValidationError):
			sales_orders.take_deposits(
				self.order(), profile(), [{"mode_of_payment": "Cash", "amount": 50}], None
			)

	def test_a_deposit_cannot_exceed_the_order(self):
		with self.assertRaises(frappe.ValidationError):
			sales_orders.take_deposits(
				self.order(), profile(), [{"mode_of_payment": "Cash", "amount": 301}], "SHIFT"
			)

	def test_a_deposit_uses_a_mode_of_the_profile(self):
		with self.assertRaises(frappe.ValidationError):
			sales_orders.take_deposits(
				self.order(), profile(), [{"mode_of_payment": "Wire", "amount": 50}], "SHIFT"
			)

	@patch("xpos.api.payments.create_payment_entry", return_value={"name": "PE-1"})
	def test_a_deposit_is_a_payment_entry_against_the_order(self, create):
		so = self.order()
		so.name = "SO-1"
		taken = sales_orders.take_deposits(
			so, profile(), [{"mode_of_payment": "Cash", "amount": 50}], "SHIFT"
		)
		self.assertEqual(taken, [{"name": "PE-1", "amount": 50}])
		sent = create.call_args.args[0]
		self.assertEqual((sent["reference_doctype"], sent["reference_name"]), ("Sales Order", "SO-1"))
		self.assertTrue(sent["submit"])
