frappe.pages["admin-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Admin Dashboard"),
		single_column: false,
	});

	const tools = [
		{
			route: "contact-link-analysi-1",
			title: __("Contact link analysis"),
			blurb: __("Map how device owners connect through shared phone numbers."),
			icon: "fa fa-share-alt",
		},
		{
			route: "device-page",
			title: __("Device entry"),
			blurb: __("Register owners, photos, and contacts for each device."),
			icon: "fa fa-tablet",
		},
	];

	const nav_blocks = tools
		.map(
			(t) => `
		<button type="button" class="btn btn-default btn-block cl-admin-nav" data-route="${t.route}"
			style="text-align:left;margin-bottom:8px;padding:10px 12px;border-radius:8px;white-space:normal;">
			<span class="${t.icon}" style="margin-right:10px;"></span>
			<span>${t.title}</span>
		</button>`
		)
		.join("");

	$(page.sidebar).append(`
		<div class="cl-admin-sidebar" style="padding:8px 4px 16px;">
			<div style="padding:4px 8px 14px;margin-bottom:12px;border-bottom:1px solid var(--border-color);">
				<div class="text-muted text-small text-uppercase" style="letter-spacing:0.05em;">${__(
					"Contactlink"
				)}</div>
				<div style="font-weight:600;font-size:15px;margin-top:4px;">${__("Admin")}</div>
			</div>
			<div class="text-muted text-small" style="margin-bottom:8px;padding:0 4px;">${__("Pages")}</div>
			${nav_blocks}
		</div>
	`);

	$(page.sidebar).on("click", ".cl-admin-nav", function () {
		frappe.set_route($(this).data("route"));
	});

	const cards = tools
		.map(
			(t) => `
		<div class="col-md-6" style="margin-bottom:16px;">
			<div style="padding:20px;height:100%;border-radius:10px;border:1px solid var(--border-color);background:var(--card-bg);">
				<h4 style="margin-top:0;">
					<span class="${t.icon}" style="margin-right:8px;"></span>${t.title}
				</h4>
				<p class="text-muted" style="margin-bottom:16px;line-height:1.5;">${t.blurb}</p>
				<button type="button" class="btn btn-primary btn-sm cl-admin-open" data-route="${t.route}">${__(
					"Open"
				)}</button>
			</div>
		</div>`
		)
		.join("");

	$(page.main).append(`
		<div style="padding:4px 4px 32px;max-width:1100px;">
			<p class="text-muted" style="font-size:15px;line-height:1.55;margin-bottom:22px;max-width:720px;">
				${__(
					"Welcome. Choose a tool from the sidebar or open a card below. Each page includes a shortcut back here."
				)}
			</p>
			<div class="row">
				${cards}
			</div>
		</div>
	`);

	$(page.main).on("click", ".cl-admin-open", function () {
		frappe.set_route($(this).data("route"));
	});
};