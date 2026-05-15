# RFID Attendance System

A two-component attendance tracking system that uses RFID cards to log time-in and time-out events for students and employees. The **Hardware Client** runs on a dedicated machine connected to an RFID reader and writes attendance records directly to a shared MySQL database. The **Web Dashboard** provides administrators with a browser-based interface for managing records, monitoring attendance, and exporting reports.

## System Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   Hardware Client       │         │     Web Dashboard         │
│   (Python / Tkinter)    │         │     (PHP / MySQL)         │
│                         │         │                           │
│  RFID Reader ──────────►│──────── │──► MySQL Database         │
│  Attendance UI          │  shared │    Admin Panel            │
│  Attendance Service     │   DB    │    Export (Excel/ZIP)     │
└─────────────────────────┘         └──────────────────────────┘
```

Both components connect to the **same MySQL database** (`rfid_attendance`). The hardware client writes attendance logs; the web dashboard reads and manages all data.

---

## Prerequisites

### Shared Requirements

- **MySQL** 5.7+ or **MariaDB** 10.4+ (shared between both components)

### Hardware Client

- **Python** 3.10+
- A PC/SC-compatible RFID card reader (e.g., ACR122U or any ISO 14443 reader)
- **PC/SC middleware** installed on the host OS:
  - Windows: WinSCard (built-in)
  - Linux: `pcscd` — install via `sudo apt install pcscd`
  - macOS: PCSC Framework (built-in)

### Web Dashboard

- **PHP** 8.1+
- A web server: **Apache** (with `mod_rewrite`) or **Nginx**
- **Composer** (PHP package manager)
- Recommended local stack: [XAMPP](https://www.apachefriends.org/)

---

## Database Setup

Both components share one database. Set it up once before running either component.

Two SQL files are provided in `web/database/`. Always use **`rfid_attendance_fixed.sql`** — it is the authoritative schema. The original `rfid_attendance.sql` is kept for reference only.

### What the fixed schema does

- Creates the `rfid_attendance` database automatically (no manual step needed)
- Drops and recreates all tables in the correct dependency order
- Creates all required tables: `students`, `employees`, `users`, `attendance_logs`, `rfid_scan_logs`, and `rfid_uid_buffer`
- Inserts two sample employee records for testing
- Adds all foreign key constraints cleanly

### phpMyAdmin (recommended for local setups)

1. Open phpMyAdmin and go to the **Import** tab (no need to create or select a database first — the script handles it).
2. Choose `web/database/rfid_attendance_fixed.sql` and click **Go**.

---

## Hardware Client Setup

### 1. Clone / Copy the Project

Place the `hardware/` folder on the machine that has the RFID reader connected.

### 2. Create a Virtual Environment (Recommended)

```bash
cd hardware
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux / git bash
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

**Key packages installed:**

| Package                            | Purpose                          |
| ---------------------------------- | -------------------------------- |
| `mysql-connector-python`           | MySQL database connectivity      |
| `pyscard`                          | PC/SC RFID card reader interface |
| `packaging`, `setuptools`, `wheel` | Build tooling                    |

> **Linux users:** Ensure the `pcscd` service is running before starting the application:
>
> ```bash
> sudo systemctl start pcscd
> ```

### 4. Configure the Database Connection

On first launch, the application will prompt for database credentials via a GUI dialog. The settings are saved to `db_config.json` in the same directory as the script (or executable), so you only need to enter them once.

Alternatively, edit `db_config.json` manually:

```json
{
  "host": "localhost",
  "user": "root",
  "password": "",
  "database": "rfid_attendance",
  "port": 3306
}
```

---

## Web Dashboard Setup

### 1. Place Files on the Web Server

Copy the `web/` folder into your web server's root directory:

- **XAMPP:** `C:/xampp/htdocs/rfid-attendance/`

### 2. Install PHP Dependencies

The `vendor/` directory is included, so Composer packages are already bundled. If you need to reinstall:

```bash
cd web
composer install
```

The main dependency is **PhpSpreadsheet**, used for Excel export.

### 3. Configure the Database Connection

Edit `web/config/connection.php`:

```php
$host = "localhost";
$user = "root";
$pass = "";
$db   = "rfid_attendance";
```

### 4. Create the First Admin User

A utility script is included to bootstrap the first user:

```
http://localhost/rfid-attendance/create-test-user.php
```

> **Important:** Delete or restrict access to `create-test-user.php` after creating your initial account.

---

## Configuration

### Hardware Client — `config.py`

| Constant                          | Default | Description                                         |
| --------------------------------- | ------- | --------------------------------------------------- |
| `TAP_COOLDOWN_SECONDS`            | `3`     | Minimum seconds between two scans of the same card  |
| `ALLOW_MULTIPLE_SESSIONS_PER_DAY` | `False` | Whether a person may time in more than once per day |

