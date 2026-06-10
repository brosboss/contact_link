"""Start/stop the mobile importer subprocess and stream logs to the desk page."""

from __future__ import annotations

import os
import signal
import subprocess

import frappe
from frappe.utils import get_bench_path

from contactlink.contactlink.mobile_importer.service import list_adb_devices

CACHE_KEY = "mobile_importer_process"
LOG_NAME = "mobile_importer.log"
STOP_NAME = "mobile_importer.stop"


def _importer_dir() -> str:
	path = frappe.get_site_path("private", "mobile_importer")
	os.makedirs(path, exist_ok=True)
	return path


def log_file_path() -> str:
	return os.path.join(_importer_dir(), LOG_NAME)


def stop_flag_path() -> str:
	return os.path.join(_importer_dir(), STOP_NAME)


def _cache_state() -> dict:
	return frappe.cache.get_value(CACHE_KEY) or {}


def _set_cache_state(state: dict) -> None:
	frappe.cache.set_value(CACHE_KEY, state, expires_in_sec=86400)


def _python_bin() -> str:
	return os.path.join(get_bench_path(), "env", "bin", "python")


def _script_path() -> str:
	return os.path.join(
		get_bench_path(), "apps", "contactlink", "contactlink", "sync_contacts.py"
	)


def _is_pid_running(pid: int | None) -> bool:
	if not pid:
		return False
	try:
		os.kill(int(pid), 0)
		return True
	except (OSError, ValueError):
		return False


def _clear_stop_flag() -> None:
	path = stop_flag_path()
	if os.path.exists(path):
		os.remove(path)


def _request_stop() -> None:
	open(stop_flag_path(), "w", encoding="utf-8").close()


def _read_log_from_offset(offset: int = 0) -> tuple[list[str], int]:
	path = log_file_path()
	if not os.path.exists(path):
		return [], 0
	with open(path, "rb") as handle:
		handle.seek(max(0, int(offset or 0)))
		chunk = handle.read()
		new_offset = handle.tell()
	text = chunk.decode("utf-8", errors="replace")
	lines = [ln for ln in text.splitlines() if ln != ""]
	return lines, new_offset


def _require_importer_permission() -> None:
	if frappe.session.user == "Guest":
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
	if "System Manager" in frappe.get_roles() or "main_admin" in frappe.get_roles():
		return
	frappe.has_permission("Device Id", "write", throw=True)


def get_importer_status(log_offset: int = 0) -> dict:
	_require_importer_permission()
	state = _cache_state()
	pid = state.get("pid")
	running = _is_pid_running(pid)
	if state.get("pid") and not running:
		state = {"pid": None, "started_by": state.get("started_by")}
		_set_cache_state(state)

	lines, new_offset = _read_log_from_offset(log_offset)
	adb = list_adb_devices()
	return {
		"running": running,
		"pid": pid if running else None,
		"started_by": state.get("started_by"),
		"started_at": state.get("started_at"),
		"log_lines": lines,
		"log_offset": new_offset,
		"adb": adb,
	}


def start_importer() -> dict:
	_require_importer_permission()
	status = get_importer_status()
	if status["running"]:
		return {"status": "already_running", **status}

	_clear_stop_flag()
	path = log_file_path()
	with open(path, "w", encoding="utf-8") as handle:
		handle.write("Starting mobile auto importer...\n")

	cmd = [
		_python_bin(),
		_script_path(),
		"--site",
		frappe.local.site,
		"--log-file",
		path,
	]
	proc = subprocess.Popen(
		cmd,
		cwd=os.path.join(get_bench_path(), "sites"),
		stdout=subprocess.DEVNULL,
		stderr=subprocess.DEVNULL,
		start_new_session=True,
	)
	state = {
		"pid": proc.pid,
		"started_by": frappe.session.user,
		"started_at": frappe.utils.now(),
	}
	_set_cache_state(state)
	return {"status": "started", "pid": proc.pid}


def stop_importer() -> dict:
	_require_importer_permission()
	state = _cache_state()
	pid = state.get("pid")
	_request_stop()
	if pid and _is_pid_running(pid):
		try:
			os.killpg(os.getpgid(int(pid)), signal.SIGTERM)
		except (OSError, ProcessLookupError):
			try:
				os.kill(int(pid), signal.SIGTERM)
			except (OSError, ProcessLookupError):
				pass
	_set_cache_state({"pid": None, "started_by": state.get("started_by")})
	return {"status": "stopped"}
