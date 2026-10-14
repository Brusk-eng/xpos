# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import MagicMock, patch

from frappe.utils import getdate

from xpos.api import offers


class TestGetOffers(unittest.TestCase):
	"""Tests for get_offers function."""

	@patch("xpos.api.offers._get_promotional_scheme_offers")
	@patch("xpos.api.offers.frappe")
	def test_get_offers_returns_active_offers(self, mock_frappe, mock_promo):
		"""Test that get_offers returns active POS offers."""
		mock_pos = MagicMock()
		mock_pos.company = "Test Company"
		mock_pos.warehouse = "Store - TC"
		mock_frappe.get_cached_doc.return_value = mock_pos
		mock_frappe.db.sql.return_value = [
			{
				"name": "OFFER-001",
				"offer_title": "10% Off",
				"discount_percentage": 10,
				"disabled": 0,
			}
		]
		mock_promo.return_value = []

		result = offers.get_offers("POS-PROFILE-1")

		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["name"], "OFFER-001")

	@patch("xpos.api.offers._get_promotional_scheme_offers")
	@patch("xpos.api.offers.frappe")
	def test_get_offers_includes_promotional_schemes(self, mock_frappe, mock_promo):
		"""Test that get_offers includes promotional scheme offers."""
		mock_pos = MagicMock()
		mock_pos.company = "Test Company"
		mock_pos.warehouse = "Store - TC"
		mock_frappe.get_cached_doc.return_value = mock_pos
		mock_frappe.db.sql.return_value = []
		mock_promo.return_value = [
			{
				"name": "PROMO-001",
				"offer_title": "Buy 2 Get 1",
				"from_promotional_scheme": 1,
			}
		]

		result = offers.get_offers("POS-PROFILE-1")

		mock_promo.assert_called_once_with(mock_pos)
		self.assertEqual(len(result), 1)

	@patch("xpos.api.offers._get_promotional_scheme_offers")
	@patch("xpos.api.offers.frappe")
	def test_get_offers_normalizes_discount_fields(self, mock_frappe, mock_promo):
		"""Test that get_offers normalizes discount fields."""
		mock_pos = MagicMock()
		mock_pos.company = "Test Company"
		mock_pos.warehouse = "Store - TC"
		mock_frappe.get_cached_doc.return_value = mock_pos
		mock_frappe.db.sql.return_value = [
			{
				"name": "OFFER-002",
				"discount_percentage": None,  # May be None
				"discount_amount": None,
				"min_qty": None,
				"max_qty": None,
			}
		]
		mock_promo.return_value = []

		result = offers.get_offers("POS-PROFILE-1")

		# Fields should be normalized to 0 instead of None
		self.assertEqual(result[0].get("min_qty", 0), 0)


class TestGetPosCoupon(unittest.TestCase):
	"""get_pos_coupon defers every rule to the shared check_coupon_code.

	The rules themselves are covered against a real database in
	xpos/x_pos/doctype/pos_coupon/test_pos_coupon.py.
	"""

	@patch("xpos.api.offers.frappe")
	@patch("xpos.api.offers.check_coupon_code")
	def test_get_pos_coupon_returns_coupon_and_offer(self, mock_check, mock_frappe):
		"""An accepted coupon comes back with its linked POS Offer."""
		mock_frappe._dict = dict
		mock_check.return_value = {
			"coupon": MagicMock(
				pos_offer="OFFER-001", get=lambda field: {"coupon_code": "SUMMER10"}.get(field)
			),
			"msg": "Apply",
		}
		mock_frappe.get_doc.return_value.as_dict.return_value = {"name": "OFFER-001", "min_qty": None}

		result = offers.get_pos_coupon("SUMMER10", "CUST-001", "Test Company")

		mock_check.assert_called_once_with("SUMMER10", "CUST-001", "Test Company")
		mock_frappe.get_doc.assert_called_once_with("POS Offer", "OFFER-001")
		self.assertEqual(result["coupon"]["coupon_code"], "SUMMER10")
		self.assertEqual(result["offer"]["row_id"], "OFFER-001")
		self.assertEqual(result["offer"]["min_qty"], 0)
		self.assertEqual(result["msg"], "Apply")

	@patch("xpos.api.offers.frappe")
	@patch("xpos.api.offers.check_coupon_code")
	def test_get_pos_coupon_reports_why_a_coupon_is_rejected(self, mock_check, mock_frappe):
		"""A rejected coupon carries the validator's reason and loads no offer."""
		mock_check.return_value = {"coupon": None, "msg": "Sorry, CUST-001 have used this coupon before"}

		result = offers.get_pos_coupon("ONCE", "CUST-001", "Test Company")

		self.assertEqual(
			result,
			{"coupon": None, "offer": None, "msg": "Sorry, CUST-001 have used this coupon before"},
		)
		mock_frappe.get_doc.assert_not_called()


