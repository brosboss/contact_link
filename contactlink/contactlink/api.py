# Copyright (c) 2026, brossboss and contributors
# For license information, please see license.txt

import frappe
from frappe import _


import json


def _auto_device_doc_name(device_id: str) -> str:
	"""Stable Device Id name from ADB serial — survives delete/recreate without series clashes."""
	safe = "".join(c for c in device_id if c.isalnum() or c in "-_")
	return f"DEV-{safe or 'UNKNOWN'}"


def _get_device_doc_for_sync(device_id: str):
	"""Find or create the Device Id row for a phone serial."""
	device_name = frappe.db.get_value("Device Id", {"device_id_contact": device_id}, "name")
	if device_name:
		return frappe.get_doc("Device Id", device_name)

	proposed_name = _auto_device_doc_name(device_id)
	if frappe.db.exists("Device Id", proposed_name):
		doc = frappe.get_doc("Device Id", proposed_name)
		if not (doc.get("device_id_contact") or "").strip():
			doc.device_id_contact = device_id
		return doc

	doc = frappe.get_doc(
		{
			"doctype": "Device Id",
			"device_id_contact": device_id,
		}
	)
	doc.name = proposed_name
	doc.flags.name_set = True
	doc.insert(ignore_permissions=True)
	return doc


def _set_import_statistics(
	doc,
	*,
	import_type: str,
	total_contacts: int,
	total_imported: int,
	duplicates_found: int,
	device_details: str | None = None,
	sim_types: str | None = None,
):
	doc.import_type = import_type
	doc.total_contacts = int(total_contacts or 0)
	doc.total_imported = int(total_imported or 0)
	doc.duplicates_found = int(duplicates_found or 0)
	if device_details:
		doc.device_details = device_details.strip()
	if sim_types and not (doc.get("sim_types") or "").strip():
		doc.sim_types = sim_types.strip()


@frappe.whitelist(allow_guest=False)
def sync_device_contacts(device_id, contacts, device_details=None, sim_types=None, sim_number=None):
	"""Import contacts from a USB-connected phone (ADB serial) into Device Id."""
	# Backward compatibility: old clients sent carrier text as sim_number
	if not sim_types and sim_number:
		sim_types = sim_number
	device_id = (device_id or "").strip()
	if not device_id:
		frappe.throw(_("Device ID is required"))

	if isinstance(contacts, str):
		contacts = json.loads(contacts)
	contacts = contacts or []

	doc = _get_device_doc_for_sync(device_id)

	existing_phones: set[str] = set()
	for row in frappe.db.sql(
		"""
		SELECT phone_number
		FROM `tabDevice Contact`
		WHERE parent = %s AND parenttype = 'Device Id'
		""",
		doc.name,
		as_dict=True,
	):
		phone_norm = _normalize_phone(row.get("phone_number"))
		if phone_norm:
			existing_phones.add(phone_norm)
	contacts_before = len(existing_phones)

	import_ref = f"adb-sync-{frappe.utils.now_datetime().strftime('%Y%m%d%H%M%S')}"
	new_records = 0
	duplicates_found = 0
	suspect_hits_in_batch = 0
	rows_on_device = 0
	unique_on_device: set[str] = set()

	from contactlink.contactlink.suspect import _get_suspect_phone_map

	suspect_map = _get_suspect_phone_map()

	for record in contacts:
		if not isinstance(record, dict):
			continue
		name = (record.get("contact_name") or "").strip()
		phone = (record.get("phone_number") or "").strip()
		phone_norm = _normalize_phone(phone)
		if not phone_norm:
			continue
		rows_on_device += 1
		unique_on_device.add(phone_norm)
		if phone_norm in existing_phones:
			duplicates_found += 1
			continue
		if phone_norm in suspect_map:
			suspect_hits_in_batch += 1
		doc.append(
			"device_contact",
			{
				"contact_name": name or phone,
				"phone_number": phone,
				"import_reference": import_ref,
			},
		)
		existing_phones.add(phone_norm)
		new_records += 1

	_set_import_statistics(
		doc,
		import_type="Auto from Device",
		total_contacts=rows_on_device,
		total_imported=new_records,
		duplicates_found=duplicates_found,
		device_details=device_details,
		sim_types=sim_types,
	)
	doc.save(ignore_permissions=True)

	frappe.db.commit()
	return {
		"status": "success",
		"device_name": doc.name,
		"suspect_hits_in_batch": suspect_hits_in_batch,
		"new_records_synced": new_records,
		"rows_on_device": rows_on_device,
		"unique_numbers_on_device": len(unique_on_device),
		"contacts_stored_before": contacts_before,
		"contacts_stored_after": contacts_before + new_records,
		"total_contacts": rows_on_device,
		"duplicates_found": duplicates_found,
		"import_reference": import_ref if new_records else None,
	}

