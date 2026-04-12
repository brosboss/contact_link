# Copyright (c) 2026, brossboss and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def _normalize_phone(phone: str | None) -> str:
	if not phone:
		return ""
	digits = "".join(c for c in str(phone) if c.isdigit())
	return digits or str(phone).strip()


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

	rows = frappe.db.sql(
		"""
		SELECT
			d.name AS device_name,
			IFNULL(NULLIF(TRIM(d.odner_name), ''), d.name) AS owner_label,
			d.owner_image,
			dc.phone_number,
			IFNULL(NULLIF(TRIM(dc.contact_name), ''), '') AS contact_name
		FROM `tabDevice Id` d
		INNER JOIN `tabDevice Contact` dc ON dc.parent = d.name AND dc.parenttype = 'Device Id'
		ORDER BY d.name, dc.idx
		""",
		as_dict=True,
	)

	# normalized_phone -> list of (device_name, owner_label, display_contact)
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
			"phone_display": r.phone_number or norm,
		}
		phone_map.setdefault(norm, []).append(entry)

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


@frappe.whitelist()
def update_device_entry(name: str | None, odner_name: str | None, owner_image: str | None, device_contact=None):
	"""Update Device Id from the Device Entry desk page.

	Loads the document from the database before applying changes. That way Attach Image
	uploads (which save the file and bump ``modified`` on the server) do not trigger
	“Document has been modified after you have opened it” when the user clicks save.
	"""
	if not name:
		frappe.throw(_("Device Id name is required"))

	if isinstance(device_contact, str):
		device_contact = frappe.parse_json(device_contact)
	device_contact = device_contact or []

	doc = frappe.get_doc("Device Id", name)
	doc.check_permission("write")

	doc.odner_name = (odner_name or "").strip()
	doc.owner_image = (owner_image or "").strip()
	doc.device_contact = []
	for row in device_contact:
		if not isinstance(row, dict):
			continue
		doc.append(
			"device_contact",
			{
				"contact_name": (row.get("contact_name") or "").strip(),
				"phone_number": (row.get("phone_number") or "").strip(),
			},
		)

	doc.save()
	return doc.as_dict()
