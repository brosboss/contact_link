// Copyright (c) 2026, brossboss and contributors
// Pull latest Contactlink code from `origin main` on the server (git pull).

frappe.pages["update-repository"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Update Repository"),
		single_column: true,
	});

	const root_id = "ur-root-" + frappe.utils.get_random(8);
	const $main = $(page.main);
	$main.empty();
	contactlink.inject_pages_nav(page, "update-repository");
	$main.append(`
		<div id="${root_id}" style="padding:4px 2px 32px;max-width:880px;">
			<p class="text-muted" style="margin:0 0 16px 0;line-height:1.5;">
				${__(
					"Fetches and merges the latest commits from the remote branch main into this server's Contactlink app. " +
						"After a successful pull, run bench migrate / clear-cache on the server if the update includes schema or asset changes."
				)}
			</p>
			<div class="form-group" style="margin-bottom:16px;">
				<label class="control-label">${__("Repository status")}</label>
				<div class="ur-status well" style="margin-bottom:0;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;min-height:48px;"></div>
			</div>
			<p>
				<button type="button" class="btn btn-primary ur-pull">${__("Pull from origin main")}</button>
				<button type="button" class="btn btn-default ur-refresh">${__("Refresh status")}</button>
			</p>
			<div class="form-group ur-output-wrap" style="display:none;">
				<label class="control-label">${__("Last command output")}</label>
				<pre class="ur-output well" style="margin-bottom:0;max-height:320px;overflow:auto;font-size:12px;"></pre>
			</div>
		</div>
	`);

	const $root = $main.find("#" + root_id);
	const $status = $root.find(".ur-status");
	const $output_wrap = $root.find(".ur-output-wrap");
	const $output = $root.find(".ur-output");

	function format_status(r) {
		if (!r || r.exc) {
			return __("Could not load status.");
		}
		if (!r.ok) {
			return (r.error || __("Not a git repository.")) + (r.path ? "\n" + r.path : "");
		}
		const parts = [];
		if (r.branch) parts.push(__("Branch") + ": " + r.branch);
		if (r.short_sha) parts.push(__("Commit") + ": " + r.short_sha);
		if (r.status_line) parts.push(r.status_line);
		if (r.path) parts.push(__("Path") + ": " + r.path);
		return parts.join("\n");
	}

	function load_status() {
		$status.text(__("Loading…"));
		frappe.call({
			method: "contactlink.contactlink.api_git.get_contactlink_repository_status",
			callback: function (r) {
				if (r.message) {
					$status.text(format_status(r.message));
				} else {
					$status.text(__("No response."));
				}
			},
			error: function () {
				$status.text(__("Request failed."));
			},
		});
	}

	function run_pull() {
		frappe.confirm(
			__(
				"This will run git pull origin main on the server for the Contactlink app. Continue?"
			),
			() => {
				$root.find(".ur-pull").prop("disabled", true);
				frappe.call({
					method: "contactlink.contactlink.api_git.pull_contactlink_from_main",
					freeze: true,
					freeze_message: __("Pulling from origin main…"),
					callback: function (r) {
						$root.find(".ur-pull").prop("disabled", false);
						const msg = r.message;
						if (msg && msg.output != null) {
							$output_wrap.show();
							$output.text(msg.output);
						}
						if (msg && msg.status) {
							$status.text(format_status(msg.status));
						}
						if (msg && msg.ok) {
							frappe.show_alert({ message: __("Pull completed."), indicator: "green" });
						} else if (msg && !msg.ok) {
							frappe.msgprint({
								title: __("Pull failed"),
								message: msg.output || __("See output below."),
								indicator: "red",
							});
						}
					},
					error: function () {
						$root.find(".ur-pull").prop("disabled", false);
					},
				});
			},
			() => {}
		);
	}

	$root.find(".ur-refresh").on("click", load_status);
	$root.find(".ur-pull").on("click", run_pull);

	load_status();
};
