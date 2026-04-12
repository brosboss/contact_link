// Copyright (c) 2026, brossboss and contributors
// Phone Number Statistics — system-wide rows for one normalized number

frappe.pages["phone-number-statist"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Phone Number Statistics"),
		single_column: true,
	});

	page.add_inner_button(__("Admin home"), () => frappe.set_route("admin-dashboard"));
	page.add_inner_button(__("Contact link analysis"), () => frappe.set_route("contact-link-analysi-1"));
	page.add_inner_button(__("Contact statistics"), () => frappe.set_route("contact-statistics"));

	const root_id = "pns-root-" + frappe.utils.get_random(8);
	const $main = $(page.main);
	$main.empty();
	$main.append(`
		<div id="${root_id}" class="phone-number-statistics-page" style="padding:4px 2px 32px;max-width:1280px;">
			<p class="text-muted" style="margin:0 0 12px 0;max-width:960px;line-height:1.5;">
				${__(
					"Type a <strong>number</strong> . " +
						"."
				)}
			</p>
			<div class="form-inline" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-bottom:8px;">
				<div class="pns-phone-wrap" style="margin:0;min-width:280px;flex:1;max-width:560px;">
					<div id="${root_id}-phone-field"></div>
				</div>
			</div>
			<div class="pns-suggest text-muted small" style="display:none;margin-bottom:12px;"></div>
			<div class="pns-summary" style="display:none;margin-bottom:16px;"></div>
			<div class="pns-loading text-muted" style="display:none;padding:24px;">${__("Loading…")}</div>
			<div class="pns-empty alert alert-info" style="display:none;"></div>
			<div class="pns-results" style="display:none;">
				<div class="pns-export-bar" style="margin-bottom:10px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;">
					<button type="button" class="btn btn-default btn-sm pns-export-excel">
						<i class="fa fa-download" style="margin-right:6px;"></i>${__("Export to Excel")}
					</button>
				</div>
				<div class="pns-table-wrap" style="overflow:auto;"></div>
			</div>
		</div>
	`);

	const $root = $main.find("#" + root_id);
	const $suggest = $root.find(".pns-suggest");
	const $summary = $root.find(".pns-summary");
	const $loading = $root.find(".pns-loading");
	const $empty = $root.find(".pns-empty");
	const $results = $root.find(".pns-results");
	const $table_wrap = $root.find(".pns-table-wrap");

	const phoneControl = frappe.ui.form.make_control({
		parent: $root.find("#" + root_id + "-phone-field"),
		df: {
			fieldtype: "Data",
			fieldname: "phone_query",
			label: __("Phone number"),
			placeholder: __("Type digits — statistics update as you type…"),
		},
		render_input: true,
	});
	phoneControl.refresh();

	/** @type {object[]} */
	let tableData = [];
	/** @type {{ col: string, dir: 'asc'|'desc' }} */
	let tableSort = { col: "device", dir: "asc" };
	/** @type {string} normalized phone key from last successful load (for export filename) */
	let lastPhoneNorm = "";

	function get_phone_input() {
		return (phoneControl.get_value() || "").trim();
	}

	function esc(s) {
		return frappe.utils.escape_html(s == null ? "" : String(s));
	}

	let suggestTimer = null;
	let fetchTimer = null;
	/** @type {number} */
	let statsReqId = 0;

	function schedule_suggest() {
		if (suggestTimer) {
			clearTimeout(suggestTimer);
		}
		suggestTimer = setTimeout(run_suggest, 320);
	}

	function schedule_fetch_stats() {
		if (fetchTimer) {
			clearTimeout(fetchTimer);
		}
		fetchTimer = setTimeout(fetch_stats, 420);
	}

	function reset_ui_empty() {
		$loading.hide();
		$empty.hide().empty();
		$summary.hide().empty();
		$results.hide();
		$table_wrap.empty();
		tableData = [];
		lastPhoneNorm = "";
	}

	function run_suggest() {
		const q = get_phone_input();
		if (q.length < 2) {
			$suggest.hide().empty();
			return;
		}
		frappe.call({
			method: "contactlink.contactlink.api.search_phone_numbers",
			args: { txt: q, limit: 20 },
			callback: (r) => {
				if (r.exc) {
					return;
				}
				const items = r.message || [];
				if (!items.length) {
					$suggest
						.show()
						.html(`<span class="text-muted">${__("No matching numbers in the system yet.")}</span>`);
					return;
				}
				const btns = items
					.map(
						(it) =>
							`<button type="button" class="btn btn-xs btn-default pns-pick" style="margin:0 6px 6px 0;" data-norm="${esc(
								it.phone_norm
							)}" title="${esc(it.label)}">${esc(it.phone_display)}</button>`
					)
					.join("");
				$suggest.show().html(`<span style="margin-right:8px;">${__("Matches:")}</span>${btns}`);
			},
		});
	}

	if (phoneControl.$input && phoneControl.$input.length) {
		phoneControl.$input.on("input", function () {
			schedule_suggest();
			schedule_fetch_stats();
		});
	}

	$root.on("click", ".pns-pick", function () {
		const norm = $(this).data("norm");
		if (norm) {
			if (fetchTimer) {
				clearTimeout(fetchTimer);
				fetchTimer = null;
			}
			phoneControl.set_value(String(norm));
			$suggest.hide().empty();
			fetch_stats();
		}
	});

	function render_summary(s) {
		const cards = [
			{
				k: __("Normalized digits"),
				v: s.phone_norm,
				h: __("Key used after stripping non-digits from stored values."),
			},
			{
				k: __("Example display"),
				v: s.phone_display,
				h: __("First occurrence’s stored formatting on a row."),
			},
			{
				k: __("Rows with this #"),
				v: s.total_rows,
				h: __("Device Contact child rows that include this normalized number."),
			},
			{
				k: __("Distinct devices"),
				v: s.distinct_devices,
				h: __("Different Device Id parents."),
			},
			{
				k: __("Distinct saved names"),
				v: s.distinct_saved_names,
				h: __("Non-empty contact names, case-insensitive unique count."),
			},
			{
				k: __("Devices in system"),
				v: s.device_rows,
				h: __("Total Device Id documents."),
			},
			{
				k: __("Unique # system-wide"),
				v: s.unique_phones_in_system,
				h: __("Distinct normalized phone values across all contacts."),
			},
		];
		const grid = cards
			.map(
				(c) => `
			<div style="flex:1;min-width:130px;border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;background:var(--card-bg);"
				title="${esc(c.h)}">
				<div class="text-muted small" style="margin-bottom:4px;line-height:1.3;">${esc(c.k)}</div>
				<div style="font-size:18px;font-weight:600;line-height:1.25;word-break:break-all;">${esc(String(c.v))}</div>
			</div>`
			)
			.join("");
		$summary.html(`<div style="display:flex;flex-wrap:wrap;gap:10px;">${grid}</div>`);
		$summary.show();
	}

	function sortIndicator(activeCol, col, dir) {
		if (activeCol !== col) {
			return "";
		}
		return dir === "asc" ? " ▲" : " ▼";
	}

	function sortValueRow(r, col) {
		switch (col) {
			case "device":
				return (r.device_name || "").toLowerCase();
			case "owner":
				return (r.owner_label || "").toLowerCase();
			case "device_id_contact":
				return (r.device_id_contact || "").toLowerCase();
			case "contact":
				return (r.contact_name || "").toLowerCase();
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

	function sortRowsTable(rows, col, dir) {
		const numericCols = new Set();
		return sortRows(rows, col, dir, sortValueRow, numericCols, (r) => sortValueRow(r, "device"));
	}

	function csv_escape_cell(val) {
		const s = String(val ?? "");
		if (/[",\n\r]/.test(s)) {
			return `"${s.replace(/"/g, '""')}"`;
		}
		return s;
	}

	function th_text_for_export($th) {
		return String($th.text() || "")
			.replace(/\s*[▲▼]\s*$/, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	function export_table_to_excel() {
		try {
			const $table = $table_wrap.find("table.pns-sort-table");
			const has_dom_rows = $table.length && $table.find("tbody tr").length;
			const lines = [];

			if (has_dom_rows) {
				const header_cells = [];
				$table.find("thead tr:first th").each(function () {
					header_cells.push(csv_escape_cell(th_text_for_export($(this))));
				});
				lines.push(header_cells.join(","));

				$table.find("tbody tr").each(function () {
					const row_cells = [];
					$(this)
						.find("td")
						.each(function () {
							const text = $(this)
								.text()
								.replace(/\s+/g, " ")
								.trim();
							row_cells.push(csv_escape_cell(text));
						});
					lines.push(row_cells.join(","));
				});
			} else if (tableData.length) {
				const sorted = sortRowsTable(tableData.slice(), tableSort.col, tableSort.dir);
				lines.push(
					[
						__("S/N"),
						__("Device Id"),
						__("Owner"),
						__("Device ID Contact"),
						__("Saved as"),
					]
						.map(csv_escape_cell)
						.join(",")
				);
				sorted.forEach((r, i) => {
					const ownerDevNum = (r.device_id_contact || "").trim() || "—";
					const cn = (r.contact_name || "").trim() || "—";
					const row = [i + 1, r.device_name || "", r.owner_label || "", ownerDevNum, cn].map(csv_escape_cell);
					lines.push(row.join(","));
				});
			} else {
				frappe.msgprint(__("There is no table to export. Enter a number that returns rows first."));
				return;
			}

			const csv = "\uFEFF" + lines.join("\r\n");
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			const base = frappe
				.scrub(lastPhoneNorm || get_phone_input() || "export", "_")
				.slice(0, 80);
			const rawDate = frappe.datetime.now_date();
			const dateStr = String(rawDate != null ? rawDate : "").replace(/\//g, "-");
			a.href = url;
			a.download = `phone_number_statistics_${base}_${dateStr || "export"}.csv`;
			a.style.display = "none";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			frappe.show_alert({ message: __("Table exported for Excel"), indicator: "green" }, 3);
		} catch (err) {
			console.error("pns export", err);
			frappe.msgprint({
				title: __("Export failed"),
				message: err.message || String(err),
				indicator: "red",
			});
		}
	}

	function show_device_popup(payload) {
		const img = payload.owner_image_url
			? `<div style="margin-bottom:12px;"><img src="${esc(payload.owner_image_url)}" alt="" style="max-width:140px;max-height:140px;border-radius:8px;object-fit:cover;border:1px solid var(--border-color);" /></div>`
			: "";
		const rows = (payload.contacts || [])
			.map(
				(c) =>
					`<tr><td style="padding:6px 8px;">${esc(c.contact_name || "—")}</td><td style="padding:6px 8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;">${esc(
						c.phone_number || ""
					)}</td></tr>`
			)
			.join("");
		const table =
			rows.length > 0
				? `<table class="table table-bordered" style="margin:8px 0 0;font-size:13px;width:100%;"><thead><tr><th>${esc(
						__("Saved as")
					)}</th><th>${esc(__("Phone"))}</th></tr></thead><tbody>${rows}</tbody></table>`
				: `<p class="text-muted" style="margin:8px 0 0;">${esc(__("No contacts in this device record."))}</p>`;
		const html = `
			<div class="pns-device-popup" style="line-height:1.5;max-width:520px;">
				${img}
				<p style="margin:0 0 8px 0;"><strong>${esc(__("Owner"))}:</strong> ${esc(payload.odner_name || "—")}</p>
				<p style="margin:0 0 8px 0;"><strong>${esc(__("Device ID Contact"))}:</strong> ${esc(payload.device_id_contact || "—")}</p>
				<div style="margin-top:10px;font-weight:600;">${esc(__("Device Contact"))}</div>
				${table}
			</div>`;
		const dialog = new frappe.ui.Dialog({
			title: esc(payload.name),
			fields: [{ fieldname: "body", fieldtype: "HTML", label: "" }],
			primary_action_label: __("Open full record"),
			primary_action: () => {
				dialog.hide();
				frappe.set_route("Form", "Device Id", payload.name);
			},
		});
		dialog.fields_dict.body.$wrapper.html(html);
		dialog.show();
	}

	function render_table(rows, sortCol, sortDir) {
		if (!rows.length) {
			$table_wrap.empty();
			return;
		}
		const sc = sortCol || "device";
		const sd = sortDir || "asc";
		const sorted = sortRowsTable(rows, sc, sd);
		const thSort = `cursor:pointer;user-select:none;white-space:nowrap;`;
		const sortTip = esc(__("Click to sort; click again to reverse order."));
		const devTip = esc(__("Click to view device details"));
		const thead = `
			<thead>
				<tr>
					<th style="width:48px;text-align:right;white-space:nowrap;">${__("S/N")}</th>
					<th class="pns-sortable" data-sort="device" style="${thSort}" title="${sortTip}">${__("Device Id")}${sortIndicator(sc, "device", sd)}</th>
					<th class="pns-sortable" data-sort="owner" style="${thSort}" title="${sortTip}">${__("Owner")}${sortIndicator(sc, "owner", sd)}</th>
					<th class="pns-sortable" data-sort="device_id_contact" style="${thSort}min-width:110px;font-family:ui-monospace,Menlo,monospace;" title="${esc(
						__("Phone number stored on the Device Id (owner device contact).")
					)} · ${sortTip}">${__("Device ID Contact")}${sortIndicator(sc, "device_id_contact", sd)}</th>
					<th class="pns-sortable" data-sort="contact" style="${thSort}" title="${sortTip}">${__("Saved as")}${sortIndicator(sc, "contact", sd)}</th>
				</tr>
			</thead>`;
		const body = sorted
			.map((r, i) => {
				const cn = (r.contact_name || "").trim() || "—";
				const ownerDevNum = (r.device_id_contact || "").trim() || "—";
				return `<tr>
					<td class="text-muted" style="text-align:right;font-size:12px;">${esc(String(i + 1))}</td>
					<td style="font-size:12px;">
						<a href="#" class="pns-device-link text-primary" data-device="${esc(r.device_name)}" title="${devTip}"
							style="font-size:12px;font-family:ui-monospace,Menlo,monospace;text-decoration:underline;">${esc(r.device_name)}</a>
					</td>
					<td style="font-size:12px;">${esc(r.owner_label)}</td>
					<td style="font-family:ui-monospace,Menlo,monospace;font-size:12px;">${esc(ownerDevNum)}</td>
					<td style="font-size:12px;">${esc(cn)}</td>
				</tr>`;
			})
			.join("");
		$table_wrap.html(`
			<table class="table table-bordered pns-sort-table" style="margin:0;font-size:13px;">
				${thead}
				<tbody>${body}</tbody>
			</table>
		`);
	}

	function fetch_stats() {
		const phone = get_phone_input();
		if (!phone) {
			reset_ui_empty();
			return;
		}
		const myReq = ++statsReqId;
		$loading.show();
		$empty.hide();
		$summary.hide();
		$results.hide();
		$table_wrap.empty();

		frappe.call({
			method: "contactlink.contactlink.api.get_phone_number_statistics",
			args: { phone },
			callback: (r) => {
				if (myReq !== statsReqId) {
					return;
				}
				$loading.hide();
				if (r.exc) {
					return;
				}
				const data = r.message || {};
				const summary = data.summary || {};
				const rows = data.rows || [];

				render_summary(summary);

				if (!summary.found) {
					$results.hide();
					$empty
						.show()
						.html(
							__(
								"No <strong>Device Contact</strong> rows use this normalized number. " +
									"Keep typing or pick a value from <strong>Matches</strong> (shown after two or more characters)."
							)
						);
					return;
				}

				$empty.hide();
				$results.show();
				tableData = rows.slice();
				tableSort = { col: "device", dir: "asc" };
				lastPhoneNorm = (summary.phone_norm || "").trim();
				render_table(tableData, tableSort.col, tableSort.dir);
			},
		});
	}

	$root.on("click", ".pns-table-wrap th.pns-sortable", function () {
		const col = $(this).data("sort");
		if (!col || !tableData.length) {
			return;
		}
		if (tableSort.col === col) {
			tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
		} else {
			tableSort = { col, dir: "asc" };
		}
		render_table(tableData, tableSort.col, tableSort.dir);
	});

	$root.on("click", ".pns-device-link", function (e) {
		e.preventDefault();
		e.stopPropagation();
		const dev = $(this).data("device");
		if (!dev) {
			return;
		}
		frappe.call({
			method: "contactlink.contactlink.api.get_device_id_popup_details",
			args: { name: String(dev) },
			callback: (r) => {
				if (r.exc) {
					return;
				}
				show_device_popup(r.message || {});
			},
		});
	});

	$root.on("click", ".pns-export-excel", function (e) {
		e.preventDefault();
		export_table_to_excel();
	});
};
