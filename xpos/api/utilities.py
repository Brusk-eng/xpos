# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
POS Utilities API.

- Selling price lists
- App info & version
- Sales person names
- Tax inclusive settings
- Language options
"""

import platform
import subprocess

import frappe
from frappe import _
from frappe.utils import cint


@frappe.whitelist()
def get_version_info():
	"""Returns version and system info for the About dialog."""

	xpos_version = "0.0.1"
	try:
		import xpos

		xpos_version = xpos.__version__
	except Exception:
		pass

	frappe_version = ""
	erpnext_version = ""
	try:
		import frappe as _frappe

		frappe_version = _frappe.__version__
	except Exception:
		pass
	try:
		import erpnext

		erpnext_version = erpnext.__version__
	except Exception:
		pass

	# Git info for xpos app
	git_branch = ""
	git_hash = ""
	git_date = ""
	try:
		import os

		app_path = os.path.join(frappe.get_app_path("xpos"), "..")
		git_branch = (
			subprocess.check_output(
				["git", "rev-parse", "--abbrev-ref", "HEAD"],
				cwd=app_path,
				stderr=subprocess.DEVNULL,
			)
			.decode()
			.strip()
		)
		git_hash = (
			subprocess.check_output(
				["git", "rev-parse", "--short", "HEAD"],
				cwd=app_path,
				stderr=subprocess.DEVNULL,
			)
			.decode()
			.strip()
		)
		git_date = (
			subprocess.check_output(
				["git", "log", "-1", "--format=%ci"],
				cwd=app_path,
				stderr=subprocess.DEVNULL,
			)
			.decode()
			.strip()
		)
	except Exception:
		pass

	return {
		"xpos_version": xpos_version,
		"frappe_version": frappe_version,
		"erpnext_version": erpnext_version,
		"git_branch": git_branch,
		"git_hash": git_hash,
		"git_date": git_date,
		"python_version": platform.python_version(),
		"os_info": f"{platform.system()} {platform.release()}",
		"site_name": frappe.local.site,
	}


@frappe.whitelist()
def get_selling_price_lists():
	"""Lists all selling price lists."""

	return frappe.get_all(
		"Price List",
		filters={"selling": 1, "enabled": 1},
		fields=["name"],
		order_by="name asc",
	)


@frappe.whitelist()
def get_pos_profile_tax_inclusive(pos_profile: str):
	"""Returns tax inclusive flag for a POS Profile."""

	try:
		return cint(frappe.db.get_value("POS Profile", pos_profile, "tax_inclusive"))
	except Exception:
		return 0


@frappe.whitelist()
def get_active_pos_profile(user: str | None = None):
	"""Returns the active POS Profile for a user."""

	user = user or frappe.session.user

	profiles = frappe.db.sql(
		"""
		SELECT DISTINCT p.name, p.company, p.currency, p.warehouse
		FROM `tabPOS Profile` p
		INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
		WHERE p.disabled = 0 AND u.user = %(user)s
		ORDER BY u.default DESC, p.name ASC
		LIMIT 1
		""",
		{"user": user},
		as_dict=True,
	)

	if profiles:
		return frappe.get_cached_doc("POS Profile", profiles[0].name).as_dict()
	return None


def get_profile_setting(profile: str, setting: str, default=None):
	"""Helper to get a setting from POS Profile."""
	try:
		return frappe.get_cached_value("POS Profile", profile, setting) or default
	except Exception:
		return default


@frappe.whitelist()
def get_default_warehouse(company: str | None = None):
	"""Returns default warehouse for a company."""

	if not company:
		company = frappe.defaults.get_user_default("company")
	if not company:
		return None

	warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
	if warehouse:
		return warehouse
	return frappe.db.get_value("Company", company, "default_warehouse_for_sales")
