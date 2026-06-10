"""ADB contact extraction and Frappe sync — used by CLI and desk Mobile Auto Importer."""

from __future__ import annotations

import subprocess
import time
from typing import Callable

import requests

CONTACT_QUERY = (
	"content",
	"query",
	"--uri",
	"content://com.android.contacts/data/phones",
	"--projection",
	"display_name:data1",
)
EXTRACT_RETRIES = 4
EXTRACT_RETRY_DELAY = 3
SYNC_BATCH_SIZE = 2000
POLL_INTERVAL = 3
DEVICE_SETTLE_SECONDS = 3

LogFn = Callable[[str], None]


class ImporterLogger:
	"""Line-buffered logger for console and optional log file."""

	def __init__(self, log_path: str | None = None):
		self.log_path = log_path
		self._file = open(log_path, "a", encoding="utf-8", buffering=1) if log_path else None

	def log(self, message: str) -> None:
		text = (message or "").rstrip()
		print(text, flush=True)
		if self._file:
			self._file.write(text + "\n")
			self._file.flush()

	def close(self) -> None:
		if self._file:
			self._file.close()
			self._file = None


def list_adb_devices() -> dict:
	"""Return adb devices output and parsed authorized device serials."""
	header = "List of devices attached"
	try:
		result = subprocess.run(
			["adb", "devices"],
			capture_output=True,
			text=True,
			timeout=8,
			check=False,
		)
		raw = (result.stdout or "").strip()
		if not raw:
			raw = header
		lines = raw.splitlines()
		devices = []
		for line in lines[1:]:
			parts = line.split()
			if len(parts) >= 2 and parts[1] == "device":
				devices.append({"serial": parts[0], "status": parts[1]})
		return {"raw": raw, "devices": devices, "adb_ok": result.returncode == 0}
	except FileNotFoundError:
		return {
			"raw": "Error: adb not found. Install Android Platform Tools.",
			"devices": [],
			"adb_ok": False,
		}
	except Exception as e:
		return {"raw": f"Error checking devices: {e}", "devices": [], "adb_ok": False}


def _run_adb_shell(device_serial: str, *args, timeout: int = 180) -> subprocess.CompletedProcess:
	cmd = ["adb", "-s", device_serial, "shell", *args]
	return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)


def _adb_shell(device_serial: str, *args, timeout: int = 60) -> str:
	result = _run_adb_shell(device_serial, *args, timeout=timeout)
	if result.returncode != 0:
		raise subprocess.CalledProcessError(
			result.returncode, result.args, output=result.stdout, stderr=result.stderr
		)
	return (result.stdout or "").strip()


def _ensure_contact_permission(device_serial: str, granted: set[str], log: LogFn | None = None) -> None:
	if device_serial in granted:
		return
	result = _run_adb_shell(
		device_serial,
		"pm",
		"grant",
		"com.android.shell",
		"android.permission.READ_CONTACTS",
	)
	if result.returncode == 0:
		granted.add(device_serial)
	elif log:
		err = (result.stderr or result.stdout or "").strip()
		if err:
			log(f"Note: could not grant contact permission via adb: {err}")


def _parse_content_rows(output: str) -> list[dict]:
	rows = []
	for line in (output or "").splitlines():
		if "Row:" not in line:
			continue
		row = {}
		for part in line.split(", "):
			if "=" in part:
				key, value = part.split("=", 1)
				row[key.strip()] = value.strip()
		if row:
			rows.append(row)
	return rows


