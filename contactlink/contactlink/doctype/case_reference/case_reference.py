# Copyright (c) 2026, brossboss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from contactlink.contactlink.doctype.case_reference.case_links import (
	remove_all_links_for_case,
	sync_linked_cases,
	validate_linked_cases,
)


class CaseReference(Document):
	def validate(self):
		if not self.opening_date:
			self.opening_date = today()

		if self.closing_date and self.opening_date:
			if getdate(self.closing_date) < getdate(self.opening_date):
				frappe.throw(_("Closing Date cannot be before Opening Date."))

		if self.status in ("Closed", "Archived") and not self.closing_date:
			self.closing_date = today()

		validate_linked_cases(self)

	def on_update(self):
		sync_linked_cases(self)

	def on_trash(self):
		remove_all_links_for_case(self.name)
