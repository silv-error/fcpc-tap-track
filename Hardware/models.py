USER_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,

    last_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    suffix TEXT,

    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Admin' CHECK(role IN ('Admin', 'Superadmin')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


STUDENT_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_number TEXT NOT NULL UNIQUE,

    last_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    suffix TEXT,

    course TEXT,
    year_level TEXT,
    department TEXT,
    rfid_uid TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


EMPLOYEE_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number TEXT NOT NULL UNIQUE,

    last_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    suffix TEXT,

    department TEXT,
    position TEXT,
    rfid_uid TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


ATTENDANCE_LOG_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    student_id INTEGER,
    employee_id INTEGER,

    log_date TEXT NOT NULL,
    time_in TEXT NOT NULL,
    time_out TEXT,
    status TEXT NOT NULL CHECK(status IN ('Timed In', 'Timed Out')),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id),

    CHECK (
        (student_id IS NOT NULL AND employee_id IS NULL)
        OR
        (student_id IS NULL AND employee_id IS NOT NULL)
    )
)
"""


RFID_SCAN_LOG_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS rfid_scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    rfid_uid TEXT NOT NULL,
    scan_result TEXT NOT NULL CHECK(scan_result IN ('SUCCESS', 'FAILED')),
    user_type TEXT CHECK(user_type IN ('Student', 'Employee')),
    action TEXT,
    message TEXT NOT NULL,

    scanned_at TEXT NOT NULL
)
"""