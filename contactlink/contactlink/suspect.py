"""Suspect profile phone matching across all device contact lists."""

from __future__ import annotations

import frappe

CACHE_KEY = "contactlink_suspect_phone_map_v1"


def _normalize_phone(phone: str | None) -> str:
	if not phone:
		return ""
	digits = "".join(c for c in str(phone) if c.isdigit())
	if not digits:
		return str(phone).strip()
	if len(digits) == 11 and digits.startswith("0"):
		return "234" + digits[1:]
	if len(digits) == 10 and digits[0] in "789":
		return "234" + digits
	return digits


def clear_suspect_cache() -> None:
	frappe.cache.delete_value(CACHE_KEY)


def _get_suspect_phone_map(*, active_only: bool = True) -> dict[str, list[dict]]:
	cached = frappe.cache.get_value(CACHE_KEY)
	if cached is not None:
		return cached

	filters: dict = {}
	if active_only:
		filters["status"] = "Active"

	profiles = frappe.get_all(
		"Suspect Profile",
		filters=filters,
		fields=["name", "suspect_name", "case_reference", "status"],
	)
	case_titles: dict[str, str] = {}
	case_names = sorted({(p.case_reference or "").strip() for p in profiles if (p.case_reference or "").strip()})
	if case_names:
		for case_row in frappe.get_all(
			"Case Reference",
			filters={"name": ["in", case_names]},
			fields=["name", "case_title", "case_number"],
		):
			label = (case_row.case_title or case_row.name or "").strip()
			if case_row.case_number:
				label = f"{label} ({case_row.case_number})" if label else case_row.case_number
			case_titles[case_row.name] = label

	phone_map: dict[str, list[dict]] = {}

	for profile in profiles:
		rows = frappe.get_all(
			"Suspect Phone Number",
			filters={"parent": profile.name, "parenttype": "Suspect Profile"},
			fields=["phone_number", "phone_label", "notes"],
		)
		for row in rows:
			norm = _normalize_phone(row.get("phone_number"))
			if not norm:
				continue
			case_name = (profile.case_reference or "").strip()
			phone_map.setdefault(norm, []).append(
				{
					"profile_name": profile.name,
					"suspect_name": profile.suspect_name,
					"case_reference": case_name,
					"case_title": case_titles.get(case_name, case_name),
					"status": profile.status,
					"phone_label": (row.get("phone_label") or "").strip(),
					"phone_notes": (row.get("notes") or "").strip(),
					"suspect_phone_display": (row.get("phone_number") or "").strip(),
				}
			)

	frappe.cache.set_value(CACHE_KEY, phone_map, expires_in_sec=600)
	return phone_map


def suspect_info_for_phone(phone: str | None, suspect_map: dict[str, list[dict]] | None = None) -> dict:
	suspect_map = suspect_map if suspect_map is not None else _get_suspect_phone_map()
	matches = suspect_map.get(_normalize_phone(phone), [])
	return {
		"is_suspect": bool(matches),
		"suspect_matches": matches,
	}


def annotate_contact_row(row: dict, suspect_map: dict[str, list[dict]] | None = None) -> dict:
	info = suspect_info_for_phone(row.get("phone_number"), suspect_map)
	out = dict(row)
	out.update(info)
	return out


def get_device_suspect_hits(device_name: str) -> dict:
	rows = frappe.db.sql(
		"""
		SELECT name, contact_name, phone_number, idx
		FROM `tabDevice Contact`
		WHERE parent = %s AND parenttype = 'Device Id'
		ORDER BY idx
		""",
		device_name,
		as_dict=True,
	)
	suspect_map = _get_suspect_phone_map()
	hits = []
	for row in rows:
		info = suspect_info_for_phone(row.get("phone_number"), suspect_map)
		if not info["is_suspect"]:
			continue
		hits.append(
			{
				"name": row.name,
				"contact_name": (row.contact_name or "").strip(),
				"phone_number": (row.phone_number or "").strip(),
				"idx": row.idx,
				**info,
			}
		)
	owner_rows = frappe.db.sql(
		"""
		SELECT name, sim_slot, phone_number, label, idx
		FROM `tabDevice Own Phone Number`
		WHERE parent = %s AND parenttype = 'Device Id'
		ORDER BY idx
		""",
		device_name,
		as_dict=True,
	)
	owner_hits = []
	for row in owner_rows:
		info = suspect_info_for_phone(row.get("phone_number"), suspect_map)
		if not info["is_suspect"]:
			continue
		owner_hits.append(
			{
				"name": row.name,
				"sim_slot": (row.sim_slot or "").strip(),
				"phone_number": (row.phone_number or "").strip(),
				"label": (row.label or "").strip(),
				"idx": row.idx,
				**info,
			}
		)

	return {
		"device_name": device_name,
		"total_contacts": len(rows),
		"suspect_hit_count": len(hits),
		"hits": hits,
		"owner_phone_suspect_hit_count": len(owner_hits),
		"owner_phone_hits": owner_hits,
	}


def get_investigation_suspect_report() -> dict:
	"""All device contacts that match any active suspect number."""
	suspect_map = _get_suspect_phone_map()
	if not suspect_map:
		return {"hits": [], "summary": {"suspect_profiles": 0, "suspect_phones": 0, "flagged_rows": 0}}

	suspect_norms = set(suspect_map)
	rows = frappe.db.sql(
		"""
		SELECT
			dc.contact_name,
			dc.phone_number,
			dc.parent AS device_name,
			IFNULL(NULLIF(TRIM(d.odner_name), ''), d.name) AS owner_label
		FROM `tabDevice Contact` dc
		INNER JOIN `tabDevice Id` d ON d.name = dc.parent AND dc.parenttype = 'Device Id'
		""",
		as_dict=True,
	)

	hits: list[dict] = []
	for row in rows:
		norm = _normalize_phone(row.get("phone_number"))
		if norm not in suspect_norms:
			continue
		for match in suspect_map[norm]:
			hits.append(
				{
					"device_name": row.device_name,
					"owner_label": row.owner_label,
					"contact_name": (row.contact_name or "").strip(),
					"phone_number": (row.phone_number or "").strip(),
					"phone_norm": norm,
					**match,
				}
			)

	profile_count = len(frappe.get_all("Suspect Profile", filters={"status": "Active"}))
	return {
		"hits": hits,
		"summary": {
			"suspect_profiles": profile_count,
			"suspect_phones": len(suspect_map),
			"flagged_rows": len(hits),
		},
	}
