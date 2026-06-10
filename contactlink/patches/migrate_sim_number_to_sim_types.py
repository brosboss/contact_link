"""Move mistaken carrier text from legacy sim_number into sim_types."""

import re

import frappe


def execute():
	if not frappe.db.has_column("Device Id", "sim_number"):
		return

	rows = frappe.db.sql(
		"""
		SELECT name, sim_number
		FROM `tabDevice Id`
		WHERE IFNULL(TRIM(sim_number), '') != ''
		""",
		as_dict=True,
	)
	carrier_pattern = re.compile(r"[A-Za-z]")

	for row in rows:
		value = (row.sim_number or "").strip()
		if not value:
			continue

		updates = {}
		if carrier_pattern.search(value) and not re.fullmatch(r"\+?[\d\s\-()]+", value):
			updates["sim_types"] = value
			updates["sim_number"] = ""
		else:
			existing = frappe.db.count(
				"Device Own Phone Number",
				{"parent": row.name, "parenttype": "Device Id"},
			)
			if not existing:
				doc = frappe.get_doc("Device Id", row.name)
				doc.append(
					"device_own_phone_number",
					{"sim_slot": "SIM 1", "phone_number": value, "label": "Migrated"},
				)
				doc.save(ignore_permissions=True)
				continue
			updates["sim_number"] = ""

		if updates:
			frappe.db.set_value("Device Id", row.name, updates, update_modified=False)

	frappe.db.commit()
