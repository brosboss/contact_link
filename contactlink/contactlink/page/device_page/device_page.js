frappe.pages["device-page"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Device Entry"),
		single_column: true
	});

	page.add_inner_button(__("How to use this page"), () => {
		const guideHtml = `
			<div>
				<p>${__("Use this page to create or update a device owner record and manage its contacts.")}</p>
				<ol style="padding-left: 18px; margin-bottom: 0;">
					<li>${__("Choose <b>New registration</b> for a new device, or <b>Edit existing device</b> to update one.")}</li>
					<li>${__("Enter <b>Owner name</b> and optionally upload an <b>Owner photo</b>.")}</li>
					<li>${__("Enter <b>Device ID Contact</b> (primary phone/email for this device record).")}</li>
					<li>${__("Add contacts manually with <b>Add contact</b>, or upload CSV with <b>Upload CSV</b>.")}</li>
					<li>${__("If you import CSV contacts, note the generated <b>Import Reference</b> shown in the import reference field.")}</li>
					<li>${__("In edit mode, select a past Import Reference in <b>Import rollback</b> to remove those imported contacts.")}</li>
					<li>${__("Click <b>Save</b> (or <b>Save changes</b>) to persist your entry.")}</li>
				</ol>
			</div>
		`;
		frappe.msgprint({
			title: __("Device Entry Guide"),
			message: guideHtml,
			wide: true,
		});
	});

	new DeviceEntryPage(page);
};

class DeviceEntryPage {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.currentDeviceId = null;
		this._suppress_link_change = false;
		this.lastImportedReference = null;
		this.availableImportReferences = [];
		this.currentPage = 1;
		this.pageSize = 50;

