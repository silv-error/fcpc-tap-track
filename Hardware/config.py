from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

DATABASE_PATH = BASE_DIR / "rfid_attendance.db"

TAP_COOLDOWN_SECONDS = 3

ALLOW_MULTIPLE_SESSIONS_PER_DAY = False