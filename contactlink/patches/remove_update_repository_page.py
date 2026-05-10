# Copyright (c) 2026, brossboss and contributors
import frappe


def execute():
	"""Remove the Update Repository desk page; UI was removed from the app."""
	if frappe.db.exists("Page", "update-repository"):
		frappe.delete_doc("Page", "update-repository", force=True)
