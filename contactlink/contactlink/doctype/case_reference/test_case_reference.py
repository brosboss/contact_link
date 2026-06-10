# Copyright (c) 2026, brossboss and contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase


class TestCaseReference(IntegrationTestCase):
	def test_bidirectional_case_links(self):
		case_a = frappe.get_doc(
			{
				"doctype": "Case Reference",
				"case_title": "Test Case A",
				"status": "Open",
			}
		).insert(ignore_permissions=True)

		case_b = frappe.get_doc(
			{
				"doctype": "Case Reference",
				"case_title": "Test Case B",
				"status": "Open",
			}
		).insert(ignore_permissions=True)

		case_a.append("linked_cases", {"linked_case": case_b.name})
		case_a.save(ignore_permissions=True)

		case_b.reload()
		linked = {row.linked_case for row in case_b.linked_cases}
		self.assertIn(case_a.name, linked)

		case_a.linked_cases = []
		case_a.save(ignore_permissions=True)

		case_b.reload()
		linked = {row.linked_case for row in case_b.linked_cases}
		self.assertNotIn(case_a.name, linked)

		case_a.delete(ignore_permissions=True)
		case_b.delete(ignore_permissions=True)
