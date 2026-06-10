// Copyright (c) 2026, brossboss and contributors
// For license information, please see license.txt

const DEVICE_ID_IMAGE_VIEW_WIDTH = 200;
const DEVICE_ID_IMAGE_VIEW_HEIGHT = 200;

function render_device_id_image_view(frm) {
	const $wrap = frm.fields_dict.image_view && frm.fields_dict.image_view.$wrapper;
	if (!$wrap || !$wrap.length) {
		return;
	}
	const w = DEVICE_ID_IMAGE_VIEW_WIDTH;
	const h = DEVICE_ID_IMAGE_VIEW_HEIGHT;
	const box_style = {
		width: w,
		height: h,
		overflow: "hidden",
		borderRadius: "6px",
		border: "1px solid var(--border-color)",
		background: "var(--control-bg)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	};

	if (!frm.doc.owner_image) {
		$wrap.empty().append(
			$("<div>")
				.addClass("device-id-image-view device-id-image-view--empty")
				.css(box_style)
				.css({ color: "var(--text-muted)", fontSize: "12px" })
				.text(__("No image"))
		);
		return;
	}

	const path = frappe.utils.get_file_link(frm.doc.owner_image);
	const src = frappe.urllib.get_full_url(path);

	$wrap.empty().append(
		$("<div>")
			.addClass("device-id-image-view")
			.css(box_style)
			.append(
				$("<img>", {
					alt: "",
					src: src,
				}).css({
					width: "100%",
					height: "100%",
					objectFit: "cover",
					display: "block",
				})
			)
	);
}

function apply_device_id_suspect_flags(frm) {
	if (frm.is_new() || !frm.doc.name) {
		return;
	}
	frappe.call({
		method: "contactlink.contactlink.api.get_device_suspect_hits",
		args: { device_name: frm.doc.name },
		freeze: false,
		callback: (r) => {
			if (r.exc) {
				return;
			}
			const data = r.message || {};
			const contactCount = data.suspect_hit_count || 0;
			const ownerCount = data.owner_phone_suspect_hit_count || 0;
			frm.set_intro("");
			const introLines = [];
			if (ownerCount > 0) {
				introLines.push(
					__("{0} device line number(s) match an active <b>Suspect Profile</b> number.", [
						ownerCount,
					])
				);
			}
			if (contactCount > 0) {
				introLines.push(
					__("{0} contact(s) on this device match an active <b>Suspect Profile</b> number.", [
						contactCount,
					])
				);
			}
			if (introLines.length) {
				frm.set_intro(introLines.join("<br>"), "red");
			}
			if (window.contactlink && contactlink.suspect) {
				contactlink.suspect.flag_device_own_phone_grid(frm, data.owner_phone_hits || []);
				contactlink.suspect.flag_device_id_grid(frm, data.hits || []);
			}
		},
	});
}

if (!$("#cl-suspect-styles").length) {
	$(`<style id="cl-suspect-styles">
.cl-suspect-row { background: #fef2f2 !important; }
.cl-suspect-badge {
	display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 4px;
	font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
	background: #dc2626; color: #fff; vertical-align: middle;
}
.device-entry-page .contact-row.cl-suspect-row,
.device-entry-page .own-phone-row.cl-suspect-row { background: #fef2f2; }
.device-entry-page .contact-row.cl-suspect-row td,
.device-entry-page .own-phone-row.cl-suspect-row td { border-color: #fecaca; }
</style>`).appendTo("head");
}

frappe.ui.form.on("Device Id", {
	refresh(frm) {
		render_device_id_image_view(frm);
		apply_device_id_suspect_flags(frm);
	},
	owner_image(frm) {
		render_device_id_image_view(frm);
	},
});