def _normalize_phone(phone: str | None) -> str:
	"""Digits-only canonical form; 080… and +234… treated as the same Nigerian mobile."""
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


def _normalize_contact_name(name: str | None) -> str:
	"""Lowercase, collapse whitespace — used to match saved contact names across devices."""
	if not name:
		return ""
	s = " ".join(str(name).split())
	return s.lower()


def _owner_image_url(path: str | None) -> str | None:
	if not path:
		return None
	fp = str(path).strip()
	if not fp:
		return None
	if fp.startswith("http://") or fp.startswith("https://"):
		return fp
	return frappe.utils.get_url(fp)


def _owner_node_from_entry(e: dict) -> dict:
	oid = f"owner:{e['device_name']}"
	label = (e.get("owner_label") or e.get("device_name") or "")[:40]
	out: dict = {
		"id": oid,
		"label": label,
		"group": "owner",
		"title": f"{e.get('owner_label')} ({e['device_name']})",
		"device_id": e["device_name"],
	}
	url = _owner_image_url(e.get("owner_image"))
	if url:
		out["owner_image_url"] = url
		out["image"] = url
		out["shape"] = "circularImage"
		out["size"] = 36
		out["font"] = {
			"size": 11,
			"color": "#1f2937",
			"face": "system-ui, sans-serif",
		}
		out["borderWidth"] = 1.5
		out["color"] = {
			"border": "#94a8d8",
			"background": "#ffffff",
			"highlight": {"border": "#6b8dd6", "background": "#ffffff"},
		}
	return out


@frappe.whitelist()
def get_contact_link_graph(mode: str | None = "full"):
	"""Build graph data for Contact Link Analysis.

	Args:
	    mode: "full" — device owners, contact points (phones), and owner↔contact edges.
	          "owners" — only owners; edges connect owners who share at least one phone.

	Returns:
	    dict with keys: nodes, edges, stats, mode
	"""
	frappe.has_permission("Device Id", "read", throw=True)

	mode = (mode or "full").lower()
	if mode not in ("full", "owners"):
		mode = "full"

	rows, phone_map = _device_contact_rows()

	stats = {
		"device_rows": len(frappe.get_all("Device Id", pluck="name")),
		"link_rows": len(rows),
		"usable_contact_rows": sum(1 for r in rows if _normalize_phone(r.phone_number)),
		"unique_phones": len(phone_map),
	}

	if mode == "full":
		return _graph_full(phone_map, stats)
	return _graph_owners_only(phone_map, stats)


