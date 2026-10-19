# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Live checks that POS endpoints only return records the caller may see.

Run on a disposable test site::

    bench --site <site> run-tests --module xpos.api.tests.test_record_access
"""

import frappe
from erpnext.accounts.doctype.sales_invoice.test_sales_invoice import create_sales_invoice
from erpnext.tests.utils import ERPNextTestSuite

from xpos.api import customers as customers_api
from xpos.api import invoices as invoices_api
from xpos.api.tests.test_profile_settings_hardening import ensure, ensure_user, make_profile, setup_fixtures

CASHIER = "ra-cashier@example.com"
OWN_PROFILE = "_Test RA Own Profile"
OTHER_PROFILE = "_Test RA Other Profile"
ALLOWED_GROUP = "_Test RA Allowed Group"
OTHER_GROUP = "_Test RA Other Group"
INSIDE = "_Test RA Inside Customer"
OUTSIDE = "_Test RA Outside Customer"


def ensure_customer(name, group):
	ensure(
		"Customer",
		name,
		{
			"customer_name": name,
			"customer_group": group,
			"territory": "All Territories",
			"mobile_no": "0300" + str(abs(hash(name)))[:7],
		},
	)


def draft_on(profile):
	invoice = create_sales_invoice(do_not_save=1)
	invoice.pos_profile = profile
	invoice.insert(ignore_permissions=True)
	return invoice


class RecordAccessTestCase(ERPNextTestSuite):
	def setUp(self):
		frappe.set_user("Administrator")
		setup_fixtures()
		for group in (ALLOWED_GROUP, OTHER_GROUP):
			ensure(
				"Customer Group",
				group,
				{"customer_group_name": group, "parent_customer_group": "All Customer Groups"},
			)
		ensure_customer(INSIDE, ALLOWED_GROUP)
		ensure_customer(OUTSIDE, OTHER_GROUP)
		ensure_user(CASHIER, [])
		make_profile(
			OWN_PROFILE,
			users=[(CASHIER, "Cashier", 0)],
			customer_groups=[{"customer_group": ALLOWED_GROUP}],
		)
		make_profile(OTHER_PROFILE)
		self.own_draft = draft_on(OWN_PROFILE)
		self.other_draft = draft_on(OTHER_PROFILE)
		frappe.set_user(CASHIER)

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()


class TestCustomerScope(RecordAccessTestCase):
	"""Customer endpoints stop at the POS Profile's customer groups."""

	def test_customer_inside_the_profile_groups_is_readable(self):
		info = customers_api.get_customer_info(INSIDE, pos_profile=OWN_PROFILE)
		self.assertEqual(info["name"], INSIDE)
		self.assertEqual(customers_api.get_customer_addresses(INSIDE, pos_profile=OWN_PROFILE), [])

	def test_customer_outside_the_profile_groups_is_refused(self):
		for read in (
			customers_api.get_customer_info,
			customers_api.get_customer_addresses,
			customers_api.get_customer_loyalty_info,
		):
			with self.subTest(read.__name__), self.assertRaises(frappe.PermissionError):
				read(OUTSIDE, pos_profile=OWN_PROFILE)

	def test_customer_outside_the_profile_groups_cannot_be_changed(self):
		with self.assertRaises(frappe.PermissionError):
			customers_api.update_customer(OUTSIDE, {"mobile_no": "03001112222"}, pos_profile=OWN_PROFILE)
		frappe.set_user("Administrator")
		self.assertNotEqual(frappe.db.get_value("Customer", OUTSIDE, "mobile_no"), "03001112222")

	def test_credit_lookup_is_scoped_too(self):
		frappe.set_user("Administrator")
		frappe.db.set_value("POS Profile", OWN_PROFILE, "use_customer_credit", 1)
		frappe.set_user(CASHIER)
		with self.assertRaises(frappe.PermissionError):
			customers_api.get_customer_credit(OUTSIDE, pos_profile=OWN_PROFILE)

	def test_search_only_lists_customers_in_the_profile_groups(self):
		names = {row.name for row in customers_api.get_customers("_Test RA", pos_profile=OWN_PROFILE)}
		self.assertIn(INSIDE, names)
		self.assertNotIn(OUTSIDE, names)

	def test_search_through_someone_elses_profile_is_refused(self):
		with self.assertRaises(frappe.PermissionError):
			customers_api.get_customers("_Test RA", pos_profile=OTHER_PROFILE)

	def test_desk_permission_still_reaches_any_customer(self):
		frappe.set_user("Administrator")
		self.assertEqual(customers_api.get_customer_info(OUTSIDE, pos_profile=OWN_PROFILE)["name"], OUTSIDE)


class TestInvoiceScope(RecordAccessTestCase):
	"""Invoice endpoints load only Sales or POS Invoices of the caller's own till profiles."""

	def test_own_profile_invoice_is_readable(self):
		self.assertEqual(invoices_api.get_invoice_details(self.own_draft.name)["name"], self.own_draft.name)

	def test_other_profile_invoice_is_refused(self):
		name = self.other_draft.name
		for read in (
			lambda: invoices_api.get_invoice_details(name),
			lambda: invoices_api.get_invoice_for_return(name),
			lambda: invoices_api.get_invoice_for_repeat(name),
		):
			with self.assertRaises(frappe.PermissionError):
				read()

	def test_other_profile_draft_cannot_be_deleted(self):
		for delete in (
			lambda: invoices_api.delete_draft_invoice(self.other_draft.name, "Sales Invoice"),
			lambda: invoices_api.discard_draft_invoice(self.other_draft.name, "Sales Invoice"),
		):
			with self.assertRaises(frappe.PermissionError):
				delete()
		self.assertTrue(frappe.db.exists("Sales Invoice", self.other_draft.name))

	def test_non_invoice_doctypes_are_refused(self):
		with self.assertRaises(frappe.PermissionError):
			invoices_api.get_invoice_details(INSIDE, doctype="Customer")
		with self.assertRaises(frappe.PermissionError):
			invoices_api.get_invoice_for_repeat(INSIDE, doctype="Customer")
		with self.assertRaises(frappe.PermissionError):
			invoices_api.discard_draft_invoice(INSIDE, doctype="Customer")
		self.assertTrue(frappe.db.exists("Customer", INSIDE))

	def test_desk_permission_still_reaches_any_invoice(self):
		frappe.set_user("Administrator")
		self.assertEqual(
			invoices_api.get_invoice_details(self.other_draft.name)["name"], self.other_draft.name
		)
