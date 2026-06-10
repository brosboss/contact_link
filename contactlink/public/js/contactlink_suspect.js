// Copyright (c) 2026, brossboss and contributors
// Suspect phone matching helpers for device contact views.

frappe.provide("contactlink.suspect");

contactlink.suspect._index = null;
contactlink.suspect._index_promise = null;

contactlink.suspect.normalize_phone = function (phone) {
	const digits = String(phone || "").replace(/\D/g, "");
	if (!digits) {
		return String(phone || "").trim();
	}
	if (digits.length === 11 && digits[0] === "0") {
		return "234" + digits.slice(1);
	}
	if (digits.length === 10 && "789".includes(digits[0])) {
		return "234" + digits;
	}
	return digits;
};

contactlink.suspect.load_index = function () {
	if (contactlink.suspect._index_promise) {
		return contactlink.suspect._index_promise;
	}
	contactlink.suspect._index_promise = frappe
		.call({
			method: "contactlink.contactlink.api.get_suspect_phone_index",
			freeze: false,
		})
		.then((r) => {
			contactlink.suspect._index = (r.message && r.message.index) || {};
			return contactlink.suspect._index;
		})
		.catch(() => {
			contactlink.suspect._index = {};
			return contactlink.suspect._index;
		});
	return contactlink.suspect._index_promise;
};

contactlink.suspect.matches_for_phone = function (phone, index) {
	const map = index || contactlink.suspect._index || {};
	const norm = contactlink.suspect.normalize_phone(phone);
	return map[norm] || [];
};

contactlink.suspect.format_match_label = function (matches) {
	if (!matches || !matches.length) {
		return "";
	}
	return matches
		.map((m) => m.suspect_name || m.profile_name)
		.filter(Boolean)
		.join(", ");
};

contactlink.suspect.flag_device_own_phone_grid = function (frm, hits) {
	const grid = frm.fields_dict.device_own_phone_number && frm.fields_dict.device_own_phone_number.grid;
	if (!grid || !grid.grid_rows) {
		return;
	}
	const hit_by_norm = {};
	(hits || []).forEach((h) => {
		const norm = contactlink.suspect.normalize_phone(h.phone_number);
		if (norm) {
			hit_by_norm[norm] = h;
		}
	});

	grid.grid_rows.forEach((grid_row) => {
		const $row = $(grid_row.row);
		$row.removeClass("cl-suspect-row");
		$row.find(".cl-suspect-badge").remove();
		const phone = (grid_row.doc && grid_row.doc.phone_number) || "";
		const norm = contactlink.suspect.normalize_phone(phone);
		const hit = hit_by_norm[norm];
		if (!hit) {
			return;
		}
		$row.addClass("cl-suspect-row");
		const label = contactlink.suspect.format_match_label(hit.suspect_matches);
		$row
			.find('[data-fieldname="phone_number"] .static-area, [data-fieldname="phone_number"] .field-area')
			.first()
			.append(
				`<span class="cl-suspect-badge" title="${frappe.utils.escape_html(label)}">${__(
					"SUSPECT"
				)}</span>`
			);
	});
};

contactlink.suspect.flag_device_id_grid = function (frm, hits) {
	const grid = frm.fields_dict.device_contact && frm.fields_dict.device_contact.grid;
	if (!grid || !grid.grid_rows) {
		return;
	}
	const hit_by_norm = {};
	(hits || []).forEach((h) => {
		const norm = contactlink.suspect.normalize_phone(h.phone_number);
		if (norm) {
			hit_by_norm[norm] = h;
		}
	});

	grid.grid_rows.forEach((grid_row) => {
		const $row = $(grid_row.row);
		$row.removeClass("cl-suspect-row");
		$row.find(".cl-suspect-badge").remove();
		const phone = (grid_row.doc && grid_row.doc.phone_number) || "";
		const norm = contactlink.suspect.normalize_phone(phone);
		const hit = hit_by_norm[norm];
		if (!hit) {
			return;
		}
		$row.addClass("cl-suspect-row");
		const label = contactlink.suspect.format_match_label(hit.suspect_matches);
		$row
			.find('[data-fieldname="phone_number"] .static-area, [data-fieldname="phone_number"] .field-area')
			.first()
			.append(
				`<span class="cl-suspect-badge" title="${frappe.utils.escape_html(label)}">${__(
					"SUSPECT"
				)}</span>`
			);
	});
};
