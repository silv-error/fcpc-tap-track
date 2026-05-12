"""
config.py — Runtime database configuration with persistence.

When packaged as a .exe the working directory is used for db_config.json so
the file sits next to the executable and survives re-launches.  No manual
editing of source files is ever needed again.
"""

import json
import os
import sys

# ── locate the config file next to the .exe (or script during development) ──

def _config_dir() -> str:
    """Return the directory that contains the running .exe / script."""
    if getattr(sys, "frozen", False):          # PyInstaller / cx_Freeze
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


CONFIG_FILE = os.path.join(_config_dir(), "db_config.json")

# ── hard-coded fallbacks (used only when the JSON file is absent) ────────────

_DEFAULTS = {
    "host":     "localhost",
    "user":     "root",
    "password": "",
    "database": "rfid_attendance",
    "port":     3306,
}

# ── public API ───────────────────────────────────────────────────────────────

def load() -> dict:
    """Return the saved DB config, or the defaults if no file exists yet."""
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            # Fill in any missing keys with defaults (forward-compat)
            for key, val in _DEFAULTS.items():
                data.setdefault(key, val)
            data["port"] = int(data["port"])
            return data
        except Exception:
            pass          # corrupt file → fall through to defaults
    return dict(_DEFAULTS)


def save(host: str, user: str, password: str, database: str, port: int) -> None:
    """Persist the DB config to disk."""
    data = {
        "host":     host.strip(),
        "user":     user.strip(),
        "password": password,
        "database": database.strip(),
        "port":     int(port),
    }
    with open(CONFIG_FILE, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def is_configured() -> bool:
    """Return True if a config file already exists on disk."""
    return os.path.isfile(CONFIG_FILE)


# ── module-level constants (kept for any legacy import that reads them) ──────
# These are populated from the persisted / default values at import time so
# that other modules can still do  `from config import MYSQL_HOST …`

_cfg = load()

MYSQL_HOST     = _cfg["host"]
MYSQL_USER     = _cfg["user"]
MYSQL_PASSWORD = _cfg["password"]
MYSQL_DATABASE = _cfg["database"]
MYSQL_PORT     = _cfg["port"]

TAP_COOLDOWN_SECONDS          = 3
ALLOW_MULTIPLE_SESSIONS_PER_DAY = False