def _graph_full(phone_map: dict[str, list[dict]], stats: dict) -> dict:
	nodes: dict[str, dict] = {}
	edges: list[dict] = []
	edge_keys: set[str] = set()

	for norm, entries in phone_map.items():
		owners_here = {e["device_name"] for e in entries}
		primary = entries[0]
		phone_display = primary["phone_display"] or norm

		seen_names: list[str] = []
		for e in entries:
			cn = (e.get("contact_name") or "").strip()
			if cn and cn not in seen_names:
				seen_names.append(cn)

		names_line = " · ".join(seen_names[:5])
		if len(seen_names) > 5:
			names_line += "…"
		if names_line:
			node_label = f"{phone_display}\n{names_line}"
		else:
			node_label = phone_display

		title_lines = [phone_display]
		if seen_names:
			title_lines.append(_("Saved as: {0}").format(", ".join(seen_names)))
		per_owner_bits = []
		for e in entries:
			cn = (e.get("contact_name") or "").strip() or _("(no name)")
			per_owner_bits.append(f"{e['owner_label']}: {cn}")
		title_lines.append(" | ".join(per_owner_bits))
		if len(owners_here) > 1:
			title_lines.append(_("Shared by {0} devices").format(len(owners_here)))

		cid = f"phone:{norm}"
		nodes[cid] = {
			"id": cid,
			"label": node_label[:200] + ("…" if len(node_label) > 200 else ""),
			"group": "contact",
			"title": "\n".join(title_lines),
			"phone_norm": norm,
			"phone_display": phone_display,
			"contact_names": seen_names,
			"shared_by": len(owners_here),
		}

		for e in entries:
			oid = f"owner:{e['device_name']}"
			if oid not in nodes:
				nodes[oid] = _owner_node_from_entry(e)
			ek = f"{oid}|{cid}"
			if ek in edge_keys:
				continue
			edge_keys.add(ek)
			cn = (e.get("contact_name") or "").strip()
			edge_label = cn[:32] + ("…" if len(cn) > 32 else "") if cn else ""
			edges.append(
				{
					"id": ek,
					"from": oid,
					"to": cid,
					"arrows": "",
					"label": edge_label,
					"title": _("{0} — {1}").format(phone_display, cn or _("(no name)")),
				}
			)

	stats["owner_nodes"] = len([n for n in nodes.values() if n.get("group") == "owner"])
	stats["contact_nodes"] = len([n for n in nodes.values() if n.get("group") == "contact"])
	return {"nodes": list(nodes.values()), "edges": edges, "stats": stats, "mode": "full"}


def _graph_owners_only(phone_map: dict[str, list[dict]], stats: dict) -> dict:
	nodes: dict[str, dict] = {}
	edge_agg: dict[tuple[str, str], dict] = {}

	for norm, entries in phone_map.items():
		devices = sorted({e["device_name"] for e in entries})
		by_dev = {d: [x for x in entries if x["device_name"] == d] for d in devices}
		for e in entries:
			oid = f"owner:{e['device_name']}"
			if oid not in nodes:
				nodes[oid] = _owner_node_from_entry(e)

		for i, da in enumerate(devices):
			for db in devices[i + 1 :]:
				oa, ob = f"owner:{da}", f"owner:{db}"
				key = (oa, ob) if oa < ob else (ob, oa)
				if key not in edge_agg:
					edge_agg[key] = {"shared_phones": 0, "phones": [], "detail_lines": []}
				edge_agg[key]["shared_phones"] += 1
				if len(edge_agg[key]["phones"]) < 8:
					edge_agg[key]["phones"].append(norm)
				ea = by_dev[da][0]
				eb = by_dev[db][0]
				pa = ea.get("phone_display") or norm
				na = (ea.get("contact_name") or "").strip() or _("(no name)")
				nb = (eb.get("contact_name") or "").strip() or _("(no name)")
				line = _("{0}: “{1}” ↔ “{2}”").format(pa, na, nb)
				if len(edge_agg[key]["detail_lines"]) < 10:
					edge_agg[key]["detail_lines"].append(line)

	edges: list[dict] = []
	for (a, b), meta in edge_agg.items():
		eid = f"{a}|{b}"
		details = meta.get("detail_lines") or []
		title_body = "\n".join(details) if details else _("Shared contacts (see labels on graph)")
		phones_preview = ", ".join(meta["phones"][:3])
		if len(meta["phones"]) > 3:
			phones_preview += "…"
		# Compact edge label: count + first shared number & names hint
		first_lbl = details[0] if details else phones_preview
		if len(first_lbl) > 44:
			first_lbl = first_lbl[:41] + "…"
		label_text = f"{meta['shared_phones']}\n{first_lbl}"
		edges.append(
			{
				"id": eid,
				"from": a,
				"to": b,
				"label": label_text,
				"title": _("{0} shared link(s)\n{1}").format(meta["shared_phones"], title_body),
				"value": meta["shared_phones"],
			}
		)

	stats["owner_nodes"] = len(nodes)
	stats["contact_nodes"] = 0
	stats["owner_edges"] = len(edges)
	return {"nodes": list(nodes.values()), "edges": edges, "stats": stats, "mode": "owners"}


