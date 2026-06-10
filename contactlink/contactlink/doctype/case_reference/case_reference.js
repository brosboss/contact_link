// Copyright (c) 2026, brossboss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Case Reference", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}
		frm.add_custom_button(__("Open linked case"), () => {
			const rows = frm.doc.linked_cases || [];
			if (!rows.length) {
				frappe.msgprint(__("No linked cases on this record."));
				return;
			}
			const options = rows
				.map((row) => row.linked_case)
				.filter(Boolean)
				.map((name) => ({ label: name, value: name }));
			if (options.length === 1) {
				frappe.set_route("Form", "Case Reference", options[0].value);
				return;
			}
			frappe.prompt(
				{
					fieldname: "linked_case",
					label: __("Linked Case"),
					fieldtype: "Select",
					options: options.map((o) => o.value),
					reqd: 1,
				},
				(values) => {
					frappe.set_route("Form", "Case Reference", values.linked_case);
				},
				__("Choose linked case")
			);
		});
	},
});

frappe.ui.form.on("Case Link", {
	linked_case(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row.linked_case && !frm.is_new() && row.linked_case === frm.doc.name) {
			frappe.msgprint(__("A case cannot be linked to itself."));
			frappe.model.set_value(cdt, cdn, "linked_case", "");
		}
	},
});
