frappe.pages["mobile-auto-importer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Mobile Auto Importer"),
		single_column: true,
	});

	new MobileAutoImporterPage(page);
};

class MobileAutoImporterPage {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.log_offset = 0;
		this.poll_timer = null;
		this.render();
		this.bind_events();
		contactlink.inject_pages_nav(this.page, "mobile-auto-importer", { parent: this.wrapper });
		this.refresh_status();
	}

	render() {
		this.wrapper.append(`
			<div class="mai-page">
				<div class="mai-toolbar">
					<button type="button" class="btn btn-primary btn-sm" id="mai_start">
						<i class="fa fa-play"></i> ${__("Start importer")}
					</button>
					<button type="button" class="btn btn-danger btn-sm" id="mai_stop" disabled>
						<i class="fa fa-stop"></i> ${__("Stop")}
					</button>
					<span class="mai-status-pill" id="mai_status_pill">${__("Checking…")}</span>
				</div>

				<div class="mai-grid">
					<div class="mai-panel">
						<h5>${__("ADB devices")}</h5>
						<pre class="mai-adb-output" id="mai_adb_output">${__("Waiting for status…")}</pre>
						<p class="text-muted mai-hint">${__(
							"Plug in the phone via USB, enable USB debugging, and unlock the screen."
						)}</p>
					</div>
					<div class="mai-panel">
						<h5>${__("Session")}</h5>
						<div class="mai-meta" id="mai_meta">—</div>
					</div>
				</div>

				<div class="mai-panel mai-log-panel">
					<div class="mai-log-head">
						<h5>${__("Live log")}</h5>
						<button type="button" class="btn btn-default btn-xs" id="mai_clear_log">${__(
							"Clear view"
						)}</button>
					</div>
					<pre class="mai-log-output" id="mai_log_output"></pre>
				</div>
			</div>
		`);

		if (!$("#mai-page-styles").length) {
			$(`<style id="mai-page-styles">
.mai-page { max-width: 1100px; }
.mai-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.mai-status-pill {
	display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px;
	background: var(--control-bg); border: 1px solid var(--border-color);
}
.mai-status-pill.is-running { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
.mai-status-pill.is-stopped { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.mai-grid { display: grid; grid-template-columns: 1fr 280px; gap: 12px; margin-bottom: 12px; }
@media (max-width: 900px) { .mai-grid { grid-template-columns: 1fr; } }
.mai-panel {
	border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; background: var(--card-bg);
}
.mai-panel h5 { margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.mai-adb-output, .mai-log-output {
	margin: 0; padding: 10px 12px; border-radius: 6px; background: #0f172a; color: #e2e8f0;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
	max-height: 160px; overflow: auto;
}
.mai-log-output { max-height: 420px; min-height: 220px; }
.mai-log-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mai-log-head h5 { margin: 0; }
.mai-meta { font-size: 13px; line-height: 1.6; }
.mai-hint { margin: 8px 0 0 0; font-size: 12px; }
</style>`).appendTo("head");
		}
	}

	bind_events() {
		this.wrapper.find("#mai_start").on("click", () => this.start_importer());
		this.wrapper.find("#mai_stop").on("click", () => this.stop_importer());
		this.wrapper.find("#mai_clear_log").on("click", () => {
			this.wrapper.find("#mai_log_output").empty();
		});
	}

	_schedule_poll(running) {
		if (this.poll_timer) {
			clearTimeout(this.poll_timer);
			this.poll_timer = null;
		}
		const delay = running ? 1200 : 4000;
		this.poll_timer = setTimeout(() => this.refresh_status(), delay);
	}

	refresh_status() {
		frappe.call({
			method: "contactlink.contactlink.api.get_mobile_importer_status",
			args: { log_offset: this.log_offset },
			callback: (r) => {
				if (r.exc || !r.message) {
					this._schedule_poll(false);
					return;
				}
				this.apply_status(r.message);
			},
			error: () => this._schedule_poll(false),
		});
	}

	apply_status(data) {
		const running = !!data.running;
		const $pill = this.wrapper.find("#mai_status_pill");
		const $start = this.wrapper.find("#mai_start");
		const $stop = this.wrapper.find("#mai_stop");

		$pill
			.toggleClass("is-running", running)
			.toggleClass("is-stopped", !running)
			.text(running ? __("Running") : __("Stopped"));
		$start.prop("disabled", running);
		$stop.prop("disabled", !running);

		const adb = data.adb || {};
		this.wrapper.find("#mai_adb_output").text(adb.raw || __("No ADB output"));

		const device_lines = (adb.devices || [])
			.map((d) => `${d.serial}\t${d.status}`)
			.join("\n");
		const meta = [
			`<div><strong>${__("Authorized devices")}:</strong> ${(adb.devices || []).length}</div>`,
			device_lines
				? `<div style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:12px;">${frappe.utils.escape_html(
						device_lines
				  )}</div>`
				: `<div class="text-muted">${__("No device in \"device\" state — check USB debugging.")}</div>`,
			running && data.pid ? `<div style="margin-top:8px;"><strong>PID:</strong> ${data.pid}</div>` : "",
			data.started_by
				? `<div><strong>${__("Started by")}:</strong> ${frappe.utils.escape_html(data.started_by)}</div>`
				: "",
			data.started_at
				? `<div><strong>${__("Started at")}:</strong> ${frappe.utils.escape_html(data.started_at)}</div>`
				: "",
		].join("");
		this.wrapper.find("#mai_meta").html(meta);

		const lines = data.log_lines || [];
		if (lines.length) {
			const $log = this.wrapper.find("#mai_log_output");
			const at_bottom = $log[0].scrollHeight - $log.scrollTop() - $log.outerHeight() < 40;
			lines.forEach((line) => {
				$log.append(`${frappe.utils.escape_html(line)}\n`);
			});
			if (at_bottom) {
				$log.scrollTop($log[0].scrollHeight);
			}
		}
		this.log_offset = data.log_offset || this.log_offset;
		this._schedule_poll(running);
	}

	start_importer() {
		frappe.dom.freeze(__("Starting…"));
		frappe.call({
			method: "contactlink.contactlink.api.start_mobile_importer",
			callback: (r) => {
				if (!r.exc) {
					frappe.show_alert({ message: __("Importer started"), indicator: "green" });
					this.log_offset = 0;
					this.wrapper.find("#mai_log_output").empty();
					this.refresh_status();
				}
			},
			always: () => frappe.dom.unfreeze(),
		});
	}

	stop_importer() {
		frappe.dom.freeze(__("Stopping…"));
		frappe.call({
			method: "contactlink.contactlink.api.stop_mobile_importer",
			callback: (r) => {
				if (!r.exc) {
					frappe.show_alert({ message: __("Importer stopped"), indicator: "orange" });
					this.refresh_status();
				}
			},
			always: () => frappe.dom.unfreeze(),
		});
	}
}