def _device_contact_rows() -> tuple[list[dict], dict[str, list[dict]]]:
	"""Return raw SQL rows and normalized_phone → entry list (same shape as get_contact_link_graph)."""
	rows = frappe.db.sql(
		"""
		SELECT
			d.name AS device_name,
			IFNULL(NULLIF(TRIM(d.odner_name), ''), d.name) AS owner_label,
			d.owner_image,
			dc.phone_number,
			IFNULL(NULLIF(TRIM(dc.contact_name), ''), '') AS contact_name,
			dc.idx AS contact_idx
		FROM `tabDevice Id` d
		INNER JOIN `tabDevice Contact` dc ON dc.parent = d.name AND dc.parenttype = 'Device Id'
		ORDER BY d.name, dc.idx
		""",
		as_dict=True,
	)
	phone_map: dict[str, list[dict]] = {}
	for r in rows:
		norm = _normalize_phone(r.phone_number)
		if not norm:
			continue
		entry = {
			"device_name": r.device_name,
			"owner_label": r.owner_label,
			"owner_image": r.owner_image or "",
			"contact_name": r.contact_name or "",
			"phone_display": (r.phone_number or norm or "").strip() or norm,
			"contact_idx": int(r.contact_idx or 0),
		}
		phone_map.setdefault(norm, []).append(entry)
	return rows, phone_map


def _contact_name_map_from_rows(rows: list[dict]) -> dict[str, list[dict]]:
	"""normalized contact name -> entries (same device can appear multiple times for different rows)."""
	cmap: dict[str, list[dict]] = {}
	for r in rows:
		cn_key = _normalize_contact_name(r.get("contact_name"))
		if not cn_key:
			continue
		norm_phone = _normalize_phone(r.phone_number)
		pd = (r.get("phone_number") or "").strip() or norm_phone or ""
		entry = {
			"device_name": r.device_name,
			"owner_label": r.owner_label,
			"contact_name": (r.contact_name or "").strip(),
			"phone_display": pd,
			"phone_norm": norm_phone,
		}
		cmap.setdefault(cn_key, []).append(entry)
	return cmap


