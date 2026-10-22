# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Live checks for the offline catalogue snapshot/delta feed and offline payment modes."""

import zlib
from unittest.mock import patch

import frappe
from erpnext.tests.utils import ERPNextTestSuite

from xpos.api import catalog_log, catalog_sync
from xpos.api.tests.test_profile_settings_hardening import ensure, ensure_user, make_profile
from xpos.patches.v3 import add_catalog_change_log

PREFIX = "_TCS"
GROUP = "_Test CS Group"
OTHER_GROUP = "_Test CS Other Group"
STORE = "_Test CS Store"
PRICE_LIST = "_Test CS Prices"
CASHIER = "cs-cashier@example.com"
SECOND = "cs-second@example.com"
OUTSIDER = "cs-outsider@example.com"
PROFILE = "_Test CS Profile"
GROUP_PROFILE = "_Test CS Group Profile"


def code(n):
	return f"{PREFIX}-{n:03d}"


class CatalogSyncTestCase(ERPNextTestSuite):
	def setUp(self):
		frappe.set_user("Administrator")
		company, abbr = "_Test Company", "_TC"
		for name in (GROUP, OTHER_GROUP):
			ensure(
				"Item Group",
				name,
				{"item_group_name": name, "parent_item_group": "All Item Groups", "is_group": 0},
			)
		self.warehouse = f"{STORE} - {abbr}"
		ensure("Warehouse", self.warehouse, {"warehouse_name": STORE, "company": company})
		ensure("Price List", PRICE_LIST, {"price_list_name": PRICE_LIST, "selling": 1, "currency": "INR"})
		for n in range(0, 12):
			if frappe.db.exists("Item", code(n)):
				frappe.delete_doc("Item", code(n), force=True, ignore_permissions=True)
		frappe.db.delete("User Permission", {"user": ["in", [CASHIER, SECOND, OUTSIDER]]})
		for n in range(1, 6):
			ensure(
				"Item",
				code(n),
				{
					"item_code": code(n),
					"item_name": f"Item {n}",
					"item_group": GROUP if n < 5 else OTHER_GROUP,
					"stock_uom": "Nos",
					"is_stock_item": 1,
					"is_sales_item": 1,
				},
			)
		frappe.db.delete("Item Price", {"item_code": ["like", f"{PREFIX}-%"]})
		for n in range(1, 6):
			self.set_price(code(n), n * 10)
		frappe.db.delete("Bin", {"item_code": ["like", f"{PREFIX}-%"]})
		for n in (1, 2):
			frappe.db.sql(
				"insert into tabBin (name, item_code, warehouse, actual_qty, creation, modified, owner, modified_by)"
				" values (%s,%s,%s,%s,now(6),now(6),'Administrator','Administrator')",
				(f"{code(n)}-{self.warehouse}", code(n), self.warehouse, n * 5),
			)
		frappe.db.set_single_value("POS Settings", "invoice_type", "Sales Invoice")
		for user in (CASHIER, SECOND, OUTSIDER):
			ensure_user(user, ["Sales User"])
		self.profile = make_profile(
			PROFILE,
			warehouse=self.warehouse,
			selling_price_list=PRICE_LIST,
			users=[(CASHIER, None, 0), (SECOND, None, 0)],
		)
		frappe.db.delete(catalog_log.DOCTYPE)
		frappe.db.set_default(catalog_log.PRUNED_KEY, 0)
		frappe.db.delete("Customer", {"name": ["like", f"{PREFIX}-C%"]})

	def tearDown(self):
		frappe.set_user("Administrator")

	def set_price(self, item, rate):
		frappe.db.delete("Item Price", {"item_code": item, "price_list": PRICE_LIST})
		frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": item,
				"price_list": PRICE_LIST,
				"price_list_rate": rate,
				"selling": 1,
			}
		).insert(ignore_permissions=True)

	def begin(self, profile=PROFILE):
		return catalog_sync.catalog_begin(profile)

	def download(self, started, limit=2):
		items, cursor = [], started["cursors"]["items"]
		while cursor:
			page = catalog_sync.catalog_page(PROFILE, cursor, limit)
			self.assertNotIn("resync", page)
			items += page["items"]
			cursor = page["next_cursor"]
		return items

	def mine(self, rows, key="item_code"):
		return [row[key] for row in rows if str(row[key]).startswith(PREFIX)]

	def test_snapshot_pages_cover_the_catalogue_once_in_code_order(self):
		items = self.download(self.begin())
		codes = self.mine(items)
		self.assertEqual(codes, [code(n) for n in range(1, 6)])
		self.assertEqual({row.item_code: row.rate for row in items}[code(3)], 30)

	def test_page_size_is_capped(self):
		started = self.begin()
		page = catalog_sync.catalog_page(PROFILE, started["cursors"]["items"], 10**6)
		self.assertLessEqual(len(page["items"]), catalog_sync.MAX_PAGE_LENGTH)

	def test_keyset_pages_do_not_skip_when_rows_are_added_before_the_cursor(self):
		started = self.begin()
		first = catalog_sync.catalog_page(PROFILE, started["cursors"]["items"], 2)
		ensure(
			"Item",
			f"{PREFIX}-000",
			{
				"item_code": f"{PREFIX}-000",
				"item_name": "Zero",
				"item_group": GROUP,
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"is_sales_item": 1,
			},
		)
		rest, cursor = [], first["next_cursor"]
		while cursor:
			page = catalog_sync.catalog_page(PROFILE, cursor, 2)
			rest += page["items"]
			cursor = page["next_cursor"]
		seen = self.mine(first["items"] + rest)
		self.assertEqual(seen, [code(n) for n in range(1, 6)], "offset paging would have repeated a row here")
		delta = catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"])
		self.assertIn(f"{PREFIX}-000", self.mine(delta["upserts"]))

	def test_digest_matches_what_was_downloaded(self):
		started = self.begin()
		codes = self.mine(self.download(started))
		digest = catalog_sync.catalog_digest(PROFILE)
		mine = [c for c in self.all_codes() if c.startswith(PREFIX)]
		self.assertEqual(codes, mine)
		self.assertEqual(digest["count"], len(self.all_codes()))
		self.assertEqual(digest["checksum"], sum(zlib.crc32(c.encode()) for c in self.all_codes()))
		self.assertEqual(digest["scope_hash"], started["scope_hash"])

	def all_codes(self):
		return [row.item_code for row in self.page_all()]

	def page_all(self):
		started = self.begin()
		return self.download(started, 500)

	def test_stock_pages(self):
		started = self.begin()
		rows, cursor = [], started["cursors"]["stock"]
		while cursor:
			page = catalog_sync.catalog_stock_page(PROFILE, cursor, 2)
			rows += page["rows"]
			cursor = page["next_cursor"]
		stock = {row["item_code"]: row["actual_qty"] for row in rows}
		self.assertEqual(stock[code(1)], 5)
		self.assertEqual(stock[code(2)], 10)
		self.assertEqual(stock[code(3)], 0)

	def test_customers_are_paged_by_key(self):
		for n in range(3):
			ensure(
				"Customer",
				f"{PREFIX}-C{n}",
				{"customer_name": f"{PREFIX}-C{n}", "customer_group": "Individual"},
			)
		started = self.begin()
		names, cursor = [], started["cursors"]["customers"]
		while cursor:
			page = catalog_sync.catalog_customers_page(PROFILE, cursor, 2)
			names += [row.name for row in page["customers"]]
			cursor = page["next_cursor"]
		self.assertEqual([n for n in names if n.startswith(PREFIX)], [f"{PREFIX}-C{n}" for n in range(3)])
		self.assertEqual(len(names), len(set(names)))

	def test_delta_reports_price_change_new_item_and_removals(self):
		started = self.begin()
		self.set_price(code(1), 11)
		frappe.db.set_value("Item", code(2), "disabled", 1)
		ensure(
			"Item",
			code(9),
			{
				"item_code": code(9),
				"item_name": "Nine",
				"item_group": GROUP,
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"is_sales_item": 1,
			},
		)
		frappe.get_doc("Item", code(3)).delete()
		frappe.get_doc("Item", code(4)).db_set("item_group", OTHER_GROUP)
		frappe.get_doc("Item", code(4)).save()
		delta = catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"])
		upserts = {row.item_code: row.rate for row in delta["upserts"]}
		self.assertEqual(upserts[code(1)], 11)
		self.assertIn(code(9), upserts)
		self.assertIn(code(2), delta["removed"], "disabled items leave the catalogue")
		self.assertIn(code(3), delta["removed"], "deleted items leave the catalogue")

	def test_item_leaving_the_profiles_item_groups_is_removed(self):
		make_profile(
			GROUP_PROFILE,
			warehouse=self.warehouse,
			selling_price_list=PRICE_LIST,
			users=[(CASHIER, None, 0)],
			item_groups=[{"item_group": GROUP}],
		)
		started = catalog_sync.catalog_begin(GROUP_PROFILE)
		frappe.db.set_value("Item", code(1), "item_group", OTHER_GROUP)
		frappe.get_doc("Item", code(1)).save()
		delta = catalog_sync.catalog_delta(GROUP_PROFILE, started["cursors"]["delta"])
		self.assertIn(code(1), delta["removed"])
		self.assertNotIn(code(1), self.mine(delta["upserts"]))

	def test_delta_cursor_advances_and_pages(self):
		started = self.begin()
		for n in (1, 2, 3):
			self.set_price(code(n), 100 + n)
		cursor, seen, calls = started["cursors"]["delta"], set(), 0
		while True:
			delta = catalog_sync.catalog_delta(PROFILE, cursor, 1)
			calls += 1
			seen |= {row.item_code for row in delta["upserts"]}
			cursor = delta["next_cursor"]
			if not delta["has_more"]:
				break
		self.assertTrue({code(1), code(2), code(3)} <= seen)
		self.assertGreater(calls, 1)
		again = catalog_sync.catalog_delta(PROFILE, cursor)
		self.assertTrue({row.item_code for row in again["upserts"]} <= seen, "overlap only re-sends")
		self.assertEqual(again["removed"], [])

	def test_overlap_catches_a_row_logged_with_an_older_sequence(self):
		catalog_log.write("item", [code(1), code(2)])
		first, second = sorted(frappe.db.sql_list("SELECT name FROM `tabXPOS Catalog Change`"))
		started = self.begin()
		self.assertEqual(started["watermark"], second)
		frappe.db.sql("DELETE FROM `tabXPOS Catalog Change` WHERE name = %s", first)
		catalog_log.write("item", [code(5)])
		frappe.db.sql("UPDATE `tabXPOS Catalog Change` SET name = %s WHERE ref = %s", (first, code(5)))
		delta = catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"])
		self.assertIn(code(5), self.mine(delta["upserts"]))

	def test_delta_is_repeatable(self):
		started = self.begin()
		self.set_price(code(1), 12)
		first = catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"])
		second = catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"])
		self.assertEqual(
			[row.item_code for row in first["upserts"]], [row.item_code for row in second["upserts"]]
		)

	def test_group_price_list_and_profile_changes_force_a_resync(self):
		for doctype, name, field in (
			("Item Group", GROUP, "item_group_name"),
			("Price List", PRICE_LIST, "price_list_name"),
		):
			started = self.begin()
			doc = frappe.get_doc(doctype, name)
			doc.save(ignore_permissions=True)
			self.assertEqual(
				catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"]),
				{"resync": "reset_required"},
				doctype,
			)
			self.assertTrue(field)
		started = self.begin()
		frappe.get_doc("POS Profile", PROFILE).save(ignore_permissions=True)
		self.assertEqual(
			catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"]), {"resync": "reset_required"}
		)

	def test_forged_or_foreign_cursors_never_return_data(self):
		started = self.begin()
		cursor = started["cursors"]["items"]
		self.assertEqual(catalog_sync.catalog_page(PROFILE, cursor + "x"), {"resync": "invalid_cursor"})
		self.assertEqual(catalog_sync.catalog_page(PROFILE, "garbage"), {"resync": "invalid_cursor"})
		self.assertEqual(
			catalog_sync.catalog_stock_page(PROFILE, cursor), {"resync": "invalid_cursor"}, "wrong phase"
		)
		body, _signature = cursor.split(".")
		self.assertEqual(
			catalog_sync.catalog_page(PROFILE, f"{body}.{'0' * 64}"), {"resync": "invalid_cursor"}
		)

	def test_cursor_is_bound_to_user_and_profile(self):
		frappe.set_user(CASHIER)
		started = self.begin()
		frappe.set_user(SECOND)
		self.assertEqual(
			catalog_sync.catalog_page(PROFILE, started["cursors"]["items"]), {"resync": "scope_changed"}
		)
		frappe.set_user("Administrator")
		make_profile(
			GROUP_PROFILE, warehouse=self.warehouse, selling_price_list=PRICE_LIST, users=[(CASHIER, None, 0)]
		)
		other = catalog_sync.catalog_begin(GROUP_PROFILE)
		self.assertEqual(
			catalog_sync.catalog_page(PROFILE, other["cursors"]["items"]), {"resync": "scope_changed"}
		)

	def test_user_without_access_is_refused(self):
		frappe.db.delete("Has Role", {"parent": OUTSIDER, "role": ["in", ["Sales User", "Accounts User"]]})
		frappe.clear_cache(user=OUTSIDER)
		frappe.set_user(OUTSIDER)
		for call in (
			lambda: catalog_sync.catalog_begin(PROFILE),
			lambda: catalog_sync.catalog_digest(PROFILE),
			lambda: catalog_sync.catalog_page(PROFILE, "x"),
			lambda: catalog_sync.catalog_delta(PROFILE, "x"),
		):
			with self.assertRaises(frappe.PermissionError):
				call()

	def test_permission_change_invalidates_the_scope(self):
		frappe.set_user(CASHIER)
		started = self.begin()
		frappe.set_user("Administrator")
		frappe.get_doc(
			{"doctype": "User Permission", "user": CASHIER, "allow": "Item Group", "for_value": GROUP}
		).insert(ignore_permissions=True)
		frappe.set_user(CASHIER)
		self.assertEqual(
			catalog_sync.catalog_page(PROFILE, started["cursors"]["items"]), {"resync": "scope_changed"}
		)

	def test_cursor_expires_with_the_change_log(self):
		started = self.begin()
		frappe.db.set_default(catalog_log.PRUNED_KEY, started["watermark"] + 5)
		self.assertEqual(
			catalog_sync.catalog_delta(PROFILE, started["cursors"]["delta"]), {"resync": "cursor_expired"}
		)
		fresh = self.begin()
		with patch.object(catalog_sync.time, "time", return_value=catalog_sync.time.time() + 9 * 86400):
			self.assertEqual(
				catalog_sync.catalog_page(PROFILE, fresh["cursors"]["items"]), {"resync": "cursor_expired"}
			)

	def test_pruning_forgets_old_rows_only(self):
		catalog_log.write("item", [code(1)])
		frappe.db.sql(
			"UPDATE `tabXPOS Catalog Change` SET logged_at = %s",
			frappe.utils.add_days(frappe.utils.now(), -30),
		)
		catalog_log.write("item", [code(2)])
		catalog_log.prune_catalog_changes()
		refs = frappe.db.sql_list("SELECT ref FROM `tabXPOS Catalog Change`")
		self.assertEqual(refs, [code(2)])
		self.assertGreater(catalog_log.pruned_through(), 0)

	def test_offline_payment_modes_default_to_empty(self):
		self.assertEqual(frappe.get_doc("POS Profile", PROFILE).get("offline_payment_modes"), [])

	def test_offline_payment_mode_must_be_a_profile_payment_method(self):
		pos = frappe.get_doc("POS Profile", PROFILE)
		pos.append("offline_payment_modes", {"mode_of_payment": "Cash"})
		pos.save(ignore_permissions=True)
		pos.append("offline_payment_modes", {"mode_of_payment": "Wire Transfer"})
		with self.assertRaises(frappe.ValidationError):
			pos.save(ignore_permissions=True)

	def test_offline_payment_mode_cannot_repeat(self):
		pos = frappe.get_doc("POS Profile", PROFILE)
		pos.append("offline_payment_modes", {"mode_of_payment": "Cash"})
		pos.append("offline_payment_modes", {"mode_of_payment": "Cash"})
		with self.assertRaises(frappe.ValidationError):
			pos.save(ignore_permissions=True)

	def test_shift_payload_carries_the_offline_payment_modes(self):
		pos = frappe.get_doc("POS Profile", PROFILE)
		pos.append("offline_payment_modes", {"mode_of_payment": "Cash"})
		pos.save(ignore_permissions=True)
		modes = [row["mode_of_payment"] for row in pos.as_dict().get("offline_payment_modes")]
		self.assertEqual(modes, ["Cash"])

	def test_patch_can_run_twice(self):
		add_catalog_change_log.execute()
		add_catalog_change_log.execute()
		self.assertTrue(frappe.db.table_exists(catalog_log.DOCTYPE))
