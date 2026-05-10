// Copyright (c) 2026, brossboss and contributors
// Contact Link Tutorial — in-app guide for Contactlink desk pages

frappe.pages["contact-link-tutoria"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Contact Link Tutorial"),
		single_column: true,
	});

	const $main = $(page.main);
	$main.empty();
	contactlink.inject_pages_nav(page, "contact-link-tutoria");

	if (!$("#cl-tutorial-styles").length) {
		$(`<style id="cl-tutorial-styles">
.cl-tut-wrap { max-width: 920px; margin: 0 auto; padding: 8px 4px 48px; line-height: 1.55; color: var(--text-color); }
.cl-tut-hero {
	border: 1px solid var(--border-color);
	border-radius: 10px;
	padding: 20px 22px;
	margin-bottom: 22px;
	background: var(--card-bg);
}
.cl-tut-hero h2 { margin: 0 0 10px 0; font-size: 1.35rem; font-weight: 600; }
.cl-tut-hero p { margin: 0; color: var(--text-muted); font-size: 14px; max-width: 52em; }
.cl-tut-toc {
	border: 1px solid var(--border-color);
	border-radius: 10px;
	padding: 16px 20px;
	margin-bottom: 24px;
	background: var(--control-bg);
}
.cl-tut-toc .cl-tut-toc-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 10px; font-weight: 600; }
.cl-tut-toc ul { margin: 0; padding-left: 1.15rem; }
.cl-tut-toc li { margin: 6px 0; }
.cl-tut-toc .cl-tut-jump {
	display: inline;
	background: none;
	border: none;
	padding: 0;
	margin: 0;
	font: inherit;
	color: var(--primary);
	text-decoration: none;
	cursor: pointer;
	text-align: left;
	line-height: inherit;
}
.cl-tut-toc .cl-tut-jump:hover { text-decoration: underline; }
.cl-tut-section {
	border: 1px solid var(--border-color);
	border-radius: 10px;
	padding: 18px 20px 20px;
	margin-bottom: 18px;
	background: var(--card-bg);
	scroll-margin-top: 12px;
}
.cl-tut-section h3 { margin: 0 0 12px 0; font-size: 1.12rem; font-weight: 600; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
.cl-tut-section h4 { margin: 18px 0 8px 0; font-size: 0.98rem; font-weight: 600; }
.cl-tut-section p { margin: 0 0 10px 0; font-size: 14px; }
.cl-tut-section ol, .cl-tut-section ul { margin: 0 0 12px 0; padding-left: 1.2rem; font-size: 14px; }
.cl-tut-section li { margin: 6px 0; }
.cl-tut-kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.cl-tut-note {
	border-left: 3px solid var(--primary);
	padding: 10px 14px;
	margin: 12px 0;
	background: var(--control-bg);
	border-radius: 0 8px 8px 0;
	font-size: 13px;
}
.cl-tut-note strong { display: block; margin-bottom: 4px; }
.cl-tut-quick { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cl-tut-quick .text-muted { font-size: 12px; margin-right: 4px; }
</style>`).appendTo("head");
	}

	function open_btn(route, label) {
		const r = frappe.utils.escape_html(route);
		const t = frappe.utils.escape_html(label);
		return `<button type="button" class="btn btn-default btn-xs cl-tut-open" data-route="${r}">${t}</button>`;
	}

	const html = `
<div class="cl-tut-wrap">
	<div class="cl-tut-hero">
		<h2>${__("Welcome to Contactlink")}</h2>
		<p>${__(
			"This application helps you register mobile devices with their owners and contact lists, then explore how owners connect when they share the same phone numbers or saved contact names. Use the sections below for step-by-step guidance."
		)}</p>
	</div>

	<div class="cl-tut-toc">
		<div class="cl-tut-toc-title">${__("On this page")}</div>
		<ul>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-overview">${__("Overview and data model")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-nav">${__("Finding your way (Admin Dashboard and top navigation)")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-device">${__("Device Entry — register owners and contacts")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-analysis">${__("Contact Link Analysis — network graph")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-contact-stats">${__("Contact Statistics — overlap for one device")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-phone-stats">${__("Phone Number Statistics — drill into one number")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-rules">${__("How matching and linking work")}</button></li>
			<li><button type="button" class="cl-tut-jump" data-cl-tut-target="cl-tut-access">${__("Permissions and tips")}</button></li>
		</ul>
	</div>

	<div id="cl-tut-overview" class="cl-tut-section">
		<h3>${__("Overview and data model")}</h3>
		<p>${__(
			"Each device is stored as a **Device Id** document. It holds the owner display name, an optional owner photo, a primary **Device ID Contact** field (for example the owner’s own phone or email), and a child table **Device Contact** with rows of **contact name** and **phone number**."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<p>${__(
			"Analysis pages read all Device Contact rows across devices. When the same normalized phone number appears on more than one device, those devices are “linked.” The same idea applies to **contact name** on the Contact Statistics page: names are compared after trimming and ignoring letter case."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<div class="cl-tut-kicker">
			<span class="text-muted small">${__("Open data entry")}</span>
			${open_btn("device-page", __("Device Entry"))}
		</div>
	</div>

	<div id="cl-tut-nav" class="cl-tut-section">
		<h3>${__("Finding your way")}</h3>
		<h4>${__("Admin Dashboard")}</h4>
		<p>${__(
			"Start from **Admin Dashboard** for a short description of each tool and buttons to open them. The sidebar lists the same pages for quick switching."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<div class="cl-tut-quick">
			<span class="text-muted">${__("Open")}</span>
			${open_btn("admin-dashboard", __("Admin Dashboard"))}
		</div>
		<h4>${__("Top navigation on desk pages")}</h4>
		<p>${__(
			"On Contactlink desk pages, a **Contactlink** bar at the top links to Admin home, **Tutorial** (this page), Contact link analysis, Device Entry, Contact statistics, and Phone number statistics."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
	</div>

	<div id="cl-tut-device" class="cl-tut-section">
		<h3>${__("Device Entry — register owners and contacts")}</h3>
		<p>${__(
			"Use **Device Entry** to create a new device record or edit an existing **Device Id**."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<ol>
			<li>${__(
				"Choose **New registration** to start fresh, or **Edit existing device** and pick a **Device Id** from the link field. You can switch devices or start a new registration at any time."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"Enter **Owner name** (how the owner should appear in reports). Optionally upload **Owner photo**."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"Fill **Device ID Contact** with the primary way to reach this device or owner (phone number, email, or label — stored as text)."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"Under **Device contacts**, add rows with **Add contact**, or use **Upload CSV** for bulk import. You can also **Template** to download a sample CSV."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"CSV files must use the headers **contact_name** and **phone_number** (export from Excel as CSV). After import, the form stores an **Import Reference** so you can roll back that batch later."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"In edit mode, **Import rollback** lets you select a past import reference and remove only the contacts that came from that import."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"Click **Save** or **Save changes** to write the document. Long lists are paginated; use the pager controls to review all contacts."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
		</ol>
		<div class="cl-tut-note">
			<strong>${__("In-form help")}</strong>
			${__("On Device Entry, use the **How to use this page** button in the menu for a short reminder of these steps.").replace(
				/\*\*(.+?)\*\*/g,
				"<strong>$1</strong>"
			)}
		</div>
		<div class="cl-tut-quick">
			<span class="text-muted">${__("Open")}</span>
			${open_btn("device-page", __("Device Entry"))}
		</div>
	</div>

	<div id="cl-tut-analysis" class="cl-tut-section">
		<h3>${__("Contact Link Analysis — network graph")}</h3>
		<p>${__(
			"The graph shows how device owners relate through **Device Contact** phone numbers. Owner nodes can show photos when **Owner photo** is set on the Device Id."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<h4>${__("View modes")}</h4>
		<ul>
			<li>${__(
				"**Owner network (shared contacts)** — only owners; an edge between two owners means they share at least one normalized phone number. Edge labels summarize how many links and a sample."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"**Full network (owners + phone nodes)** — circular nodes are phone bridges; lines connect each owner to the numbers in their contact list. Hover for full detail."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
		</ul>
		<h4>${__("Controls")}</h4>
		<ul>
			<li>${__("**Refresh** — reload data from the server.").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__("**Fit view** — zoom the graph to fit the pane.").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__("**Toggle physics** — turn force layout on or off for easier dragging.").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"**Filter by name or phone** — narrow visible nodes by typing part of an owner label, contact name, or number."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"**Load demo data** / **Remove demo data** — optional sample records for training (if enabled on your site)."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
		</ul>
		<h4>${__("Interacting with the graph")}</h4>
		<ul>
			<li>${__(
				"**Click** a node to see details and connection counts in the side panel."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"**Double-click** an owner node to open the **Device Id** document in the desk."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
		</ul>
		<p>${__(
			"The **Legend** below the graph explains node colors (owners vs phone/contact nodes)."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<div class="cl-tut-quick">
			<span class="text-muted">${__("Open")}</span>
			${open_btn("contact-link-analysi-1", __("Contact link analysis"))}
		</div>
	</div>

	<div id="cl-tut-contact-stats" class="cl-tut-section">
		<h3>${__("Contact Statistics — overlap for one device")}</h3>
		<p>${__(
			"Pick a **Device** (Device Id), then **Load statistics** (or select a device and let the page load). You get a summary and two tabs:"
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<ul>
			<li>${__(
				"**By phone number** — numbers on this device that also appear on at least one other device, with counts and which other owners saved that number (and under which contact names)."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"**By contact name** — saved names on this device that match (case-insensitive, trimmed) names on other devices, even if the phone digits differ."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
		</ul>
		<p>${__(
			"Tables support sorting by column headers where provided. Use row actions to open related desk records when available."
		)}</p>
		<div class="cl-tut-quick">
			<span class="text-muted">${__("Open")}</span>
			${open_btn("contact-statistics", __("Contact statistics"))}
		</div>
	</div>

	<div id="cl-tut-phone-stats" class="cl-tut-section">
		<h3>${__("Phone Number Statistics — drill into one number")}</h3>
		<p>${__(
			"Type a phone number in the **Phone number** field. The page suggests matching numbers as you type; statistics load from normalized digits (spaces and formatting are ignored for matching)."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<p>${__(
			"The results table lists every **Device Contact** row in the system that shares that normalized number: device, owner, optional Device ID Contact field, saved contact name, and display phone. Use **Export to Excel** when you need a spreadsheet copy."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<div class="cl-tut-quick">
			<span class="text-muted">${__("Open")}</span>
			${open_btn("phone-number-statist", __("Phone number statistics"))}
		</div>
	</div>

	<div id="cl-tut-rules" class="cl-tut-section">
		<h3>${__("How matching and linking work")}</h3>
		<h4>${__("Phone numbers")}</h4>
		<p>${__(
			"For linking and statistics, numbers are normalized by keeping **digits only**. Display values can still show plus signs or spaces; matching uses the digit string. Rows with no digits are skipped for phone-based graphs and mutual-number reports."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<h4>${__("Contact names")}</h4>
		<p>${__(
			"For the **By contact name** analysis, names are compared in lower case with extra spaces collapsed. Empty names do not participate in name-based overlap."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
		<h4>${__("Shared links")}</h4>
		<p>${__(
			"A **shared** phone or name means the same normalized value appears on **two or more** different Device Id documents. The graph and tables are read-only views of that data; change data on **Device Entry** or the **Device Id** form, then refresh analysis pages."
		).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>
	</div>

	<div id="cl-tut-access" class="cl-tut-section">
		<h3>${__("Permissions and tips")}</h3>
		<ul>
			<li>${__(
				"**Read** access on **Device Id** is required to load graphs and statistics APIs. **Write** access is required to save changes on Device Entry."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"Keep **Owner name** and **contact_name** consistent if you care about readable reports; the system still links by phone digits when names differ."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
			<li>${__(
				"After large CSV imports, confirm the **Import Reference** before saving so you can roll back the correct batch later."
			).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>
		</ul>
		<p class="text-muted" style="font-size: 13px; margin-bottom: 0;">${__(
			"If something looks empty, ensure at least two devices share a phone number (or a contact name, for the name tab) and that your user can read all relevant Device Id records."
		)}</p>
	</div>
</div>
`;

	$main.append(html);
	$main.on("click", ".cl-tut-open", function () {
		const r = $(this).attr("data-route");
		if (r) {
			frappe.set_route(r);
		}
	});
	$main.on("click", ".cl-tut-jump", function () {
		const id = ($(this).attr("data-cl-tut-target") || "").trim();
		if (!id) {
			return;
		}
		const el = document.getElementById(id);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	});
};