@frappe.whitelist()
def get_device_contact_statistics(device_name: str | None = None):
	"""Per-device overlap by **phone number** and by **saved contact name** (case-insensitive, trimmed).

	Returns mutual_number_rows, mutual_contact_rows, and a combined summary.
	"""
	frappe.has_permission("Device Id", "read", throw=True)
	device_name = (device_name or "").strip()
	if not device_name:
		frappe.throw(_("Device is required"))
	if not frappe.db.exists("Device Id", device_name):
		frappe.throw(_("Device Id {0} was not found").format(device_name))

	rows, phone_map = _device_contact_rows()
	contact_map = _contact_name_map_from_rows(rows)

	device_label = None
	for r in rows:
		if r.device_name == device_name:
			device_label = r.owner_label
			break
	if device_label is None:
		device_label = frappe.db.get_value("Device Id", device_name, "odner_name") or device_name
		device_label = (device_label or "").strip() or device_name

	total_child_rows = 0
	local_by_phone: dict[str, list] = {}
	local_by_contact: dict[str, list] = {}

	for r in rows:
		if r.device_name != device_name:
			continue
		total_child_rows += 1
		pn = _normalize_phone(r.phone_number)
		if pn:
			local_by_phone.setdefault(pn, []).append(r)
		cn_key = _normalize_contact_name(r.get("contact_name"))
		if cn_key:
			local_by_contact.setdefault(cn_key, []).append(r)

	unique_with_phone = len(local_by_phone)
	unique_with_contact_name = len(local_by_contact)

	mutual_number_rows: list[dict] = []
	other_devices_phone: set[str] = set()

	for norm, local_entries in local_by_phone.items():
		entries = phone_map.get(norm, [])
		owners = {e["device_name"] for e in entries}
		if len(owners) < 2:
			continue

		primary = local_entries[0]
		phone_display = (primary.get("phone_number") or "").strip() or norm

		seen_cn: list[str] = []
		for le in local_entries:
			cn = (le.get("contact_name") or "").strip() or _("(no name)")
			if cn not in seen_cn:
				seen_cn.append(cn)

		others: list[dict] = []
		for e in entries:
			if e["device_name"] == device_name:
				continue
			others.append(
				{
					"device_name": e["device_name"],
					"owner_label": e["owner_label"],
					"contact_name": (e.get("contact_name") or "").strip() or _("(no name)"),
					"phone_display": e.get("phone_display") or norm,
				}
			)
			other_devices_phone.add(e["device_name"])

		others.sort(key=lambda x: (x["device_name"], x["contact_name"]))

		mutual_number_rows.append(
			{
				"phone_norm": norm,
				"phone_display": phone_display,
				"contact_names_on_device": seen_cn,
				"total_devices_with_number": len(owners),
				"other_devices_count": len(owners) - 1,
				"other_devices": others,
			}
		)

	mutual_number_rows.sort(key=lambda x: (-x["total_devices_with_number"], str(x["phone_display"])))

	mutual_contact_rows: list[dict] = []
	other_devices_contact: set[str] = set()

	for cn_key, local_entries in local_by_contact.items():
		entries = contact_map.get(cn_key, [])
		owners = {e["device_name"] for e in entries}
		if len(owners) < 2:
			continue

		# Prefer longest / first raw display name on this device for the label
		raw_names = [(le.get("contact_name") or "").strip() for le in local_entries]
		raw_names = [x for x in raw_names if x]
		contact_display = max(raw_names, key=len) if raw_names else cn_key

		phones_here: list[str] = []
		for le in local_entries:
			pd = (le.get("phone_number") or "").strip()
			n = _normalize_phone(le.get("phone_number"))
			show = pd or n or ""
			if show and show not in phones_here:
				phones_here.append(show)

		others: list[dict] = []
		for e in entries:
			if e["device_name"] == device_name:
				continue
			others.append(
				{
					"device_name": e["device_name"],
					"owner_label": e["owner_label"],
					"contact_name": e.get("contact_name") or _("(no name)"),
					"phone_display": e.get("phone_display") or _("(no number)"),
				}
			)
			other_devices_contact.add(e["device_name"])

		others.sort(key=lambda x: (x["device_name"], x["contact_name"]))

		mutual_contact_rows.append(
			{
				"contact_key": cn_key,
				"contact_display": contact_display,
				"phones_on_device": phones_here,
				"total_devices_with_contact_name": len(owners),
				"other_devices_count": len(owners) - 1,
				"other_devices": others,
			}
		)

	mutual_contact_rows.sort(
		key=lambda x: (-x["total_devices_with_contact_name"], str(x["contact_display"]))
	)

	combined_other = other_devices_phone | other_devices_contact

	global_stats = {
		"device_rows": len(frappe.get_all("Device Id", pluck="name")),
		"unique_phones_in_system": len(phone_map),
		"unique_contact_names_in_system": len(contact_map),
	}

	summary = {
		"device_name": device_name,
		"owner_label": device_label,
		"total_contact_rows_on_device": total_child_rows,
		"unique_numbers_on_device_with_phone": unique_with_phone,
		"unique_contact_names_on_device": unique_with_contact_name,
		"mutual_numbers_count": len(mutual_number_rows),
		"mutual_contact_names_count": len(mutual_contact_rows),
		"unique_other_devices_via_phone": len(other_devices_phone),
		"unique_other_devices_via_contact_name": len(other_devices_contact),
		"unique_other_devices_combined": len(combined_other),
		# same as unique_other_devices_via_phone — kept for older clients
		"unique_other_devices_reachable": len(other_devices_phone),
		**global_stats,
	}

	return {
		"summary": summary,
		"mutual_number_rows": mutual_number_rows,
		"mutual_contact_rows": mutual_contact_rows,
	}


