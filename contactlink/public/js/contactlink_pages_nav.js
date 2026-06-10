// Copyright (c) 2026, brossboss and contributors
// Shared top navigation for Contactlink desk pages — keep order and routes in sync everywhere.

frappe.provide("contactlink");

contactlink.PAGES_NAV_ROUTES = [
	{ route: "admin-dashboard", label_msg: "Admin home" },
	{ route: "contact-link-tutoria", label_msg: "Tutorial" },
	{ route: "contact-link-analysi-1", label_msg: "Contact link analysis" },
	{ route: "device-page", label_msg: "Device Entry" },
	{ route: "mobile-auto-importer", label_msg: "Mobile importer" },
	{ route: "List/Suspect Profile", label_msg: "Suspect profiles", external: true },
	{ route: "contact-statistics", label_msg: "Contact statistics" },
	{ route: "phone-number-statist", label_msg: "Phone number statistics" },
];

contactlink._pages_nav_route_is_active = function (item_route, active_route) {
	if (item_route === active_route) {
		return true;
	}
	// Legacy page name still in the system
	if (item_route === "contact-link-analysi-1" && active_route === "contact-link-analysi") {
		return true;
	}
	return false;
};

contactlink.inject_pages_nav = function (page, active_route, opts) {
	opts = opts || {};
	const $parent = opts.parent ? $(opts.parent) : $(page.main);
	if ($parent.find("[data-cl-pages-nav='1']").length) {
		return;
	}
	if (!$("#cl-pages-nav-styles").length) {
		$(`<style id="cl-pages-nav-styles">
.cl-pages-nav-wrap { margin: 0 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.cl-pages-nav-kicker { margin-bottom: 8px; letter-spacing: 0.04em; text-transform: uppercase; font-size: 11px; }
.cl-pages-nav-inner { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cl-link-analysis .cl-pages-nav-wrap { border-bottom-color: rgba(237, 28, 36, 0.26); }
.cl-link-analysis .cl-pages-nav-kicker { color: var(--cl-muted); }
.cl-link-analysis .cl-pages-nav-inner .btn-default {
	background: #181818;
	border-color: rgba(255, 255, 255, 0.16);
	color: #e2e8f0;
}
.cl-link-analysis .cl-pages-nav-inner .btn-default:hover {
	background: #232323;
	border-color: rgba(255, 242, 0, 0.38);
	color: var(--cl-brand-yellow);
}
.cl-link-analysis .cl-pages-nav-inner .btn-primary {
	background: #ed1c24;
	border-color: #ed1c24;
}
.cl-link-analysis .cl-pages-nav-inner .btn-primary:hover {
	background: #c4161d;
	border-color: #c4161d;
	color: #fff;
}
</style>`).appendTo("head");
	}

	const buttons = contactlink.PAGES_NAV_ROUTES.map((item) => {
		const is_active = contactlink._pages_nav_route_is_active(item.route, active_route);
		const label = __(item.label_msg);
		const cls = is_active ? "btn btn-primary btn-sm" : "btn btn-default btn-sm";
		const r = frappe.utils.escape_html(item.route);
		const t = frappe.utils.escape_html(label);
		return `<button type="button" class="${cls}" data-route="${r}">${t}</button>`;
	}).join("");

	const html = `<div class="cl-pages-nav-wrap" data-cl-pages-nav="1">
		<div class="text-muted cl-pages-nav-kicker">${__("Contactlink")}</div>
		<div class="cl-pages-nav-inner">${buttons}</div>
	</div>`;

	$parent.prepend(html);

	$parent
		.off("click.cl_pages_nav")
		.on("click.cl_pages_nav", ".cl-pages-nav-inner [data-route]", function (e) {
			e.preventDefault();
			const r = $(this).attr("data-route");
			if (!r || contactlink._pages_nav_route_is_active(r, active_route)) {
				return;
			}
			const item = (contactlink.PAGES_NAV_ROUTES || []).find((x) => x.route === r);
			if (item && item.external) {
				const parts = String(r).split("/");
				frappe.set_route(parts[0], parts.slice(1).join("/"));
				return;
			}
			frappe.set_route(r);
		});
};
