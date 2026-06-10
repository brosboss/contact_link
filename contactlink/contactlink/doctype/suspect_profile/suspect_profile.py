# Copyright (c) 2026, brossboss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SuspectProfile(Document):
	def on_update(self):
		from contactlink.contactlink.suspect import clear_suspect_cache

		clear_suspect_cache()

	def on_trash(self):
		from contactlink.contactlink.suspect import clear_suspect_cache

		clear_suspect_cache()