def extract_device_info(device_serial: str, log: LogFn | None = None) -> dict:
	"""Read make/model/Android and SIM in minimal adb round-trips."""
	details: dict = {}
	try:
		manufacturer = _adb_shell(device_serial, "getprop", "ro.product.manufacturer", timeout=10)
		model = _adb_shell(device_serial, "getprop", "ro.product.model", timeout=10)
		android_version = _adb_shell(device_serial, "getprop", "ro.build.version.release", timeout=10)
		label = " ".join(p for p in [manufacturer, model] if p).strip()
		if android_version:
			label = f"{label} (Android {android_version})" if label else f"Android {android_version}"
		details["device_details"] = label or device_serial
	except Exception as e:
		if log:
			log(f"Could not read device details: {e}")
		details["device_details"] = device_serial

	sim_types = ""
	try:
		sim_types = _adb_shell(device_serial, "getprop", "gsm.sim.operator.alpha", timeout=10)
	except Exception:
		pass

	if not sim_types or sim_types in ("null", "NULL"):
		try:
			output = _adb_shell(
				device_serial,
				"content",
				"query",
				"--uri",
				"content://telephony/siminfo",
				"--projection",
				"display_name",
			)
			names = [
				(row.get("display_name") or "").strip()
				for row in _parse_content_rows(output)
				if (row.get("display_name") or "").strip() not in ("", "null", "NULL")
			]
			if names:
				sim_types = ", ".join(dict.fromkeys(names))
		except Exception:
			pass

	details["sim_types"] = sim_types if sim_types and sim_types not in ("null", "NULL") else ""
	return details


def _parse_contact_row(line: str) -> dict | None:
	if "Row:" not in line or "display_name=" not in line or ", data1=" not in line:
		return None
	left, phone = line.split(", data1=", 1)
	name = left.split("display_name=", 1)[1].strip()
	phone = phone.strip()
	if not name or not phone or name in ("##", "null", "NULL") or phone in ("##", "null", "NULL"):
		return None
	return {"contact_name": name, "phone_number": phone}


def _contacts_from_adb_output(output: str) -> list[dict]:
	contacts = []
	seen: set[tuple[str, str]] = set()
	for line in (output or "").splitlines():
		row = _parse_contact_row(line)
		if not row:
			continue
		key = (row["contact_name"], row["phone_number"])
		if key in seen:
			continue
		seen.add(key)
		contacts.append(row)
	return contacts


def extract_contacts(device_serial: str, granted: set[str], log: LogFn | None = None) -> list[dict]:
	if log:
		log(f"Extracting contacts from device {device_serial}...")
	_ensure_contact_permission(device_serial, granted, log)

	last_error = ""
	for attempt in range(1, EXTRACT_RETRIES + 1):
		if attempt > 1:
			if log:
				log(f"Retry {attempt}/{EXTRACT_RETRIES} — unlock the phone and keep the screen on...")
			time.sleep(EXTRACT_RETRY_DELAY)

		try:
			result = _run_adb_shell(device_serial, *CONTACT_QUERY, timeout=180)
			if result.returncode == 0:
				contacts = _contacts_from_adb_output(result.stdout)
				if contacts:
					if log:
						log(f"Read {len(contacts)} contact(s) from device.")
					return contacts
				last_error = "ADB returned no contact rows."
			else:
				last_error = (result.stderr or result.stdout or "").strip() or (
					f"adb exit code {result.returncode}"
				)
		except subprocess.TimeoutExpired:
			last_error = "Timed out reading contacts (very large phonebook?)."
		except Exception as e:
			last_error = str(e)

		if last_error and log:
			log(f"Extract attempt {attempt} failed: {last_error[:300]}")

	if log:
		log(
			"Could not read contacts. Unlock the phone, accept any permission prompts, "
			"then unplug and reconnect USB to retry."
		)
	return []


def _sync_batch_direct(device_id: str, batch: list[dict], device_info: dict, *, first: bool) -> dict:
	from contactlink.contactlink.api import sync_device_contacts

	return sync_device_contacts(
		device_id,
		batch,
		device_details=device_info.get("device_details") if first else None,
		sim_types=device_info.get("sim_types") if first else None,
	)


def _sync_batch_http(
	device_id: str,
	batch: list[dict],
	device_info: dict,
	*,
	first: bool,
	frappe_url: str,
	frappe_site: str,
	api_key: str,
	api_secret: str,
	sync_api: str,
) -> dict:
	headers = {
		"Authorization": f"token {api_key}:{api_secret}",
		"Content-Type": "application/json",
		"Accept": "application/json",
		"Host": frappe_site,
	}
	payload = {
		"device_id": device_id,
		"contacts": batch,
		"device_details": device_info.get("device_details") if first else None,
		"sim_types": device_info.get("sim_types") if first else None,
	}
	response = requests.post(
		f"{frappe_url}/api/method/{sync_api}",
		json=payload,
		headers=headers,
		timeout=300,
	)
	response.raise_for_status()
	return response.json().get("message", {})


