"""Convert legacy free-text Suspect Profile case references into Case Reference links."""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.table_exists("tabSuspect Profile"):
		return
	if not frappe.db.table_exists("tabCase Reference"):
		return

	rows = frappe.db.sql(
		"""
		SELECT name, case_reference
		FROM `tabSuspect Profile`
		WHERE IFNULL(TRIM(case_reference), '') != ''
		""",
		as_dict=True,
	)

	created_by_text: dict[str, str] = {}

	for row in rows:
		ref = (row.case_reference or "").strip()
		if not ref:
			continue
		if frappe.db.exists("Case Reference", ref):
			continue

		case_name = created_by_text.get(ref)
		if not case_name:
			case = frappe.get_doc(
				{
					"doctype": "Case Reference",
					"case_title": ref[:140],
					"status": "Open",
				}
			)
			if len(ref) <= 140 and not frappe.db.exists("Case Reference", {"case_number": ref}):
				case.case_number = ref
			case.insert(ignore_permissions=True)
			case_name = case.name
			created_by_text[ref] = case_name

		frappe.db.set_value("Suspect Profile", row.name, "case_reference", case_name, update_modified=False)
