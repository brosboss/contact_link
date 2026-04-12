# Copyright (c) 2026, brossboss and contributors
# For license information, please see license.txt

import os
import subprocess

import frappe
from frappe import _


def _contactlink_repo_root() -> str:
	"""Filesystem root of the contactlink app (parent of the Python package; holds `.git`)."""
	package = frappe.get_app_path("contactlink")
	return os.path.abspath(os.path.join(package, os.pardir))


def _assert_can_update_repository() -> None:
	if frappe.session.user == "Administrator":
		return
	roles = frappe.get_roles()
	if "System Manager" in roles or "main_admin" in roles:
		return
	frappe.throw(_("You do not have permission to update the repository."), frappe.PermissionError)


def _run_git(args: list[str], cwd: str) -> tuple[int, str, str]:
	try:
		p = subprocess.run(
			["git", *args],
			cwd=cwd,
			capture_output=True,
			text=True,
			timeout=300,
		)
		return p.returncode, p.stdout or "", p.stderr or ""
	except subprocess.TimeoutExpired:
		return -1, "", "git: command timed out"
	except FileNotFoundError:
		return -1, "", "git: executable not found on server"


@frappe.whitelist()
def get_contactlink_repository_status():
	"""Return current branch, short SHA, and status line for the Contactlink app git clone."""
	_assert_can_update_repository()
	root = _contactlink_repo_root()
	if not os.path.isdir(os.path.join(root, ".git")):
		return {
			"ok": False,
			"path": root,
			"error": _("This bench app directory is not a git clone: {0}").format(root),
		}
	code, out, _ = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], root)
	branch = (out or "").strip() if code == 0 else ""
	code2, out2, _ = _run_git(["rev-parse", "--short", "HEAD"], root)
	short_sha = (out2 or "").strip() if code2 == 0 else ""
	code3, out3, _ = _run_git(["status", "-sb"], root)
	lines = (out3 or "").strip().split("\n")
	status_line = lines[0] if lines and code3 == 0 else ""
	return {
		"ok": True,
		"path": root,
		"branch": branch,
		"short_sha": short_sha,
		"status_line": status_line,
	}


@frappe.whitelist()
def pull_contactlink_from_main():
	"""Run `git pull origin main` in the Contactlink app repository (server-side)."""
	_assert_can_update_repository()
	root = _contactlink_repo_root()
	if not os.path.isdir(os.path.join(root, ".git")):
		frappe.throw(_("App directory is not a git clone: {0}").format(root))
	code, out, err = _run_git(["pull", "origin", "main"], root)
	combined = "\n".join(s for s in (out.strip(), err.strip()) if s)
	st = get_contactlink_repository_status()
	return {
		"ok": code == 0,
		"exit_code": code,
		"output": combined or _("(no output)"),
		"status": st,
	}