@frappe.whitelist()
def get_device_shared_number_statistics(device_name: str | None = None):
	"""Backward-compatible alias: same payload shape as before the contact-name tables were added."""
	out = get_device_contact_statistics(device_name)
	return {
		"summary": out["summary"],
		"mutual_rows": out["mutual_number_rows"],
	}


@frappe.whitelist()
def search_phone_numbers(txt: str | None = None, limit: int = 25):
	"""Typeahead for Phone Number Statistics: match normalized digits or display substring."""
	frappe.has_permission("Device Id", "read", throw=True)
	txt = (txt or "").strip()
	if len(txt) < 2:
		return []
	lim = max(1, min(int(limit or 25), 100))
	_rows, phone_map = _device_contact_rows()
	t = txt.lower()
	t_digits = "".join(c for c in txt if c.isdigit())
	out: list[dict] = []
	for norm, entries in phone_map.items():
		primary = entries[0]
		display = (primary.get("phone_display") or norm or "").strip() or norm
		match = False
		if t_digits and t_digits in norm:
			match = True
		elif t in norm.lower() or t in display.lower():
			match = True
		if not match:
			continue
		devices = {e["device_name"] for e in entries}
		out.append(
			{
				"value": norm,
				"label": _("{0} · {1} device(s) · {2} row(s)").format(display, len(devices), len(entries)),
				"phone_norm": norm,
				"phone_display": display,
				"device_count": len(devices),
				"row_count": len(entries),
			}
		)
	out.sort(key=lambda x: (-x["device_count"], -x["row_count"], str(x["phone_norm"])))
	return out[:lim]


@frappe.whitelist()
def get_phone_number_statistics(phone: str | None = None):
	"""Tabulated statistics for one normalized phone: every Device Contact row with that number."""
	frappe.has_permission("Device Id", "read", throw=True)
	raw = (phone or "").strip()
	norm = _normalize_phone(raw)
	if not norm:
		frappe.throw(_("Enter a phone number that contains digits"))

	_rows, phone_map = _device_contact_rows()
	entries = list(phone_map.get(norm, []))
	primary_display = (entries[0].get("phone_display") or norm) if entries else raw or norm

	devices = {e["device_name"] for e in entries}
	name_keys = set()
	for e in entries:
		k = _normalize_contact_name(e.get("contact_name"))
		if k:
			name_keys.add(k)

	device_id_contact_by_device: dict[str, str] = {}
	if devices:
		for d in frappe.get_all(
			"Device Id",
			filters={"name": ["in", list(devices)]},
			fields=["name", "device_id_contact"],
		):
			device_id_contact_by_device[d["name"]] = (d.get("device_id_contact") or "").strip()

	rows_out: list[dict] = []
	for e in entries:
		dn = e["device_name"]
		rows_out.append(
			{
				"device_name": dn,
				"owner_label": e.get("owner_label") or dn,
				"device_id_contact": device_id_contact_by_device.get(dn, ""),
				"contact_name": (e.get("contact_name") or "").strip(),
				"phone_display": e.get("phone_display") or norm,
				"contact_idx": e.get("contact_idx", 0),
			}
		)
	rows_out.sort(
		key=lambda x: (str(x["device_name"]), int(x.get("contact_idx") or 0), str(x.get("contact_name") or ""))
	)

	global_stats = {
		"device_rows": len(frappe.get_all("Device Id", pluck="name")),
		"unique_phones_in_system": len(phone_map),
	}

	from contactlink.contactlink.suspect import suspect_info_for_phone

	suspect_info = suspect_info_for_phone(norm)
	summary = {
		"phone_norm": norm,
		"phone_display": primary_display,
		"total_rows": len(entries),
		"distinct_devices": len(devices),
		"distinct_saved_names": len(name_keys),
		"found": bool(entries),
		"is_suspect_number": suspect_info["is_suspect"],
		"suspect_matches": suspect_info["suspect_matches"],
		**global_stats,
	}

	return {
		"summary": summary,
		"rows": rows_out,
	}


