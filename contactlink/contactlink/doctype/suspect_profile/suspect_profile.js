// Copyright (c) 2026, brossboss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Suspect Profile", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}
		frm.add_custom_button(__("View all flagged contacts"), () => {
			frappe.call({
				method: "contactlink.contactlink.api.get_investigation_suspect_report",
				callback: (r) => {
					const data = r.message || {};
					const hits = data.hits || [];
					const summary = data.summary || {};
					if (!hits.length) {
						frappe.msgprint(__("No device contacts match active suspect numbers."));
						return;
					}
					const rows = hits
						.slice(0, 200)
						.map(
							(h) =>
								`<tr>
									<td>${frappe.utils.escape_html(h.suspect_name || "")}</td>
									<td>${frappe.utils.escape_html(h.device_name || "")}</td>
									<td>${frappe.utils.escape_html(h.contact_name || "")}</td>
									<td>${frappe.utils.escape_html(h.phone_number || "")}</td>
								</tr>`
						)
						.join("");
					const more =
						hits.length > 200
							? `<p class="text-muted">${__("Showing first 200 of {0} hits.", [hits.length])}</p>`
							: "";
					frappe.msgprint({
						title: __("Suspect contact hits ({0})", [summary.flagged_rows || hits.length]),
						message: `${more}<div style="max-height:360px;overflow:auto;"><table class="table table-bordered table-condensed">
							<thead><tr><th>${__("Suspect")}</th><th>${__("Device Id")}</th><th>${__("Saved as")}</th><th>${__("Phone")}</th></tr></thead>
							<tbody>${rows}</tbody></table></div>`,
						wide: true,
					});
				},
			});
		});
	},
});
