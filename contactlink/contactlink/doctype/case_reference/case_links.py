"""Bidirectional linked-case helpers for Case Reference."""

from __future__ import annotations

import frappe
from frappe import _


def linked_case_names(doc) -> set[str]:
	names: set[str] = set()
	for row in doc.get("linked_cases") or []:
		linked = (row.get("linked_case") or "").strip()
		if linked and linked != doc.name:
			names.add(linked)
	return names


def validate_linked_cases(doc) -> None:
	seen: set[str] = set()
	for row in doc.get("linked_cases") or []:
		linked = (row.get("linked_case") or "").strip()
		if not linked:
			continue
		if linked == doc.name:
			frappe.throw(_("A case cannot be linked to itself."))
		if linked in seen:
			frappe.throw(_("Case {0} is linked more than once.").format(linked))
		seen.add(linked)
		if not frappe.db.exists("Case Reference", linked):
			frappe.throw(_("Linked case {0} was not found.").format(linked))


def sync_linked_cases(doc) -> None:
	if getattr(doc.flags, "skip_case_link_sync", False):
		return

	current = linked_case_names(doc)
	previous: set[str] = set()
	if not doc.is_new():
		before = doc.get_doc_before_save()
		if before:
			previous = linked_case_names(before)

	for other in current - previous:
		ensure_reverse_case_link(doc.name, other)

	for other in previous - current:
		remove_reverse_case_link(doc.name, other)


def ensure_reverse_case_link(source_case: str, target_case: str) -> None:
	if not source_case or not target_case or source_case == target_case:
		return
	if not frappe.db.exists("Case Reference", target_case):
		return
	if _has_case_link(target_case, source_case):
		return

	doc = frappe.get_doc("Case Reference", target_case)
	doc.append("linked_cases", {"linked_case": source_case})
	doc.flags.skip_case_link_sync = True
	doc.save(ignore_permissions=True)


def remove_reverse_case_link(source_case: str, target_case: str) -> None:
	if not source_case or not target_case or source_case == target_case:
		return
	if not frappe.db.exists("Case Reference", target_case):
		return
	if not _has_case_link(target_case, source_case):
		return

	doc = frappe.get_doc("Case Reference", target_case)
	doc.linked_cases = [row for row in doc.linked_cases if row.linked_case != source_case]
	doc.flags.skip_case_link_sync = True
	doc.save(ignore_permissions=True)


def remove_all_links_for_case(case_name: str) -> None:
	if not case_name or not frappe.db.exists("Case Reference", case_name):
		return

	linked = frappe.get_all(
		"Case Link",
		filters={"parenttype": "Case Reference", "linked_case": case_name},
		fields=["parent"],
	)
	for row in linked:
		parent = row.parent
		if parent == case_name:
			continue
		remove_reverse_case_link(case_name, parent)


def _has_case_link(parent_case: str, linked_case: str) -> bool:
	return bool(
		frappe.db.exists(
			"Case Link",
			{
				"parent": parent_case,
				"parenttype": "Case Reference",
				"linked_case": linked_case,
			},
		)
	)