@frappe.whitelist()
def get_device_id_popup_details(name: str | None = None):
	"""Read-only Device Id fields for a desk popup (owner, image URL, child contacts)."""
	frappe.has_permission("Device Id", "read", throw=True)
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Device Id is required"))
	if not frappe.db.exists("Device Id", name):
		frappe.throw(_("Device Id {0} was not found").format(name))

	doc = frappe.get_doc("Device Id", name)
	doc.check_permission("read")

	img_url = _owner_image_url(doc.get("owner_image"))
	contacts: list[dict] = []
	from contactlink.contactlink.suspect import _get_suspect_phone_map, annotate_contact_row

	suspect_map = _get_suspect_phone_map()
	for row in doc.get("device_contact") or []:
		contacts.append(
			annotate_contact_row(
				{
					"contact_name": (row.get("contact_name") or "").strip(),
					"phone_number": (row.get("phone_number") or "").strip(),
				},
				suspect_map,
			)
		)

	return {
		"name": doc.name,
		"odner_name": (doc.get("odner_name") or "").strip(),
		"sim_types": (doc.get("sim_types") or "").strip(),
		"device_own_phone_number": [
			{
				"sim_slot": (row.get("sim_slot") or "SIM 1").strip(),
				"phone_number": (row.get("phone_number") or "").strip(),
				"label": (row.get("label") or "").strip(),
			}
			for row in doc.get("device_own_phone_number") or []
		],
		"device_id_contact": (doc.get("device_id_contact") or "").strip(),
		"import_type": (doc.get("import_type") or "").strip(),
		"device_details": (doc.get("device_details") or "").strip(),
		"total_contacts": doc.get("total_contacts") or 0,
		"total_imported": doc.get("total_imported") or 0,
		"duplicates_found": doc.get("duplicates_found") or 0,
		"owner_image_url": img_url,
		"contacts": contacts,
	}


@frappe.whitelist()
def update_device_entry(
	name: str | None,
	odner_name: str | None,
	device_id_contact: str | None = None,
	owner_image: str | None = None,
	device_contact=None,
	device_own_phone_number=None,
	total_contacts: int | None = None,
	total_imported: int | None = None,
	duplicates_found: int | None = None,
):
	"""Update Device Id from the Device Entry desk page.

	Loads the document from the database before applying changes. That way Attach Image
	uploads (which save the file and bump ``modified`` on the server) do not trigger
	“Document has been modified after you have opened it” when the user clicks save.
	"""
	if not name:
		frappe.throw(_("Device Id name is required"))

	if isinstance(device_contact, str):
		device_contact = frappe.parse_json(device_contact)
	if isinstance(device_own_phone_number, str):
		device_own_phone_number = frappe.parse_json(device_own_phone_number)
	device_contact = device_contact or []
	device_own_phone_number = device_own_phone_number or []

	doc = frappe.get_doc("Device Id", name)
	doc.check_permission("write")

	doc.odner_name = (odner_name or "").strip()
	doc.device_id_contact = (device_id_contact or "").strip()
	doc.owner_image = (owner_image or "").strip()
	doc.device_own_phone_number = []
	for row in device_own_phone_number:
		if not isinstance(row, dict):
			continue
		phone = (row.get("phone_number") or "").strip()
		if not phone:
			continue
		doc.append(
			"device_own_phone_number",
			{
				"sim_slot": (row.get("sim_slot") or "SIM 1").strip(),
				"phone_number": phone,
				"label": (row.get("label") or "").strip(),
			},
		)
	doc.device_contact = []
	for row in device_contact:
		if not isinstance(row, dict):
			continue
		doc.append(
			"device_contact",
			{
				"contact_name": (row.get("contact_name") or "").strip(),
				"phone_number": (row.get("phone_number") or "").strip(),
				"import_reference": (row.get("import_reference") or "").strip(),
			},
		)

	saved_contacts = len(doc.get("device_contact") or [])
	_set_import_statistics(
		doc,
		import_type="Manual",
		total_contacts=total_contacts if total_contacts is not None else saved_contacts,
		total_imported=total_imported if total_imported is not None else saved_contacts,
		duplicates_found=duplicates_found if duplicates_found is not None else 0,
	)

	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def get_device_import_references(device_name: str | None = None):
	frappe.has_permission("Device Id", "read", throw=True)
	device_name = (device_name or "").strip()
	if not device_name:
		frappe.throw(_("Device Id is required"))
	if not frappe.db.exists("Device Id", device_name):
		frappe.throw(_("Device Id {0} was not found").format(device_name))

	refs = frappe.get_all(
		"Device Contact",
		filters={
			"parenttype": "Device Id",
			"parent": device_name,
			"import_reference": ["!=", ""],
		},
		pluck="import_reference",
		order_by="modified desc",
	)
	ordered_unique: list[str] = []
	seen = set()
	for ref in refs:
		r = (ref or "").strip()
		if not r or r in seen:
			continue
		seen.add(r)
		ordered_unique.append(r)
	return ordered_unique