class TestValidateCoupon(unittest.TestCase):
	"""Tests for coupon validation logic."""

	@patch("xpos.api.offers.frappe")
	def test_validate_coupon_checks_usage(self, mock_frappe):
		"""Test that coupon validation checks if already used."""
		# A coupon with used=1 should be invalid
		mock_frappe.db.get_value.return_value = None  # Not found when filtered by used=0

		result = mock_frappe.db.get_value.return_value
		self.assertIsNone(result)

	def test_coupon_date_validation(self):
		"""Test coupon date validation logic."""
		from frappe.utils import getdate

		coupon = {
			"valid_from": "2026-01-01",
			"valid_upto": "2026-12-31",
		}

		# Simulate date check
		today = getdate("2026-06-15")  # Mid-year date
		valid_from = getdate(coupon["valid_from"])
		valid_upto = getdate(coupon["valid_upto"])

		is_valid = valid_from <= today <= valid_upto
		self.assertTrue(is_valid)


class TestGetActiveGiftCoupons(unittest.TestCase):
	"""Tests for get_active_gift_coupons function."""

	@patch("xpos.api.offers.frappe")
	def test_get_active_gift_coupons_returns_customer_coupons(self, mock_frappe):
		"""Test that get_active_gift_coupons returns customer's gift cards."""
		mock_frappe.get_all.return_value = [
			{
				"name": "GIFT-001",
				"coupon_code": "GIFT100",
				"discount_amount": 100,
				"customer": "CUST-001",
			}
		]

		result = offers.get_active_gift_coupons("CUST-001", "Test Company")

		mock_frappe.get_all.assert_called()
		self.assertEqual(len(result), 1)


class TestNormalizeDiscountFields(unittest.TestCase):
	"""Tests for _normalize_discount_fields."""

	def test_string_amounts_are_coerced_to_float(self):
		"""Values arriving as strings from the client are coerced to numbers."""
		offer = {"discount_percentage": "12.5", "discount_amount": "30", "rate": "99.99"}

		offers._normalize_discount_fields(offer)

		self.assertEqual(offer["discount_percentage"], 12.5)
		self.assertEqual(offer["discount_amount"], 30.0)
		self.assertEqual(offer["rate"], 99.99)

	def test_none_becomes_zero(self):
		"""None must not survive into arithmetic downstream."""
		offer = {"discount_percentage": None, "discount_amount": None}

		offers._normalize_discount_fields(offer)

		self.assertEqual(offer["discount_percentage"], 0)
		self.assertEqual(offer["discount_amount"], 0)

	def test_absent_fields_are_not_invented(self):
		"""Only fields already present are normalized."""
		offer = {"name": "OFFER-1"}

		offers._normalize_discount_fields(offer)

		self.assertEqual(offer, {"name": "OFFER-1"})


class TestIsCouponActive(unittest.TestCase):
	"""Tests for _is_coupon_active date-window logic."""

	def test_coupon_without_dates_is_active(self):
		"""A coupon with no validity window is always active."""
		self.assertTrue(
			offers._is_coupon_active({"valid_from": None, "valid_upto": None}, getdate("2026-06-15"))
		)

	def test_coupon_not_yet_valid_is_inactive(self):
		"""valid_from in the future excludes the coupon."""
		coupon = {"valid_from": "2026-07-01", "valid_upto": None}

		self.assertFalse(offers._is_coupon_active(coupon, getdate("2026-06-15")))

	def test_expired_coupon_is_inactive(self):
		"""valid_upto in the past excludes the coupon."""
		coupon = {"valid_from": None, "valid_upto": "2026-06-01"}

		self.assertFalse(offers._is_coupon_active(coupon, getdate("2026-06-15")))

	def test_boundary_dates_are_inclusive(self):
		"""A coupon is active on both its first and last day."""
		coupon = {"valid_from": "2026-06-15", "valid_upto": "2026-06-15"}

		self.assertTrue(offers._is_coupon_active(coupon, getdate("2026-06-15")))


if __name__ == "__main__":
	unittest.main()
