// Copyright (c) 2026, brossboss and contributors
// Contact Statistics — per-device overlap by phone number and by contact name

frappe.pages["contact-statistics"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Contact Statistics"),
		single_column: true,
	});

	page.add_inner_button(__("Admin home"), () => frappe.set_route("admin-dashboard"));
	page.add_inner_button(__("Contact link analysis"), () => frappe.set_route("contact-link-analysi-1"));

	const root_id = "cs-root-" + frappe.utils.get_random(8);
	const $main = $(page.main);
	$main.empty();
	$main.append(`
		<div id="${root_id}" class="contact-statistics-page" style="padding:4px 2px 32px;max-width:1280px;">
			<p class="text-muted" style="margin:0 0 12px 0;max-width:960px;line-height:1.5;">
				${__(
					"Pick a device to see overlap with the rest of the system in two ways: " +
						"<strong>shared phone numbers</strong> (after normalizing digits) and " +
						"<strong>shared contact names</strong> (same saved name on another device, case-insensitive). " +
						"Each table lists only mutual cases — something must appear on at least two devices."
				)}
			</p>
			<div class="form-inline" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-bottom:16px;">
				<div class="cs-device-link-wrap" style="margin:0;min-width:280px;flex:1;max-width:560px;">
					<div id="${root_id}-device-link"></div>
				</div>
				<button type="button" class="btn btn-primary btn-sm cs-refresh">${__("Load statistics")}</button>
			</div>
			<div class="cs-summary" style="display:none;margin-bottom:16px;"></div>
			<div class="cs-loading text-muted" style="display:none;padding:24px;">${__("Loading…")}</div>
			<div class="cs-empty alert alert-info" style="display:none;"></div>
			<div class="cs-results" style="display:none;">
				<ul class="nav nav-tabs" style="margin-bottom:0;border-bottom:none;">
					<li class="active"><a href="#${root_id}-tab-num" data-toggle="tab">${__("By phone number")}</a></li>
					<li><a href="#${root_id}-tab-cn" data-toggle="tab">${__("By contact name")}</a></li>
				</ul>
				<div style="border:1px solid var(--border-color);border-radius:0 8px 8px 8px;background:var(--card-bg);padding:0;overflow:hidden;">
					<div class="tab-content" style="padding:0;">
						<div class="tab-pane active" id="${root_id}-tab-num" style="padding:0;">
							<div class="cs-empty-num alert alert-warning" style="display:none;margin:12px;border-radius:8px;"></div>
							<div class="cs-table-numbers" style="overflow:auto;"></div>
						</div>
						<div class="tab-pane" id="${root_id}-tab-cn" style="padding:0;">
							<div class="cs-empty-cn alert alert-warning" style="display:none;margin:12px;border-radius:8px;"></div>
							<div class="cs-table-contacts" style="overflow:auto;"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	`);

	const $root = $main.find("#" + root_id);
	const $summary = $root.find(".cs-summary");
	const $loading = $root.find(".cs-loading");
	const $empty = $root.find(".cs-empty");
	const $results = $root.find(".cs-results");
	const $empty_num = $root.find(".cs-empty-num");
	const $empty_cn = $root.find(".cs-empty-cn");
	const $table_numbers = $root.find(".cs-table-numbers");
	const $table_contacts = $root.find(".cs-table-contacts");

	/** @type {object[]} */
	let numbersData = [];
	/** @type {{ col: string, dir: 'asc'|'desc' }} */
	let numbersSort = { col: "total", dir: "desc" };
	/** @type {object[]} */
	let contactsData = [];
	/** @type {{ col: string, dir: 'asc'|'desc' }} */
	let contactsSort = { col: "total", dir: "desc" };

	const deviceLink = frappe.ui.form.make_control({
		parent: $root.find("#" + root_id + "-device-link"),
		df: {
			fieldtype: "Link",
			fieldname: "device_id",
			label: __("Device"),
			options: "Device Id",
			placeholder: __("Search by Device Id or owner…"),
		},
		render_input: true,
	});
	deviceLink.refresh();

	function get_selected_device() {
		return (deviceLink.get_value() || "").trim();
	}

	function on_device_picked() {
		if (get_selected_device()) {
			fetch_stats();
		}
	}

	deviceLink.df.onchange = on_device_picked;
	if (deviceLink.$input && deviceLink.$input.length) {
		deviceLink.$input.on("awesomplete-selectcomplete", on_device_picked);
	}

	function esc(s) {
		return frappe.utils.escape_html(s == null ? "" : String(s));
	}

	function format_other_devices(list) {
		if (!list || !list.length) return "—";
		const parts = list.map((o) => {
			const lbl = (o.owner_label || o.device_name || "").trim();
			const cn = (o.contact_name || "").trim();
			const phone = (o.phone_display || "").trim();
			return `${lbl} (${o.device_name}) — ${cn} — ${phone}`;
		});
		const full = parts.join("\n");
		const short = parts.slice(0, 4).join("; ");
		const more = parts.length > 4 ? ` (+${parts.length - 4})` : "";
		return `<span title="${esc(full)}">${esc(short + more)}</span>`;
	}

	function render_summary(s) {
		const cards = [
			{
				k: __("Contact rows on device"),
				v: s.total_contact_rows_on_device,
				h: __("Rows in Device Contact for this device."),
			},
			{
				k: __("Distinct numbers (digits)"),
				v: s.unique_numbers_on_device_with_phone,
				h: __("Different normalized phone numbers on this device."),
			},
			{
				k: __("Distinct contact names"),
				v: s.unique_contact_names_on_device,
				h: __("Non-empty saved names, after trim (matching is case-insensitive)."),
			},
			{
				k: __("Mutual numbers"),
				v: s.mutual_numbers_count,
				h: __("Numbers here that also appear on another device."),
			},
			{
				k: __("Mutual contact names"),
				v: s.mutual_contact_names_count,
				h: __("Saved names here that match another device’s saved name."),
			},
			{
				k: __("Other devices (via #)"),
				v: s.unique_other_devices_via_phone,
				h: __("Distinct devices linked only through shared phone digits."),
			},
			{
				k: __("Other devices (via name)"),
				v: s.unique_other_devices_via_contact_name,
				h: __("Distinct devices linked through shared contact name (may overlap with phone links)."),
			},
			{
				k: __("Other devices (combined)"),
				v: s.unique_other_devices_combined,
				h: __("Union: any other device you touch via shared number or shared name."),
			},
			{
				k: __("Devices in system"),
				v: s.device_rows,
				h: __("Total Device Id documents."),
			},
			{
				k: __("Unique # system-wide"),
				v: s.unique_phones_in_system,
				h: __("Distinct normalized phone values."),
			},
			{
				k: __("Unique names system-wide"),
				v: s.unique_contact_names_in_system,
				h: __("Distinct normalized contact-name keys."),
			},
		];
		const grid = cards
			.map(
				(c) => `
			<div style="flex:1;min-width:130px;border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;background:var(--card-bg);"
				title="${esc(c.h)}">
				<div class="text-muted small" style="margin-bottom:4px;line-height:1.3;">${esc(c.k)}</div>
				<div style="font-size:20px;font-weight:600;line-height:1.2;">${esc(String(c.v))}</div>
			</div>`
			)
			.join("");
		$summary.html(`
			<div style="margin-bottom:8px;font-weight:600;">${esc(s.owner_label)} <span class="text-muted" style="font-weight:400;">(${esc(
			s.device_name
		)})</span></div>
			<div style="display:flex;flex-wrap:wrap;gap:10px;">${grid}</div>
		`);
		$summary.show();
	}

	function sortIndicator(activeCol, col, dir) {
		if (activeCol !== col) {
			return "";
		}
		return dir === "asc" ? " ▲" : " ▼";
	}

	function sortValueNum(r, col) {
		switch (col) {
			case "phone":
				return (r.phone_display || "").toLowerCase();
			case "saved":
				return ((r.contact_names_on_device || []).join(", ")).toLowerCase();
			case "total":
				return Number(r.total_devices_with_number) || 0;
			case "other":
				return Number(r.other_devices_count) || 0;
			case "where":
				return ((r.other_devices || []).map((o) => `${o.device_name} ${o.contact_name || ""} ${o.phone_display || ""}`).join(" ")).toLowerCase();
			default:
				return "";
		}
	}

	function sortValueCn(r, col) {
		switch (col) {
			case "contact":
				return (r.contact_display || "").toLowerCase();
			case "phones":
				return ((r.phones_on_device || []).join(", ")).toLowerCase();
			case "total":
				return Number(r.total_devices_with_contact_name) || 0;
			case "other":
				return Number(r.other_devices_count) || 0;
			case "where":
				return ((r.other_devices || []).map((o) => `${o.device_name} ${o.contact_name || ""} ${o.phone_display || ""}`).join(" ")).toLowerCase();
			default:
				return "";
		}
	}

	function sortRows(rows, col, dir, getVal, numericCols, tieVal) {
		const mul = dir === "asc" ? 1 : -1;
		const isNum = numericCols.has(col);
		return [...rows].sort((a, b) => {
			const va = getVal(a, col);
			const vb = getVal(b, col);
			let c = 0;
			if (isNum) {
				c = (Number(va) - Number(vb)) * mul;
			} else {
				c = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * mul;
			}
			if (c !== 0) {
				return c;
			}
			const da = tieVal(a);
			const db = tieVal(b);
			return String(da).localeCompare(String(db), undefined, { numeric: true, sensitivity: "base" }) * mul;
		});
	}

	function sortRowsNumbers(rows, col, dir) {
		const numericCols = new Set(["total", "other"]);
		return sortRows(rows, col, dir, sortValueNum, numericCols, (r) => sortValueNum(r, "phone"));
	}

	function sortRowsContacts(rows, col, dir) {
		const numericCols = new Set(["total", "other"]);
		return sortRows(rows, col, dir, sortValueCn, numericCols, (r) => sortValueCn(r, "contact"));
	}

	function render_table_numbers(rows, sortCol, sortDir) {
		if (!rows.length) {
			$table_numbers.empty();
			return;
		}
		const sc = sortCol || "total";
		const sd = sortDir || "desc";
		const sorted = sortRowsNumbers(rows, sc, sd);
		const thSort = `cursor:pointer;user-select:none;white-space:nowrap;`;
		const sortTip = esc(__("Click to sort; click again to reverse order."));
		const thead = `
			<thead>
				<tr>
					<th style="width:48px;text-align:right;white-space:nowrap;">${__("S/N")}</th>
					<th class="cs-sortable" data-sort="phone" style="${thSort}" title="${sortTip}">${__("Phone (on this device)")}${sortIndicator(sc, "phone", sd)}</th>
					<th class="cs-sortable" data-sort="saved" style="${thSort}" title="${sortTip}">${__("Saved as on this device")}${sortIndicator(sc, "saved", sd)}</th>
					<th class="cs-sortable text-right" data-sort="total" style="${thSort}" title="${esc(
						__("Distinct devices that have this normalized number anywhere.")
					)} · ${sortTip}">${__("Total devices with this #")}${sortIndicator(sc, "total", sd)}</th>
					<th class="cs-sortable text-right" data-sort="other" style="${thSort}" title="${sortTip}">${__("Other devices")}${sortIndicator(sc, "other", sd)}</th>
					<th class="cs-sortable" data-sort="where" style="${thSort}min-width:240px;" title="${sortTip}">${__("Where else it appears")}${sortIndicator(sc, "where", sd)}</th>
				</tr>
			</thead>`;
		const body = sorted
			.map((r, i) => {
				const names = (r.contact_names_on_device || []).join(", ");
				return `<tr>
					<td class="text-muted" style="text-align:right;font-size:12px;">${esc(String(i + 1))}</td>
					<td style="font-family:ui-monospace,Menlo,monospace;font-size:12px;">${esc(r.phone_display)}</td>
					<td style="font-size:12px;">${esc(names)}</td>
					<td style="text-align:right;font-weight:600;">${esc(String(r.total_devices_with_number))}</td>
					<td style="text-align:right;">${esc(String(r.other_devices_count))}</td>
					<td style="font-size:12px;line-height:1.45;">${format_other_devices(r.other_devices)}</td>
				</tr>`;
			})
			.join("");
		$table_numbers.html(`
			<table class="table table-bordered cs-sort-table" style="margin:0;font-size:13px;">
				${thead}
				<tbody>${body}</tbody>
			</table>
		`);
	}

	function render_table_contacts(rows, sortCol, sortDir) {
		if (!rows.length) {
			$table_contacts.empty();
			return;
		}
		const sc = sortCol || "total";
		const sd = sortDir || "desc";
		const sorted = sortRowsContacts(rows, sc, sd);
		const thSort = `cursor:pointer;user-select:none;white-space:nowrap;`;
		const sortTip = esc(__("Click to sort; click again to reverse order."));
		const thead = `
			<thead>
				<tr>
					<th style="width:48px;text-align:right;white-space:nowrap;">${__("S/N")}</th>
					<th class="cs-sortable" data-sort="contact" style="${thSort}" title="${sortTip}">${__("Contact name (on this device)")}${sortIndicator(sc, "contact", sd)}</th>
					<th class="cs-sortable" data-sort="phones" style="min-width:120px;${thSort}" title="${sortTip}">${__("Phone(s) on this device")}${sortIndicator(sc, "phones", sd)}</th>
					<th class="cs-sortable text-right" data-sort="total" style="${thSort}" title="${esc(
						__("Devices that have this same normalized saved name.")
					)} · ${sortTip}">${__("Total devices with this name")}${sortIndicator(sc, "total", sd)}</th>
					<th class="cs-sortable text-right" data-sort="other" style="${thSort}" title="${sortTip}">${__("Other devices")}${sortIndicator(sc, "other", sd)}</th>
					<th class="cs-sortable" data-sort="where" style="${thSort}min-width:240px;" title="${sortTip}">${__("Where else it appears")}${sortIndicator(sc, "where", sd)}</th>
				</tr>
			</thead>`;
		const body = sorted
			.map((r, i) => {
				const phones = (r.phones_on_device || []).join(", ") || "—";
				return `<tr>
					<td class="text-muted" style="text-align:right;font-size:12px;">${esc(String(i + 1))}</td>
					<td style="font-size:13px;font-weight:500;">${esc(r.contact_display)}</td>
					<td style="font-family:ui-monospace,Menlo,monospace;font-size:12px;">${esc(phones)}</td>
					<td style="text-align:right;font-weight:600;">${esc(String(r.total_devices_with_contact_name))}</td>
					<td style="text-align:right;">${esc(String(r.other_devices_count))}</td>
					<td style="font-size:12px;line-height:1.45;">${format_other_devices(r.other_devices)}</td>
				</tr>`;
			})
			.join("");
		$table_contacts.html(`
			<table class="table table-bordered cs-sort-table" style="margin:0;font-size:13px;">
				${thead}
				<tbody>${body}</tbody>
			</table>
		`);
	}

	function fetch_stats() {
		const device_name = get_selected_device();
		if (!device_name) {
			frappe.msgprint(__("Please select a Device Id using the link field."));
			return;
		}
		$loading.show();
		$empty.hide();
		$summary.hide();
		$results.hide();
		$table_numbers.empty();
		$table_contacts.empty();
		$empty_num.hide().empty();
		$empty_cn.hide().empty();

		frappe.call({
			method: "contactlink.contactlink.api.get_device_contact_statistics",
			args: { device_name },
			callback: (r) => {
				$loading.hide();
				if (r.exc) {
					return;
				}
				const data = r.message || {};
				const summary = data.summary || {};
				const mutual_num = data.mutual_number_rows || [];
				const mutual_cn = data.mutual_contact_rows || [];

				render_summary(summary);

				if (!mutual_num.length && !mutual_cn.length) {
					$results.hide();
					$empty
						.show()
						.html(
							__(
								"No <strong>mutual</strong> phone numbers or <strong>mutual</strong> contact names: " +
									"nothing on this device appears on another device under those rules. " +
									"Add overlapping rows in Device Entry or pick another device."
							)
						);
					return;
				}

				$empty.hide();
				$results.show();

				numbersData = [];
				contactsData = [];

				if (!mutual_num.length) {
					$empty_num
						.show()
						.html(
							__(
								"No mutual <strong>phone numbers</strong> — every dialable number on this device is unique in the system " +
									"(or there are no numbers with digits)."
							)
						);
					$table_numbers.empty();
				} else {
					$empty_num.hide();
					numbersData = mutual_num.slice();
					numbersSort = { col: "total", dir: "desc" };
					render_table_numbers(numbersData, numbersSort.col, numbersSort.dir);
				}

				if (!mutual_cn.length) {
					$empty_cn
						.show()
						.html(
							__(
								"No mutual <strong>contact names</strong> — no saved name on this device matches another device " +
									"(empty names are ignored; matching is case-insensitive)."
							)
						);
					$table_contacts.empty();
				} else {
					$empty_cn.hide();
					contactsData = mutual_cn.slice();
					contactsSort = { col: "total", dir: "desc" };
					render_table_contacts(contactsData, contactsSort.col, contactsSort.dir);
				}
			},
		});
	}

	$root.on("click", ".cs-table-numbers th.cs-sortable", function () {
		const col = $(this).data("sort");
		if (!col || !numbersData.length) {
			return;
		}
		if (numbersSort.col === col) {
			numbersSort.dir = numbersSort.dir === "asc" ? "desc" : "asc";
		} else {
			numbersSort = { col, dir: "asc" };
		}
		render_table_numbers(numbersData, numbersSort.col, numbersSort.dir);
	});

	$root.on("click", ".cs-table-contacts th.cs-sortable", function () {
		const col = $(this).data("sort");
		if (!col || !contactsData.length) {
			return;
		}
		if (contactsSort.col === col) {
			contactsSort.dir = contactsSort.dir === "asc" ? "desc" : "asc";
		} else {
			contactsSort = { col, dir: "asc" };
		}
		render_table_contacts(contactsData, contactsSort.col, contactsSort.dir);
	});

	$root.find(".cs-refresh").on("click", fetch_stats);
};
