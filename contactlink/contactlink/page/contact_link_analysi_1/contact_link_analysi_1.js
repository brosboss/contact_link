frappe.pages['contact-link-analysi-1'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Contact link Analysis Page',
// 		single_column: true
// 	});
// }


// // Copyright (c) 2026, brossboss and contributors
// // Contact Link Analysis — interactive graph of device owners linked via contacts

// frappe.pages["contact-link-analysi"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Contact Link Analysis"),
		single_column: true,
	});

	page.add_inner_button(__("Admin home"), () => frappe.set_route("admin-dashboard"));

	const $main = $(page.main);
	$main.empty();

	const root_id = "cl-analysis-" + frappe.utils.get_random(8);
	const html = `
		<div id="${root_id}" class="cl-link-analysis" style="display:flex;flex-direction:column;gap:12px;padding:4px 2px;min-height:0;max-width:100%;">
			<p class="text-muted" style="margin:0 0 4px 0;max-width:920px;line-height:1.45;">
				${__(
					"Explore how device owners connect through shared phone numbers from Device Contact rows. " +
						"Use the owner network to see direct links between owners; use the full network to see each phone as a bridge."
				)}
			</p>
			<div class="cl-toolbar form-inline" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
				<div class="form-group">
					<label class="text-muted small" style="margin-right:6px;">${__("View")}</label>
					<select class="form-control input-sm cl-mode" style="min-width:220px;">
						<option value="owners">${__("Owner network (shared contacts)")}</option>
						<option value="full">${__("Full network (owners + phone nodes)")}</option>
					</select>
				</div>
				<button type="button" class="btn btn-primary btn-sm cl-refresh">${__("Refresh")}</button>
				<button type="button" class="btn btn-default btn-sm cl-fit">${__("Fit view")}</button>
				<button type="button" class="btn btn-default btn-sm cl-physics">${__("Toggle physics")}</button>
				<div class="form-group" style="flex:1;min-width:160px;max-width:280px;">
					<input type="search" class="form-control input-sm cl-filter" placeholder="${__(
						"Filter by name or phone…"
					)}" />
				</div>
				<div class="form-group" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto;">
					<span class="text-muted small">${__("Try it")}</span>
					<button type="button" class="btn btn-default btn-sm cl-seed-demo">${__("Load demo data")}</button>
					<button type="button" class="btn btn-default btn-sm cl-clear-demo">${__("Remove demo data")}</button>
				</div>
			</div>
			<div style="display:flex;gap:12px;align-items:stretch;min-height:0;">
				<div class="cl-graph-wrap" style="flex:1;min-width:0;height:62vh;max-height:640px;min-height:400px;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg);position:relative;overflow:hidden;">
					<div class="cl-loading text-muted" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--card-bg);border-radius:8px;z-index:2;">
						${__("Loading graph…")}
					</div>
					<div class="cl-network" style="width:100%;height:100%;border-radius:8px;"></div>
				</div>
				<div class="cl-side" style="width:300px;flex-shrink:0;border:1px solid var(--border-color);border-radius:8px;padding:12px;background:var(--card-bg);overflow:auto;max-height:70vh;">
					<div class="text-muted small" style="margin-bottom:8px;">${__("Selection")}</div>
					<div class="cl-detail text-small">${__(
						"Click a node for details and connection statistics. Double-click an owner to open Device Id."
					)}</div>
					<hr style="margin:12px 0;border-color:var(--border-color);">
					<div class="text-muted small" style="margin-bottom:6px;">${__("Summary")}</div>
					<div class="cl-stats text-small"></div>
				</div>
			</div>
			<div class="cl-legend" style="max-width:560px;">
				<div class="text-muted small" style="margin-bottom:8px;font-weight:600;">${__("Legend")}</div>
				<table class="table table-bordered" style="margin:0;font-size:12px;background:var(--card-bg);">
					<thead>
						<tr>
							<th style="width:52px;padding:6px 8px;vertical-align:middle;">${__("Color")}</th>
							<th style="padding:6px 8px;vertical-align:middle;">${__("Meaning")}</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style="padding:8px;vertical-align:middle;text-align:center;">
								<span title="${__("Device owner")}" style="display:inline-block;width:14px;height:14px;background:#6B9AE8;border:1px solid #4A7DD4;border-radius:2px;"></span>
							</td>
							<td style="padding:8px;vertical-align:middle;line-height:1.45;">
								${__("Device owner (photo when Owner Image is set)")}
							</td>
						</tr>
						<tr class="cl-legend-contact">
							<td style="padding:8px;vertical-align:middle;text-align:center;">
								<span title="${__("Phone / contact")}" style="display:inline-block;width:14px;height:14px;background:#F0D78C;border:1px solid #C9A227;border-radius:50%;"></span>
							</td>
							<td style="padding:8px;vertical-align:middle;line-height:1.45;">
								${__("Phone / contact")}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	`;
	$main.append(html);

	const $root = $main.find("#" + root_id);
	const $net = $root.find(".cl-network");
	const $loading = $root.find(".cl-loading");
	const $detail = $root.find(".cl-detail");
	const $stats = $root.find(".cl-stats");
	const $mode = $root.find(".cl-mode");
	const $filter = $root.find(".cl-filter");
	const $legend_contact = $root.find(".cl-legend-contact");

	let network = null;
	let raw = { nodes: [], edges: [], mode: "owners" };
	let physics_on = true;
	let vis_waiters = [];

	function load_vis(cb) {
		if (window.vis && window.vis.DataSet && window.vis.Network) {
			cb();
			return;
		}
		vis_waiters.push(cb);
		if (vis_waiters.length > 1) return;

		const s = document.createElement("script");
		s.src = "https://cdn.jsdelivr.net/npm/vis-network@9.1.9/standalone/umd/vis-network.min.js";
		s.onload = () => {
			const pending = vis_waiters;
			vis_waiters = [];
			pending.forEach((fn) => fn());
		};
		s.onerror = () => {
			vis_waiters = [];
			$loading.hide();
			$detail.html(
				`<span class="text-danger">${__("Could not load graph library. Check network or CDN access.")}</span>`
			);
		};
		document.head.appendChild(s);
	}

	function neighbor_ids(nodes, edges) {
		const adj = new Map();
		for (const e of edges) {
			const a = e.from;
			const b = e.to;
			if (!adj.has(a)) adj.set(a, new Set());
			if (!adj.has(b)) adj.set(b, new Set());
			adj.get(a).add(b);
			adj.get(b).add(a);
		}
		return adj;
	}

	function apply_filter(payload, q) {
		const query = (q || "").trim().toLowerCase();
		if (!query) return payload;

		const match = (n) => {
			const label = (n.label || "").toLowerCase();
			const title = (n.title || "").toLowerCase();
			const pid = (n.phone_norm || "").toLowerCase();
			const pd = (n.phone_display || "").toLowerCase();
			const cnames = (n.contact_names || []).join(" ").toLowerCase();
			return (
				label.includes(query) ||
				title.includes(query) ||
				pid.includes(query) ||
				pd.includes(query) ||
				cnames.includes(query)
			);
		};

		const hit = new Set(payload.nodes.filter(match).map((n) => n.id));
		if (hit.size === 0) {
			return { nodes: [], edges: [], stats: payload.stats, mode: payload.mode };
		}

		const adj = neighbor_ids(payload.nodes, payload.edges);
		const visible = new Set(hit);
		for (const id of hit) {
			const nb = adj.get(id);
			if (nb) {
				for (const x of nb) visible.add(x);
			}
		}

		const nodes = payload.nodes.filter((n) => visible.has(n.id));
		const node_set = new Set(nodes.map((n) => n.id));
		const edges = payload.edges.filter((e) => node_set.has(e.from) && node_set.has(e.to));
		return { nodes, edges, stats: payload.stats, mode: payload.mode };
	}

	/** Number of edges incident to this node in the visible graph (respects search filter). */
	function connection_count_for_node(nodeId, payload) {
		const f = apply_filter(payload, $filter.val());
		let n = 0;
		for (const e of f.edges || []) {
			if (e.from === nodeId || e.to === nodeId) {
				n += 1;
			}
		}
		return n;
	}

	function node_stats_html(nodeId) {
		const count = connection_count_for_node(nodeId, raw);
		return `
			<div style="margin:12px 0 0 0;padding:12px 0 0 0;border-top:1px solid var(--border-color);">
				<div class="text-muted small" style="margin-bottom:8px;">${__("Statistics")}</div>
				<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
					<span>${__("Connections")}</span><strong style="font-size:1.15em;">${count}</strong>
				</div>
				<p class="text-muted" style="margin:8px 0 0 0;font-size:11px;line-height:1.4;">${__(
					"Number of links to this node in the graph above. Search may hide some links."
				)}</p>
			</div>
		`;
	}

	function vis_options(mode) {
		// vis-network rejects edges.width === undefined; omit global width in owners mode (per-edge width only).
		const edge_opts = {
			smooth: { type: "continuous" },
			color: {
				color: "#b8c0cc",
				highlight: "#8b95a8",
				hover: "#8b95a8",
				opacity: 0.72,
			},
			font: { size: mode === "owners" ? 9 : 8, align: "middle", color: "#64748b" },
			...(mode === "owners" ? {} : { width: 1 }),
		};

		return {
			interaction: {
				hover: true,
				tooltipDelay: 120,
				zoomView: true,
				dragView: true,
				selectConnectedEdges: true,
			},
			physics: {
				enabled: physics_on,
				stabilization: {
					iterations: mode === "owners" ? 120 : 200,
					updateInterval: 25,
				},
				forceAtlas2Based: {
					gravitationalConstant: mode === "owners" ? -38 : -50,
					centralGravity: 0.015,
					springLength: mode === "owners" ? 140 : 95,
					springConstant: 0.06,
				},
				solver: "forceAtlas2Based",
			},
			nodes: {
				font: { size: 12, face: "system-ui, sans-serif" },
				borderWidth: 1,
				shadow: { enabled: true, size: 2, x: 0, y: 1 },
			},
			edges: edge_opts,
			groups: {
				owner: {
					color: {
						background: "#6B9AE8",
						border: "#4A7DD4",
						highlight: { background: "#7DAAEF", border: "#3D6FC8" },
					},
					shape: "box",
					margin: 8,
					font: { color: "#ffffff", size: 11 },
				},
				contact: {
					color: {
						background: "#F0D78C",
						border: "#C9A227",
						highlight: { background: "#F5E0A8", border: "#B8921F" },
					},
					shape: "ellipse",
					font: { size: 10, face: "system-ui, sans-serif", color: "#3d3d3d" },
					margin: 10,
				},
			},
		};
	}

	function build_edges_vis(mode, edges) {
		if (mode !== "owners") return edges;
		return edges.map((e) => ({
			...e,
			// Hairline to slim: scale by shared count but cap low (was up to ~14px).
			width: Math.min(3.2, 0.65 + (e.value || 1) * 0.45),
		}));
	}

	function render_stats(stats, mode) {
		if (!stats) {
			$stats.empty();
			return;
		}
		const rows = [
			[__("Device Id records"), stats.device_rows],
			[__("Device Contact rows"), stats.link_rows],
			[__("Rows with a normalizable phone"), stats.usable_contact_rows ?? stats.link_rows],
			[__("Distinct normalized phones"), stats.unique_phones],
		];
		if (mode === "full") {
			rows.push([__("Owner nodes"), stats.owner_nodes]);
			rows.push([__("Phone nodes"), stats.contact_nodes]);
		} else {
			rows.push([__("Owner nodes (in graph)"), stats.owner_nodes]);
			rows.push([__("Owner-to-owner links"), stats.owner_edges || 0]);
		}
		$stats.html(
			rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:8px;"><span>${k}</span><strong>${v}</strong></div>`).join("")
		);
	}

	function render_graph(payload) {
		if (!window.vis || !window.vis.DataSet) {
			load_vis(() => render_graph(payload));
			return;
		}
		const filtered = apply_filter(payload, $filter.val());
		const mode = payload.mode || "full";
		$legend_contact.toggle(mode === "full");

		const nodes = new vis.DataSet(filtered.nodes);
		const edges = new vis.DataSet(build_edges_vis(mode, filtered.edges));

		const data = { nodes, edges };
		const opts = vis_options(mode);

		if (network) {
			network.destroy();
			network = null;
		}

		network = new vis.Network($net[0], data, opts);

		network.on("stabilizationIterationsDone", () => {
			network.fit({ animation: { duration: 380, easingFunction: "easeInOutQuad" } });
			// Avoid endless layout churn (can make the desk page feel like it "grows").
			if (typeof network.stopSimulation === "function") {
				network.stopSimulation();
			}
		});

		network.on("click", (p) => {
			if (p.nodes.length === 0) {
				$detail.text(__("Click a node to inspect."));
				return;
			}
			const id = p.nodes[0];
			const n = raw.nodes.find((x) => x.id === id);
			if (!n) return;
			if (n.group === "owner") {
				const dev = n.device_id || "";
				const img_src = n.owner_image_url || n.image || "";
				const img_block = img_src
					? `<div style="margin:0 0 10px 0;text-align:center;">
						<img src="${frappe.utils.escape_html(img_src)}" alt="" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color);box-shadow:0 1px 4px rgba(0,0,0,0.08);">
					</div>`
					: "";
				$detail.html(
					`${img_block}
					<p style="margin:0 0 8px 0;"><strong>${frappe.utils.escape_html(n.label)}</strong></p>
					<p class="text-muted" style="margin:0 0 8px 0;">${__("Device Id")}: <code>${frappe.utils.escape_html(
						dev
					)}</code></p>
					<button type="button" class="btn btn-xs btn-default cl-open">${__("Open Device Id")}</button>
					${node_stats_html(id)}`
				);
				$detail.find(".cl-open").on("click", () => {
					frappe.set_route("Form", "Device Id", dev);
				});
			} else {
				$detail.html(
					`<p style="margin:0 0 8px 0;"><strong>${__("Phone / contact")}</strong></p>
					<p style="margin:0;white-space:pre-wrap;">${frappe.utils.escape_html(n.title || n.label || "")}</p>
					<p class="text-muted" style="margin:8px 0 0 0;">${__("Shared by")} <strong>${n.shared_by || 1}</strong> ${__(
						"device(s)"
					)}</p>
					${node_stats_html(id)}`
				);
			}
		});

		network.on("doubleClick", (p) => {
			if (p.nodes.length === 0) return;
			const id = p.nodes[0];
			const n = raw.nodes.find((x) => x.id === id);
			if (n && n.group === "owner" && n.device_id) {
				frappe.set_route("Form", "Device Id", n.device_id);
			}
		});

		$loading.hide();
	}

	function fetch_and_render() {
		$loading.show();
		const mode = $mode.val();
		frappe.call({
			method: "contactlink.contactlink.api.get_contact_link_graph",
			args: { mode },
			callback: (r) => {
				if (r.exc) {
					$loading.hide();
					$detail.html(`<span class="text-danger">${__("Could not load data.")}</span>`);
					return;
				}
				raw = r.message || { nodes: [], edges: [], stats: {} };
				render_stats(raw.stats, raw.mode);
				if (!raw.nodes.length) {
					$loading.hide();
					if (network) {
						network.destroy();
						network = null;
					}
					const st = raw.stats || {};
					let empty_msg = __(
						"No Device Contact rows found. Add contacts on Device Id records to see links."
					);
					if ((st.link_rows || 0) > 0 && (st.usable_contact_rows || 0) === 0) {
						empty_msg = __(
							"Contacts exist but no usable phone numbers (digits) were found. Enter phone numbers so links can be computed."
						);
					}
					$detail.html(`<p class="text-muted">${empty_msg}</p>`);
					return;
				}
				load_vis(() => render_graph(raw));
			},
		});
	}

	$root.find(".cl-refresh").on("click", () => fetch_and_render());
	$root.find(".cl-fit").on("click", () => {
		if (network) network.fit({ animation: { duration: 320, easingFunction: "easeInOutQuad" } });
	});
	$root.find(".cl-physics").on("click", () => {
		physics_on = !physics_on;
		if (network) {
			network.setOptions({ physics: { enabled: physics_on } });
		}
	});
	let filter_t = null;
	$filter.on("input", () => {
		clearTimeout(filter_t);
		filter_t = setTimeout(() => {
			if (raw.nodes.length && window.vis) render_graph(raw);
		}, 220);
	});
	$mode.on("change", () => fetch_and_render());

	$root.find(".cl-seed-demo").on("click", () => {
		frappe.call({
			method: "contactlink.contactlink.sample_data.seed_contact_link_demo",
			args: { replace: 0 },
			callback: (r) => {
				if (r.exc) return;
				const msg = r.message || {};
				if (msg.status === "exists") {
					frappe.confirm(
						__("Demo data is already loaded. Replace it with a fresh set?"),
						() => {
							frappe.call({
								method: "contactlink.contactlink.sample_data.seed_contact_link_demo",
								args: { replace: 1 },
								callback: (r2) => {
									if (r2.exc) return;
									frappe.show_alert({
										message: (r2.message && r2.message.message) || __("Done"),
										indicator: "green",
									});
									fetch_and_render();
								},
							});
						}
					);
					return;
				}
				frappe.show_alert({ message: msg.message || __("Done"), indicator: "green" });
				fetch_and_render();
			},
		});
	});

	$root.find(".cl-clear-demo").on("click", () => {
		frappe.confirm(
			__(
				"Remove all Device Id records whose Owner Name starts with \"DemoLink:\"? Other records are not affected."
			),
			() => {
				frappe.call({
					method: "contactlink.contactlink.sample_data.clear_contact_link_demo",
					callback: (r) => {
						if (r.exc) return;
						frappe.show_alert({
							message: (r.message && r.message.message) || __("Removed"),
							indicator: "orange",
						});
						fetch_and_render();
					},
				});
			}
		);
	});

	fetch_and_render();
};