def sync_contacts_to_frappe(
	device_id: str,
	contacts: list[dict],
	device_info: dict | None = None,
	*,
	use_direct: bool = False,
	log: LogFn | None = None,
	http_config: dict | None = None,
) -> bool:
	if not contacts:
		if log:
			log("No contacts found to sync.")
		return False

	device_info = device_info or {}
	total = len(contacts)
	if log:
		log(f"Uploading {total} contacts to Frappe in batches of {SYNC_BATCH_SIZE}...")

	last_result: dict = {}
	for offset in range(0, total, SYNC_BATCH_SIZE):
		batch = contacts[offset : offset + SYNC_BATCH_SIZE]
		first = offset == 0
		batch_no = offset // SYNC_BATCH_SIZE + 1
		batch_total = (total + SYNC_BATCH_SIZE - 1) // SYNC_BATCH_SIZE
		if log:
			log(f"  Batch {batch_no}/{batch_total} ({len(batch)} rows)...")

		try:
			if use_direct:
				last_result = _sync_batch_direct(device_id, batch, device_info, first=first)
			else:
				cfg = http_config or {}
				last_result = _sync_batch_http(
					device_id,
					batch,
					device_info,
					first=first,
					frappe_url=cfg["frappe_url"],
					frappe_site=cfg["frappe_site"],
					api_key=cfg["api_key"],
					api_secret=cfg["api_secret"],
					sync_api=cfg["sync_api"],
				)
		except Exception as e:
			if log:
				log(f"Batch {batch_no}/{batch_total} failed: {e}")
			return False

	if log and last_result:
		synced = last_result.get("new_records_synced", 0)
		rows = last_result.get("rows_on_device", total)
		unique = last_result.get("unique_numbers_on_device", "—")
		stored = last_result.get("contacts_stored_after", "—")
		dupes = last_result.get("duplicates_found", 0)
		device_name = last_result.get("device_name", "")
		log(f"Device Id {device_name}: {stored} unique number(s) now stored.")
		log(
			f"  Phone had {rows} contact row(s) ({unique} unique numbers); "
			f"{synced} newly imported this run, {dupes} row(s) skipped as already stored."
		)
	return True


def run_importer_loop(
	*,
	log: LogFn | None = None,
	use_direct: bool = False,
	http_config: dict | None = None,
	stop_check: Callable[[], bool] | None = None,
) -> None:
	"""Poll USB devices and sync new phones until stop_check returns True."""
	if log:
		log("Initializing USB Phone Detection Daemon...")

	processed: set[str] = set()
	failed: set[str] = set()
	granted: set[str] = set()

	while True:
		if stop_check and stop_check():
			if log:
				log("Importer stopped.")
			break

		adb = list_adb_devices()
		connected = [d["serial"] for d in adb["devices"]]
		processed &= set(connected)
		failed &= set(connected)
		granted &= set(connected)

		for device in connected:
			if device in processed or device in failed:
				continue

			if log:
				log(f"\n[+] New Device Detected: {device}")
				log("Unlock the phone and keep the screen on while contacts are read.")
			time.sleep(DEVICE_SETTLE_SECONDS)

			device_info = extract_device_info(device, log)
			if log:
				if device_info.get("device_details"):
					log(f"Device: {device_info['device_details']}")
				if device_info.get("sim_types"):
					log(f"SIM types: {device_info['sim_types']}")

			contacts = extract_contacts(device, granted, log)
			if not contacts:
				failed.add(device)
				continue

			try:
				ok = sync_contacts_to_frappe(
					device,
					contacts,
					device_info,
					use_direct=use_direct,
					log=log,
					http_config=http_config,
				)
			except Exception as e:
				if log:
					log(f"Sync failed: {e}")
				ok = False

			if ok:
				processed.add(device)
			else:
				failed.add(device)
				if log:
					log("Sync failed for this session. Unplug and reconnect the phone to retry.")

		time.sleep(POLL_INTERVAL)
