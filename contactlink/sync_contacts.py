#!/usr/bin/env python3
"""USB phone contact sync — CLI entry point and desk Mobile Auto Importer backend."""

from __future__ import annotations

import argparse
import os
import sys

_SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
APP_PKG_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, ".."))
BENCH_ROOT = os.path.abspath(os.path.join(APP_PKG_ROOT, "..", ".."))
# Running as a script puts _SCRIPT_DIR on sys.path and breaks `contactlink.contactlink` imports.
while _SCRIPT_DIR in sys.path:
	sys.path.remove(_SCRIPT_DIR)
if APP_PKG_ROOT not in sys.path:
	sys.path.insert(0, APP_PKG_ROOT)

# --- Standalone HTTP defaults (when not run with --site) ---
FRAPPE_URL = "http://127.0.0.1:8001"
FRAPPE_SITE = "contactlink.local"
API_KEY = "d768de31a4c87eb"
API_SECRET = "9f213ad8cd12ab3"
SYNC_API = "contactlink.contactlink.api.sync_device_contacts"


def _build_stop_check(site: str | None, log_file: str | None):
	if not site or not log_file:
		return None

	def _stopped() -> bool:
		import frappe
		from contactlink.contactlink.mobile_importer.manager import stop_flag_path

		return os.path.exists(stop_flag_path())

	return _stopped


def main() -> None:
	parser = argparse.ArgumentParser(description="Sync Android phone contacts via ADB into Contactlink.")
	parser.add_argument("--site", help="Frappe site name — enables fast in-process sync (no HTTP).")
	parser.add_argument("--log-file", help="Append live log lines to this file (desk importer).")
	args = parser.parse_args()

	from contactlink.contactlink.mobile_importer.service import ImporterLogger, run_importer_loop

	logger = ImporterLogger(args.log_file)
	use_direct = False
	http_config = {
		"frappe_url": FRAPPE_URL,
		"frappe_site": FRAPPE_SITE,
		"api_key": API_KEY,
		"api_secret": API_SECRET,
		"sync_api": SYNC_API,
	}

	if args.site:
		import frappe

		sites_path = os.path.join(BENCH_ROOT, "sites")
		os.chdir(sites_path)
		frappe.init(site=args.site, sites_path=".")
		frappe.connect()
		frappe.set_user("Administrator")
		use_direct = True
		logger.log(f"Connected to Frappe site: {args.site} (direct sync)")

	try:
		run_importer_loop(
			log=logger.log,
			use_direct=use_direct,
			http_config=http_config,
			stop_check=_build_stop_check(args.site, args.log_file),
		)
	except KeyboardInterrupt:
		logger.log("Stopped by user (Ctrl+C).")
	finally:
		logger.close()
		if args.site:
			import frappe

			frappe.destroy()


if __name__ == "__main__":
	main()
