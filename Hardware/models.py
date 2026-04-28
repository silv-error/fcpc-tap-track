USER_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_number TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK(user_type IN ('Student', 'Employee')),
    department TEXT,
    rfid_uid TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


ATTENDANCE_LOG_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    time_in TEXT NOT NULL,
    time_out TEXT,
    status TEXT NOT NULL CHECK(status IN ('Timed In', 'Timed Out')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
"""


RFID_SCAN_LOG_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS rfid_scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfid_uid TEXT NOT NULL,
    scan_result TEXT NOT NULL CHECK(scan_result IN ('SUCCESS', 'FAILED')),
    action TEXT,
    message TEXT NOT NULL,
    scanned_at TEXT NOT NULL
)
"""