@frappe.whitelist()
def rollback_device_import_reference(device_name: str | None = None, import_reference: str | None = None):
	device_name = (device_name or "").strip()
	import_reference = (import_reference or "").strip()
	if not device_name:
		frappe.throw(_("Device Id is required"))
	if not import_reference:
		frappe.throw(_("Import Reference is required"))
	if not frappe.db.exists("Device Id", device_name):
		frappe.throw(_("Device Id {0} was not found").format(device_name))

	doc = frappe.get_doc("Device Id", device_name)
	doc.check_permission("write")

	remaining_rows = []
	removed_rows = 0
	for row in doc.get("device_contact") or []:
		row_ref = (row.get("import_reference") or "").strip()
		if row_ref and row_ref == import_reference:
			removed_rows += 1
			continue
		remaining_rows.append(
			{
				"doctype": "Device Contact",
				"contact_name": (row.get("contact_name") or "").strip(),
				"phone_number": (row.get("phone_number") or "").strip(),
				"import_reference": row_ref,
			}
		)

	doc.device_contact = remaining_rows
	doc.save()

	return {
		"device_name": doc.name,
		"import_reference": import_reference,
		"removed_rows": removed_rows,
		"remaining_rows": len(remaining_rows),
	}


@frappe.whitelist()
def get_suspect_phone_index():
	"""Normalized phone → active suspect profile matches (cached)."""
	frappe.has_permission("Suspect Profile", "read", throw=True)
	from contactlink.contactlink.suspect import _get_suspect_phone_map

	return {"index": _get_suspect_phone_map()}


@frappe.whitelist()
def get_device_suspect_hits(device_name: str | None = None):
	frappe.has_permission("Device Id", "read", throw=True)
	device_name = (device_name or "").strip()
	if not device_name:
		frappe.throw(_("Device Id is required"))
	if not frappe.db.exists("Device Id", device_name):
		frappe.throw(_("Device Id {0} was not found").format(device_name))

	from contactlink.contactlink.suspect import get_device_suspect_hits as _hits

	return _hits(device_name)


@frappe.whitelist()
def get_investigation_suspect_report():
	frappe.has_permission("Suspect Profile", "read", throw=True)
	from contactlink.contactlink.suspect import get_investigation_suspect_report as _report

	return _report()


@frappe.whitelist()
def get_mobile_importer_status(log_offset: int | None = 0):
	from contactlink.contactlink.mobile_importer.manager import get_importer_status

	return get_importer_status(int(log_offset or 0))


@frappe.whitelist()
def start_mobile_importer():
	from contactlink.contactlink.mobile_importer.manager import start_importer

	return start_importer()


@frappe.whitelist()
def stop_mobile_importer():
	from contactlink.contactlink.mobile_importer.manager import stop_importer

	return stop_importer()
