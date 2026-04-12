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

frappe.ui.form.on("Device Id", {
	refresh(frm) {
		render_device_id_image_view(frm);
	},
	owner_image(frm) {
		render_device_id_image_view(frm);
	},
});
