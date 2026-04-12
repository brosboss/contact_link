# Copyright (c) 2026, brossboss and contributors
# For license information, please see license.txt

"""Sample Device Id + Device Contact rows to exercise Contact Link Analysis."""

import frappe
from frappe import _

DEMO_PREFIX = "DemoLink:"

# (owner_label, list of (phone_display, contact_name))
DEMO_DEVICES: list[tuple[str, list[tuple[str, str]]]] = [
	(
		f"{DEMO_PREFIX} Alice Chen",
		[
			# Same 7-digit core as Bob & Carol (formatting differs; normalization matches digits only)
			("555-0100", "Work desk"),
			("555-0101", "Spouse"),
			("555-0199", "Gym"),
		],
	),
	(
		f"{DEMO_PREFIX} Bob Okoro",
		[
			("555-0100", "Office"),  # shared hub — links Alice, Bob, Carol
			("555-0200", "Sister"),
		],
	),
	(
		f"{DEMO_PREFIX} Carol Mehta",
		[
			("555 0100", "Reception"),  # same digits as 555-0100
			("555-0300", "Doctor"),
		],
	),
	(
		f"{DEMO_PREFIX} Dan Volkov",
		[
			("555-0400", "Only contact"),
		],
	),
	(
		f"{DEMO_PREFIX} Eva Laurent",
		[
			("555 0200", "Brother"),  # same digits as Bob's 555-0200
			("555-0500", "Coach"),
		],
	),
]


def _demo_names_query():
	return {"odner_name": ("like", f"{DEMO_PREFIX}%")}


def _count_demo_devices() -> int:
	return frappe.db.count("Device Id", _demo_names_query())


@frappe.whitelist()
def seed_contact_link_demo(replace: bool | int | None = False):
	"""Insert demo Device Id documents. Idempotent unless replace=True.

	Args:
	    replace: If true, delete existing DemoLink:* devices first.
	"""
	frappe.has_permission("Device Id", "write", throw=True)

	replace = bool(replace)
	if replace:
		clear_contact_link_demo()

	if _count_demo_devices() > 0:
		return {
			"status": "exists",
			"message": _("Demo data already present. Pass replace=1 to recreate."),
			"count": _count_demo_devices(),
		}

	created = []
	for owner_label, contacts in DEMO_DEVICES:
		doc = frappe.new_doc("Device Id")
		doc.odner_name = owner_label
		for phone, cname in contacts:
			doc.append(
				"device_contact",
				{
					"phone_number": phone,
					"contact_name": cname,
				},
			)
		doc.insert()
		created.append(doc.name)

	return {
		"status": "created",
		"message": _("Created {0} demo Device Id records.").format(len(created)),
		"names": created,
	}


@frappe.whitelist()
def clear_contact_link_demo():
	"""Delete all Device Id rows whose Owner Name starts with DemoLink:"""
	frappe.has_permission("Device Id", "write", throw=True)

	names = frappe.get_all("Device Id", filters=_demo_names_query(), pluck="name")
	for name in names:
		frappe.delete_doc("Device Id", name, force=True)

	return {
		"status": "cleared",
		"message": _("Removed {0} demo Device Id record(s).").format(len(names)),
		"deleted": names,
	}