These values are set at the top of `config.py` and take effect on next application start.

### Web Dashboard — `config/connection.php`

Standard MySQL connection credentials. Update this file to match your database server.

---

## Running the System

### Hardware Client

```bash
# With virtual environment active
python main.py
```

The application window will open. If no `db_config.json` exists, a setup dialog appears first. Once configured:

- Click **Start** to begin listening for RFID card taps.
- The log panel displays each scan result in real time.
- Click **Stop** to pause scanning without closing the application.
- Use **⚙ DB Config** in the toolbar to update database settings at any time.

### Web Dashboard

Start your web server (Apache/Nginx + MySQL) and navigate to:

```
http://localhost/fcpc-tap-track/web/views/
```

Log in with the admin credentials created during setup.

---

## Features

### Hardware Client

- Reads RFID card UIDs via any PC/SC-compatible reader
- Automatically resolves whether a card belongs to a **student** or **employee**
- Records **Time In** and **Time Out** with configurable tap cooldown
- Displays real-time scan feedback in a desktop UI
- Persists database configuration locally; survives reboots and re-launches
- Logs all scan attempts (success and failure) to `rfid_scan_logs`

### Web Dashboard

- **Attendance Monitoring** — view all time-in/time-out logs with filtering
- **Student Management** — add, edit, deactivate students; assign RFID UIDs; bulk import via Excel
- **Employee Management** — same as above for employees
- **User Management** — create and manage Admin and Superadmin accounts
- **RFID Assignment** — scan a card directly from the web interface to assign its UID to a record; the hardware client writes the scanned UID to the `rfid_uid_buffer` table, which the web dashboard polls via `get_latest_rfid_uid.php` and then marks as used
- **Export** — download filtered attendance, student, or employee data as Excel (.xlsx) files
- **Authentication** — session-based login with CSRF protection and secure password hashing

---

## Project Structure

```

hardware/
  ├── main.py                # Entry point; wires UI and backend together
  ├── ui.py                  # Tkinter desktop interface
  ├── attendance_service.py  # Business logic for processing RFID taps
  ├── rfid_reader.py         # PC/SC card reader interface (threaded)
  ├── database.py            # MySQL database access layer
  ├── models.py              # Table schema definitions
  ├── config.py              # Runtime configuration and persistence
  └── requirements.txt       # Python dependencies


 web/
  ├── config/
  │   ├── connection.php     # Database credentials
  │   └── session.php        # Secure session configuration
  ├── controllers/
  │   ├── attendance.php     # Attendance log API
  │   ├── students.php       # Student CRUD + bulk import
  │   ├── employees.php      # Employee CRUD + bulk import
  │   ├── users.php          # User account management
  │   ├── export.php         # Excel export (PhpSpreadsheet)
  │   ├── login.php          # Authentication
  │   ├── logout.php         # Session teardown
  │   ├── auth_check.php     # Session guard middleware
  │   ├── csrf.php           # CSRF token validation
  │   └── helpers.php        # Shared utility functions
  ├── database/
  │   ├── rfid_attendance.sql          # Original schema dump (reference only)
  │   └── rfid_attendance_fixed.sql    # Use this — self-contained, creates DB automatically
  ├── get_latest_rfid_uid.php          # Polling endpoint for RFID assignment
  ├── create-test-user.php             # First-run user bootstrap utility
  └── vendor/                          # Composer packages (PhpSpreadsheet)
```

---

## Notes & Troubleshooting

**RFID reader not detected**
Ensure the reader is plugged in before starting the application. On Linux, confirm `pcscd` is running (`sudo systemctl status pcscd`). The application will retry detection automatically every 2 seconds.

**Database connection refused**
Verify MySQL is running and that the credentials in `db_config.json` (hardware) or `connection.php` (web) are correct. The default configuration assumes `root` with no password on `localhost:3306`.

**`pyscard` installation fails on Windows**
Install the [PC/SC SDK](https://www.springcard.com/en/pc-sc) or ensure the Windows Smart Card service is enabled. On some systems you may need to install Visual C++ Build Tools before `pip install pyscard` will succeed.

**Session not persisting on the web dashboard**
Confirm `session.use_only_cookies` is supported by your PHP configuration and that the web server has write access to the PHP session directory.

**Excel import not working**
The bulk import feature for students and employees expects a specific column layout. Use the export feature first to download a template, then populate it before re-importing.

**`create-test-user.php` should be removed in production**
This script creates an account without authentication. Remove it or place it behind IP restrictions once your initial admin account is created.