		this.render();
		this.bindEvents();
		this.addContactRow();
	}

	render() {
		this.wrapper.empty();
		contactlink.inject_pages_nav(this.page, "device-page", { parent: this.wrapper });
		this.wrapper.append(`
			<div class="device-entry-page">
				<div class="device-entry-card">
					<div class="device-entry-head">
						<h4>${__("Device owner registration")}</h4>
						<p>${__("Capture the owner, photo, and related contacts in one place.")}</p>
					</div>

					<div class="device-mode-bar">
						<div class="mode-toggle" role="group" aria-label="${__("Entry mode")}">
							<button type="button" class="btn btn-sm mode-btn active" id="mode_new_entry">${__(
								"New registration"
							)}</button>
							<button type="button" class="btn btn-sm mode-btn" id="mode_edit_entry">${__(
								"Edit existing device"
							)}</button>
						</div>
						<p class="mode-instruction" id="mode_instruction"></p>
						<div class="device-edit-panel" style="display:none;">
							<div class="device-edit-panel-inner">
								<div class="form-group device-edit-field">
									<label class="control-label">${__("Device Id")}</label>
									<div id="existing_device_control"></div>
									<p class="device-edit-hint text-muted">${__(
										"Choose a record to load it automatically. You can switch to another device anytime."
									)}</p>
								</div>
								<div class="device-edit-actions">
									<button type="button" class="btn btn-default btn-sm" id="start_new_entry">
										<i class="fa fa-plus"></i> ${__("Start new registration")}
									</button>
								</div>
							</div>
						</div>
					</div>

					<div class="device-entry-grid">
						<div class="form-group">
							<label class="control-label reqd">${__("Owner name")}</label>
							<input type="text" class="form-control" id="owner_name" placeholder="${__(
								"Full name as it should appear in reports"
							)}">
						</div>

						<div class="form-group">
							<label class="control-label">${__("Device ID Contact")}</label>
							<input type="text" class="form-control" id="device_id_contact" placeholder="${__(
								"Primary contact for this device"
							)}">
						</div>

						<div class="form-group">
							<label class="control-label">${__("Owner photo")}</label>
							<div id="owner_image_control"></div>
						</div>
					</div>

					<div class="contacts-section">
						<div class="contacts-header">
							<div>
								<label class="control-label reqd">${__("Device contacts")}</label>
								<div class="contacts-stats">
									${__("Total contacts in list")}: <span id="contacts_total_count">0</span>
								</div>
							</div>
							<div class="contacts-actions">
								<button class="btn btn-default btn-sm" id="download_contacts_template">
									<i class="fa fa-download"></i> ${__("Template")}
								</button>
								<button class="btn btn-default btn-sm" id="upload_contacts_excel">
									<i class="fa fa-upload"></i> ${__("Upload CSV")}
								</button>
								<button class="btn btn-default btn-sm" id="add_contact_row">
									<i class="fa fa-plus"></i> ${__("Add contact")}
								</button>
								<input type="file" id="contacts_file_input" accept=".csv" style="display:none;">
							</div>
						</div>
						<p class="contacts-hint">${__(
							"Download the template for bulk entry. Export from Excel as CSV before uploading."
						)}</p>
						<div class="import-rollback-panel" id="import_rollback_panel" style="display:none;">
							<div class="form-group import-reference-field">
								<label class="control-label">${__("Import rollback (Import Reference)")}</label>
								<div class="import-reference-controls">
									<select class="form-control" id="import_reference_select">
										<option value="">${__("Select import reference")}</option>
									</select>
									<button class="btn btn-danger btn-sm" id="rollback_import_reference" type="button">
										<i class="fa fa-undo"></i> ${__("Rollback import")}
									</button>
								</div>
							</div>
						</div>
						<div class="current-import-panel" id="current_import_panel" style="display:none;">
							<div class="form-group import-reference-field">
								<label class="control-label">${__("Current import reference")}</label>
								<input type="text" class="form-control" id="current_import_reference" readonly>
							</div>
						</div>
						<div class="contacts-table-wrap">
							<table class="table table-bordered contacts-table">
								<thead>
									<tr>
										<th>${__("Contact name")}</th>
										<th>${__("Phone number")}</th>
										<th style="width: 84px;">${__("Action")}</th>
									</tr>
								</thead>
								<tbody id="contacts_container"></tbody>
							</table>
						</div>
						<div class="contacts-pagination" id="contacts_pagination">
							<div class="contacts-pagination-left">
								${__("Showing")} <span id="contacts_page_range">0-0</span>
							</div>
							<div class="contacts-pagination-right">
								<label for="contacts_page_size" class="contacts-pagination-label">${__("Rows per page")}</label>
								<select id="contacts_page_size" class="form-control input-xs">
									<option value="25">25</option>
									<option value="50" selected>50</option>
									<option value="100">100</option>
								</select>
								<button class="btn btn-default btn-sm" id="contacts_prev_page" type="button">${__("Prev")}</button>
								<span class="contacts-page-indicator" id="contacts_page_indicator">1 / 1</span>
								<button class="btn btn-default btn-sm" id="contacts_next_page" type="button">${__("Next")}</button>
							</div>
						</div>
					</div>

					<div class="device-entry-actions">
						<button type="button" class="btn btn-primary" id="save_device_entry">${__("Save")}</button>
						<button type="button" class="btn btn-default" id="clear_device_form">${__("Clear form")}</button>
					</div>
				</div>
			</div>
		`);

		this.page.set_indicator(__("Draft"), "orange");
		this.injectStyles();
		this.createExistingDeviceControl();
		this.createImageControl();
		this.setMode("new");
		this.updateSaveButtonText();
	}

	createExistingDeviceControl() {
		const me = this;
		this.existingDeviceField = frappe.ui.form.make_control({
			parent: this.wrapper.find("#existing_device_control"),
			df: {
				fieldtype: "Link",
				fieldname: "existing_device_id",
				label: "",
				options: "Device Id",
				placeholder: __("Search by Device Id…"),
			},
			render_input: true,
		});
		this.existingDeviceField.refresh();

		const tryLoadFromLink = () => {
			if (me._suppress_link_change) return;
			if (me.currentMode !== "edit") return;
			const deviceId = me.existingDeviceField.get_value();
			if (!deviceId) return;
			clearTimeout(me._linkLoadDebounce);
			me._linkLoadDebounce = setTimeout(() => me.loadDeviceDocument(deviceId), 120);
		};
		this.existingDeviceField.df.onchange = tryLoadFromLink;
		if (this.existingDeviceField.$input && this.existingDeviceField.$input.length) {
			this.existingDeviceField.$input.on("awesomplete-selectcomplete", tryLoadFromLink);
		}
	}

	createImageControl() {
		this.ownerImageField = frappe.ui.form.make_control({
			parent: this.wrapper.find("#owner_image_control"),
			df: {
				fieldtype: "Attach Image",
				fieldname: "owner_image",
				label: __("Owner photo"),
			},
			render_input: true,
		});
		this.ownerImageField.refresh();
	}

	addContactRow(data = {}) {
		const rowId = `row_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
		const rowName = data.name ? `data-row-name="${frappe.utils.escape_html(data.name)}"` : "";
		const importReference = (data.import_reference || "").trim();
		const rowImportRefAttr = importReference
			? `data-row-import-reference="${frappe.utils.escape_html(importReference)}"`
			: "";
		const row = $(`
			<tr class="contact-row" data-row-id="${rowId}" ${rowName} ${rowImportRefAttr}>
				<td>
					<input type="text" class="form-control contact-name" placeholder="${__("Contact name")}" value="${frappe.utils.escape_html(data.contact_name || "")}">
				</td>
				<td>
					<input type="text" class="form-control contact-phone" placeholder="${__("Phone number")}" value="${frappe.utils.escape_html(data.phone_number || "")}">
				</td>
				<td>
					<button type="button" class="btn btn-danger btn-sm remove-contact-row" title="${__("Remove row")}">
						<i class="fa fa-trash"></i>
					</button>
				</td>
			</tr>
		`);

		this.wrapper.find("#contacts_container").append(row);
		this.updateContactStats();
		this.refreshPagination();
	}

	bindEvents() {
		this.wrapper.on("click", "#mode_new_entry", () => this.setMode("new"));
		this.wrapper.on("click", "#mode_edit_entry", () => this.setMode("edit"));
		this.wrapper.on("click", "#add_contact_row", () => this.addContactRow());
		this.wrapper.on("click", "#start_new_entry", () => this.resetForm());
		this.wrapper.on("click", "#download_contacts_template", () => this.downloadTemplate());
		this.wrapper.on("click", "#upload_contacts_excel", () => this.wrapper.find("#contacts_file_input").trigger("click"));
		this.wrapper.on("change", "#contacts_file_input", (e) => this.handleContactsUpload(e));
		this.wrapper.on("click", "#rollback_import_reference", () => this.rollbackImportReference());
		this.wrapper.on("click", "#contacts_prev_page", () => this.changePage(-1));
		this.wrapper.on("click", "#contacts_next_page", () => this.changePage(1));
		this.wrapper.on("change", "#contacts_page_size", (e) => this.setPageSize(e.target.value));

		this.wrapper.on("click", ".remove-contact-row", (e) => {
			$(e.currentTarget).closest(".contact-row").remove();
			this.updateContactStats();
			this.refreshPagination();
		});

		this.wrapper.on("click", "#save_device_entry", () => this.save());
		this.wrapper.on("click", "#clear_device_form", () => this.resetForm());
	}

	setMode(mode) {
		const wasEdit = this.currentMode === "edit";
		const isEdit = mode === "edit";

		if (!isEdit && wasEdit) {
			this._clearFormForNewMode();
		}

		this.currentMode = mode;
		this.wrapper.find("#mode_new_entry").toggleClass("active", !isEdit);
		this.wrapper.find("#mode_edit_entry").toggleClass("active", isEdit);
		this.wrapper.find(".device-edit-panel").toggle(isEdit);
		this._setModeInstruction(isEdit);

		if (!isEdit && this.existingDeviceField) {
			this._suppress_link_change = true;
			try {
				this.existingDeviceField.set_value("");
			} finally {
				this._suppress_link_change = false;
			}
		}
		if (!isEdit) {
			this.toggleImportRollbackPanel(false);
			this.setImportReferenceOptions([]);
			this.setCurrentImportReference("");
		} else if (this.currentDeviceId) {
			this.loadImportReferences();
		}
		this.updateSaveButtonText();
	}

	_clearFormForNewMode() {
		this.currentDeviceId = null;
		this.lastImportedReference = null;
		this.availableImportReferences = [];
		this.wrapper.find("#owner_name").val("");
		this.wrapper.find("#device_id_contact").val("");
		if (this.ownerImageField) this.ownerImageField.set_value("");
		this.wrapper.find("#contacts_container").empty();
		this.addContactRow();
		this.toggleImportRollbackPanel(false);
		this.setImportReferenceOptions([]);
		this.setCurrentImportReference("");
		this.page.set_indicator(__("Draft"), "orange");
		this.currentPage = 1;
		this.refreshPagination();
	}

	_setModeInstruction(isEdit) {
		const el = this.wrapper.find("#mode_instruction");
		if (isEdit) {
			el.text(
				__(
					"Select a Device Id above to load it. Edit the form below, then save your changes."
				)
			);
		} else {
			el.text(
				__(
					'Fill in owner details and contacts, then click Save. Switch to "Edit existing device" to change a saved record.'
				)
			);
		}
	}

	/** Load Device Id document into the form (edit mode). */
	loadDeviceDocument(deviceId) {
		if (!deviceId || this.currentMode !== "edit") return;

		frappe.dom.freeze(__("Loading…"));
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Device Id",
				name: deviceId,
			},
			callback: (r) => {
				if (r.exc || !r.message) return;
				this.populateForm(r.message);
				this.currentDeviceId = r.message.name;
				this.page.set_indicator(__("Editing"), "blue");
				this.updateSaveButtonText();
				this.loadImportReferences();
				frappe.show_alert({
					message: `${__("Loaded")}: ${r.message.name}`,
					indicator: "blue",
				});
			},
			always: () => frappe.dom.unfreeze(),
		});
	}

	populateForm(doc) {
		this.wrapper.find("#owner_name").val(doc.odner_name || "");
		this.wrapper.find("#device_id_contact").val(doc.device_id_contact || "");
		this.ownerImageField.set_value(doc.owner_image || "");
		this.wrapper.find("#contacts_container").empty();
		this.setCurrentImportReference("");

		const contacts = doc.device_contact || [];
		if (!contacts.length) {
			this.addContactRow();
			this.updateContactStats();
			return;
		}

		contacts.forEach((row) => this.addContactRow(row));
		this.updateContactStats();
	}

	downloadTemplate() {
		const templateCsv = [
			"contact_name,phone_number",
			"John Doe,+2348012345678",
			"Jane Smith,+2348098765432"
		].join("\n");

		const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8;" });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "device_contacts_template.csv";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		window.URL.revokeObjectURL(url);
		frappe.show_alert({ message: __("Template downloaded."), indicator: "green" });
	}

	handleContactsUpload(event) {
		const fileInput = event.target;
		const file = fileInput.files && fileInput.files[0];
		if (!file) return;

		const extension = (file.name.split(".").pop() || "").toLowerCase();
		if (extension !== "csv") {
			frappe.msgprint(__("Please upload a CSV file (save from Excel as CSV first)."));
			fileInput.value = "";
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const parsed = this.parseCsvContacts(e.target.result || "");
				if (!parsed.length) {
					frappe.msgprint(__("No valid contacts found in this file."));
					return;
				}

				frappe.confirm(
					`${__("Import")} ${parsed.length} ${__("contacts and replace the current rows?")}`,
					() => {
						const importReference = this.generateImportReference();
						this.wrapper.find("#contacts_container").empty();
						parsed.forEach((row) =>
							this.addContactRow({
								...row,
								import_reference: importReference,
							})
						);
						this.lastImportedReference = importReference;
						this.setCurrentImportReference(importReference);
						this.updateContactStats();
						this.currentPage = 1;
						this.refreshPagination();
						frappe.show_alert({
							message: `${__("Imported")} ${parsed.length} ${__("contacts")} (${__("Ref")}: ${importReference}).`,
							indicator: "green",
						});
					}
				);
			} catch (error) {
				frappe.msgprint(__("Could not parse this CSV. Use the template column headers."));
			} finally {
				fileInput.value = "";
			}
		};
		reader.onerror = () => {
			frappe.msgprint(__("Could not read the file."));
			fileInput.value = "";
		};
		reader.readAsText(file);
	}

	parseCsvContacts(csvText) {
		const rows = frappe.utils.csv_to_array(csvText || "");
		if (!rows || rows.length < 2) return [];

		const normalize = (value) => (value || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
		const headers = (rows[0] || []).map(normalize);
		const nameIndex = headers.indexOf("contact_name");
		const phoneIndex = headers.indexOf("phone_number");

		if (nameIndex === -1 || phoneIndex === -1) {
			throw new Error("Required headers missing");
		}

		const contacts = [];
		let skipped = 0;

		for (let i = 1; i < rows.length; i++) {
			const row = rows[i] || [];
			const contact_name = (row[nameIndex] || "").toString().trim();
			const phone_number = (row[phoneIndex] || "").toString().trim();

			if (!contact_name && !phone_number) continue;
			if (!contact_name || !phone_number) {
				skipped++;
				continue;
			}

			contacts.push({ contact_name, phone_number });
		}

		if (skipped) {
			frappe.show_alert({
				message: `${skipped} ${__("incomplete row(s) skipped.")}`,
				indicator: "orange",
			});
		}

		return contacts;
	}

	collectData() {
		const ownerName = (this.wrapper.find("#owner_name").val() || "").trim();
		const deviceIdContact = (this.wrapper.find("#device_id_contact").val() || "").trim();
		const ownerImage = this.ownerImageField.get_value();
		const contacts = [];

		this.wrapper.find(".contact-row").each(function () {
			const contactName = ($(this).find(".contact-name").val() || "").trim();
			const phoneNumber = ($(this).find(".contact-phone").val() || "").trim();
			const rowName = $(this).attr("data-row-name");
			const importReference = ($(this).attr("data-row-import-reference") || "").trim();

			if (contactName || phoneNumber) {
				contacts.push({
					doctype: "Device Contact",
					name: rowName || undefined,
					contact_name: contactName,
					phone_number: phoneNumber,
					import_reference: importReference || undefined,
				});
			}
		});

		return { ownerName, deviceIdContact, ownerImage, contacts };
	}

	validate(data) {
		if (!data.ownerName) {
			frappe.msgprint(__("Owner name is required."));
			return false;
		}

		if (!data.contacts.length) {
			frappe.msgprint(__("Add at least one contact with name and phone number."));
			return false;
		}

		for (let i = 0; i < data.contacts.length; i++) {
			const row = data.contacts[i];
			if (!row.contact_name || !row.phone_number) {
				frappe.msgprint(
					`${__("Contact row")} ${i + 1}: ${__("enter both contact name and phone number.")}`
				);
				return false;
			}
		}

		return true;
	}

	save() {
		const data = this.collectData();
		if (!this.validate(data)) return;

		frappe.dom.freeze(__("Saving…"));
		const isUpdate = this.currentMode === "edit" && Boolean(this.currentDeviceId);
		if (this.currentMode === "edit" && !this.currentDeviceId) {
			frappe.dom.unfreeze();
			frappe.msgprint(__("Select a Device Id in the field above. It will load automatically."));
			return;
		}
		frappe.call({
			method: isUpdate ? "contactlink.contactlink.api.update_device_entry" : "frappe.client.insert",
			args: isUpdate
				? {
						name: this.currentDeviceId,
						odner_name: data.ownerName,
						device_id_contact: data.deviceIdContact,
						owner_image: data.ownerImage,
						device_contact: data.contacts,
					}
				: {
						doc: {
							doctype: "Device Id",
							odner_name: data.ownerName,
							device_id_contact: data.deviceIdContact,
							owner_image: data.ownerImage,
							device_contact: data.contacts,
						},
					},
			callback: (r) => {
				if (!r.exc) {
					this.page.set_indicator(__("Saved"), "green");
					if (isUpdate) {
						frappe.show_alert({
							message: `${__("Updated")}: ${this.currentDeviceId}`,
							indicator: "green",
						});
						this.loadImportReferences();
					} else {
						frappe.show_alert({ message: __("Saved successfully."), indicator: "green" });
						this.resetForm();
					}
				}
			},
			error: () => {
				this.page.set_indicator(__("Error"), "red");
			},
			always: () => {
				frappe.dom.unfreeze();
			}
		});
	}

	resetForm() {
		this.currentDeviceId = null;
		this.lastImportedReference = null;
		this.availableImportReferences = [];
		this.wrapper.find("#owner_name").val("");
		this.wrapper.find("#device_id_contact").val("");
		if (this.existingDeviceField) this.existingDeviceField.set_value("");
		this.ownerImageField.set_value("");
		this.wrapper.find("#contacts_container").empty();
		this.addContactRow();
		this.toggleImportRollbackPanel(false);
		this.setImportReferenceOptions([]);
		this.setCurrentImportReference("");
		this.page.set_indicator(__("Draft"), "orange");
		this.setMode("new");
		this.updateSaveButtonText();
		this.updateContactStats();
		this.currentPage = 1;
		this.refreshPagination();
	}

	updateContactStats() {
		const total = this.wrapper.find(".contact-row").length;
		this.wrapper.find("#contacts_total_count").text(total);
	}

	setPageSize(value) {
		const size = parseInt(value, 10);
		if (Number.isNaN(size) || size <= 0) return;
		this.pageSize = size;
		this.currentPage = 1;
		this.refreshPagination();
	}

	changePage(delta) {
		const totalRows = this.wrapper.find(".contact-row").length;
		const totalPages = Math.max(1, Math.ceil(totalRows / this.pageSize));
		this.currentPage = Math.min(totalPages, Math.max(1, this.currentPage + delta));
		this.refreshPagination();
	}

	refreshPagination() {
		const rows = this.wrapper.find(".contact-row");
		const totalRows = rows.length;
		const totalPages = Math.max(1, Math.ceil(totalRows / this.pageSize));
		if (this.currentPage > totalPages) this.currentPage = totalPages;
		if (this.currentPage < 1) this.currentPage = 1;

		const startIndex = totalRows ? (this.currentPage - 1) * this.pageSize : 0;
		const endIndex = Math.min(startIndex + this.pageSize, totalRows);

		rows.hide();
		if (totalRows) {
			rows.slice(startIndex, endIndex).show();
		}

		const rangeText = totalRows ? `${startIndex + 1}-${endIndex} ${__("of")} ${totalRows}` : `0-0 ${__("of")} 0`;
		this.wrapper.find("#contacts_page_range").text(rangeText);
		this.wrapper.find("#contacts_page_indicator").text(`${this.currentPage} / ${totalPages}`);
		this.wrapper.find("#contacts_prev_page").prop("disabled", this.currentPage <= 1);
		this.wrapper.find("#contacts_next_page").prop("disabled", this.currentPage >= totalPages);
	}

	generateImportReference() {
		const refs = this.getAllKnownImportReferences();
		let maxSerial = 0;
		refs.forEach((ref) => {
			const match = /^IMP-(\d+)$/i.exec((ref || "").trim());
			if (!match) return;
			const serial = parseInt(match[1], 10);
			if (!Number.isNaN(serial) && serial > maxSerial) maxSerial = serial;
		});
		return `IMP-${String(maxSerial + 1).padStart(3, "0")}`;
	}

	toggleImportRollbackPanel(show) {
		this.wrapper.find("#import_rollback_panel").toggle(Boolean(show));
	}

	setImportReferenceOptions(references) {
		this.availableImportReferences = references || [];
		const select = this.wrapper.find("#import_reference_select");
		select.empty().append(`<option value="">${__("Select import reference")}</option>`);
		(this.availableImportReferences || []).forEach((ref) => {
			select.append($("<option></option>").val(ref).text(ref));
		});
	}

	getAllKnownImportReferences() {
		const refs = [];
		(this.availableImportReferences || []).forEach((ref) => {
			const r = (ref || "").trim();
			if (r) refs.push(r);
		});
		this.wrapper.find(".contact-row").each(function () {
			const rowRef = ($(this).attr("data-row-import-reference") || "").trim();
			if (rowRef) refs.push(rowRef);
		});
		return [...new Set(refs)];
	}

	loadImportReferences() {
		if (!this.currentDeviceId || this.currentMode !== "edit") {
			this.toggleImportRollbackPanel(false);
			this.setImportReferenceOptions([]);
			return;
		}
		frappe.call({
			method: "contactlink.contactlink.api.get_device_import_references",
			args: { device_name: this.currentDeviceId },
			callback: (r) => {
				const refs = (r.message || []).filter(Boolean);
				this.setImportReferenceOptions(refs);
				this.toggleImportRollbackPanel(refs.length > 0);
			},
		});
	}

	setCurrentImportReference(reference) {
		const ref = (reference || "").trim();
		const panel = this.wrapper.find("#current_import_panel");
		if (!ref) {
			this.wrapper.find("#current_import_reference").val("");
			panel.hide();
			return;
		}
		this.wrapper.find("#current_import_reference").val(ref);
		panel.show();
	}

	rollbackImportReference() {
		const importReference = (this.wrapper.find("#import_reference_select").val() || "").toString().trim();
		if (!this.currentDeviceId || this.currentMode !== "edit") {
			frappe.msgprint(__("Switch to Edit existing device and load a Device Id first."));
			return;
		}
		if (!importReference) {
			frappe.msgprint(__("Select an Import Reference to roll back."));
			return;
		}

		frappe.confirm(
			`${__("Remove all contacts imported with reference")} <b>${frappe.utils.escape_html(importReference)}</b>?`,
			() => {
				frappe.dom.freeze(__("Rolling back import…"));
				frappe.call({
					method: "contactlink.contactlink.api.rollback_device_import_reference",
					args: {
						device_name: this.currentDeviceId,
						import_reference: importReference,
					},
					callback: (r) => {
						const removed = (r.message && r.message.removed_rows) || 0;
						frappe.show_alert({
							message: `${__("Rollback completed. Removed")} ${removed} ${__("contact(s)").toLowerCase()}.`,
							indicator: "green",
						});
						this.loadDeviceDocument(this.currentDeviceId);
					},
					always: () => frappe.dom.unfreeze(),
				});
			}
		);
	}

	updateSaveButtonText() {
		const label = this.currentMode === "edit" ? __("Save changes") : __("Save");
		this.wrapper.find("#save_device_entry").text(label);
	}

	injectStyles() {
		if ($("#device-entry-page-style").length) return;

		$("head").append(`
			<style id="device-entry-page-style">
				.device-entry-page {
					max-width: 900px;
					margin: 0 auto;
					padding: 18px 10px;
				}
				.device-entry-card {
					background: #fff;
					border: 1px solid #e7ebef;
					border-radius: 12px;
					padding: 22px;
					box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
				}
				.device-entry-head h4 {
					margin: 0 0 6px;
					font-weight: 600;
				}
				.device-entry-head p {
					margin: 0 0 16px;
					color: var(--text-muted);
				}
				.device-entry-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
					gap: 14px;
				}
				.device-mode-bar {
					display: grid;
					grid-template-columns: 1fr;
					gap: 12px;
					margin-bottom: 18px;
					padding: 14px 16px;
					border: 1px solid var(--border-color, #edf0f3);
					border-radius: 10px;
					background: var(--control-bg, #fcfdff);
				}
				.device-edit-panel {
					margin-top: 4px;
				}
				.device-edit-panel-inner {
					padding: 12px 14px;
					border-radius: 8px;
					border: 1px solid var(--border-color, #e2e8f0);
					background: var(--card-bg, #fff);
					border-left: 3px solid #3b82f6;
				}
				.device-edit-field .control-label {
					font-weight: 600;
					margin-bottom: 6px;
					color: var(--text-color, #1e293b);
				}
				.device-edit-hint {
					margin: 8px 0 0 0;
					font-size: 12px;
					line-height: 1.45;
				}
				.device-edit-actions {
					margin-top: 12px;
					padding-top: 10px;
					border-top: 1px solid var(--border-color, #edf0f3);
				}
				.mode-toggle {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
				}
				.mode-btn {
					border: 1px solid #d9e2ec;
					background: #fff;
				}
				.mode-btn.active {
					background: #e8f1ff;
					border-color: #7aa8ff;
					color: #1d4ed8;
					font-weight: 600;
				}
				.mode-instruction {
					margin: 0;
					font-size: 12px;
					color: #4f5d75;
				}
				.device-mode-bar .form-group {
					width: 100%;
					margin: 0;
				}
				.mode-actions {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
				}
				.contacts-section {
					margin-top: 20px;
				}
				.contacts-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					margin-bottom: 10px;
				}
				.contacts-actions {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
					justify-content: flex-end;
				}
				.contacts-stats {
					margin-top: 4px;
					font-size: 12px;
					color: var(--text-muted);
				}
				.contacts-hint {
					margin: 0 0 12px;
					font-size: 12px;
					color: var(--text-muted);
				}
				.contacts-table-wrap {
					overflow-x: auto;
				}
				.contacts-table {
					margin-bottom: 0;
				}
				.contacts-table thead th {
					font-size: 12px;
					background: #f8fafc;
					white-space: nowrap;
				}
				.contacts-table td {
					vertical-align: middle;
				}
				.contacts-table .form-control {
					min-width: 180px;
				}
				.contacts-pagination {
					margin-top: 10px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 10px;
					flex-wrap: wrap;
				}
				.contacts-pagination-left {
					font-size: 12px;
					color: var(--text-muted);
				}
				.contacts-pagination-right {
					display: flex;
					align-items: center;
					gap: 8px;
					flex-wrap: wrap;
				}
				.contacts-pagination-label {
					font-size: 12px;
					margin: 0;
					color: var(--text-muted);
				}
				#contacts_page_size {
					width: 86px;
					height: 28px;
				}
				.contacts-page-indicator {
					font-size: 12px;
					min-width: 52px;
					text-align: center;
				}
				.import-rollback-panel {
					margin: 0 0 10px;
					padding: 10px;
					border: 1px dashed var(--border-color, #d5dde7);
					border-radius: 8px;
					background: #fafcff;
				}
				.current-import-panel {
					margin: 0 0 10px;
					padding: 10px;
					border: 1px solid var(--border-color, #e2e8f0);
					border-radius: 8px;
					background: #ffffff;
				}
				.import-reference-field {
					margin: 0;
				}
				.import-reference-controls {
					display: grid;
					grid-template-columns: minmax(220px, 1fr) auto;
					gap: 8px;
				}
				.device-entry-actions {
					margin-top: 18px;
					display: flex;
					gap: 10px;
				}
				@media (max-width: 767px) {
					.contacts-header {
						flex-direction: column;
						align-items: flex-start;
						gap: 8px;
					}
					.contacts-actions {
						width: 100%;
						justify-content: flex-start;
					}
					.contacts-pagination {
						flex-direction: column;
						align-items: flex-start;
					}
					.import-reference-controls {
						grid-template-columns: 1fr;
					}
					.device-entry-card {
						padding: 16px;
					}
				}
			</style>
		`);
	}
}