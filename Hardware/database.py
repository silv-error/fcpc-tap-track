import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from config import DATABASE_PATH
from models import (
    USER_TABLE_SCHEMA,
    STUDENT_TABLE_SCHEMA,
    EMPLOYEE_TABLE_SCHEMA,
    ATTENDANCE_LOG_TABLE_SCHEMA,
    RFID_SCAN_LOG_TABLE_SCHEMA,
)


class DatabaseManager:
    def __init__(self, database_path: Path = DATABASE_PATH):
        self.database_path = database_path
        self.initialize_database()

    def get_connection(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize_database(self):
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(USER_TABLE_SCHEMA)
            cursor.execute(STUDENT_TABLE_SCHEMA)
            cursor.execute(EMPLOYEE_TABLE_SCHEMA)
            cursor.execute(ATTENDANCE_LOG_TABLE_SCHEMA)
            cursor.execute(RFID_SCAN_LOG_TABLE_SCHEMA)

            connection.commit()

    @staticmethod
    def current_datetime() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def current_date() -> str:
        return datetime.now().strftime("%Y-%m-%d")

    @staticmethod
    def normalize_uid(rfid_uid: str) -> str:
        return str(rfid_uid).strip().replace(" ", "").upper()

    @staticmethod
    def format_full_name(person: Optional[Dict]) -> str:
        if not person:
            return "Unknown"

        last_name = person.get("last_name") or ""
        first_name = person.get("first_name") or ""
        middle_name = person.get("middle_name") or ""
        suffix = person.get("suffix") or ""

        full_name = f"{last_name}, {first_name}".strip(", ")

        if middle_name:
            full_name += f" {middle_name}"

        if suffix:
            full_name += f" {suffix}"

        return full_name.strip() or "Unknown"

    # ============================================================
    # ADMIN WEBSITE USERS
    # ============================================================

    def add_admin_user(
        self,
        username: str,
        last_name: str,
        first_name: str,
        middle_name: str = "",
        suffix: str = "",
        email: str = "",
        password_hash: str = "",
        role: str = "Admin",
        is_active: int = 1,
    ):
        now = self.current_datetime()

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO users (
                    username,
                    last_name,
                    first_name,
                    middle_name,
                    suffix,
                    email,
                    password_hash,
                    role,
                    is_active,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username.strip(),
                    last_name.strip(),
                    first_name.strip(),
                    middle_name.strip() if middle_name else None,
                    suffix.strip() if suffix else None,
                    email.strip().lower(),
                    password_hash,
                    role.strip().capitalize(),
                    is_active,
                    now,
                    now,
                ),
            )

            connection.commit()

    def find_admin_by_username(self, username: str) -> Optional[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE username = ?
                LIMIT 1
                """,
                (username.strip(),),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def find_admin_by_email(self, email: str) -> Optional[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE LOWER(email) = LOWER(?)
                LIMIT 1
                """,
                (email.strip(),),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    # ============================================================
    # STUDENTS
    # ============================================================

    def add_student(
        self,
        student_number: str,
        last_name: str,
        first_name: str,
        middle_name: str = "",
        suffix: str = "",
        course: str = "",
        year_level: str = "",
        department: str = "",
        rfid_uid: str = "",
        is_active: int = 1,
    ):
        now = self.current_datetime()
        normalized_uid = self.normalize_uid(rfid_uid)

        self.validate_rfid_uid_is_unique(normalized_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO students (
                    student_number,
                    last_name,
                    first_name,
                    middle_name,
                    suffix,
                    course,
                    year_level,
                    department,
                    rfid_uid,
                    is_active,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    student_number.strip(),
                    last_name.strip(),
                    first_name.strip(),
                    middle_name.strip() if middle_name else None,
                    suffix.strip() if suffix else None,
                    course.strip() if course else None,
                    year_level.strip() if year_level else None,
                    department.strip() if department else None,
                    normalized_uid,
                    is_active,
                    now,
                    now,
                ),
            )

            connection.commit()

    def find_student_by_rfid_uid(self, rfid_uid: str) -> Optional[Dict]:
        normalized_uid = self.normalize_uid(rfid_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM students
                WHERE UPPER(rfid_uid) = UPPER(?)
                LIMIT 1
                """,
                (normalized_uid,),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def get_all_students(self) -> List[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM students
                ORDER BY last_name ASC, first_name ASC, middle_name ASC
                """
            )

            return [dict(row) for row in cursor.fetchall()]

    # ============================================================
    # EMPLOYEES
    # ============================================================

    def add_employee(
        self,
        employee_number: str,
        last_name: str,
        first_name: str,
        middle_name: str = "",
        suffix: str = "",
        department: str = "",
        position: str = "",
        rfid_uid: str = "",
        is_active: int = 1,
    ):
        now = self.current_datetime()
        normalized_uid = self.normalize_uid(rfid_uid)

        self.validate_rfid_uid_is_unique(normalized_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO employees (
                    employee_number,
                    last_name,
                    first_name,
                    middle_name,
                    suffix,
                    department,
                    position,
                    rfid_uid,
                    is_active,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    employee_number.strip(),
                    last_name.strip(),
                    first_name.strip(),
                    middle_name.strip() if middle_name else None,
                    suffix.strip() if suffix else None,
                    department.strip() if department else None,
                    position.strip() if position else None,
                    normalized_uid,
                    is_active,
                    now,
                    now,
                ),
            )

            connection.commit()

    def find_employee_by_rfid_uid(self, rfid_uid: str) -> Optional[Dict]:
        normalized_uid = self.normalize_uid(rfid_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM employees
                WHERE UPPER(rfid_uid) = UPPER(?)
                LIMIT 1
                """,
                (normalized_uid,),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def get_all_employees(self) -> List[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM employees
                ORDER BY last_name ASC, first_name ASC, middle_name ASC
                """
            )

            return [dict(row) for row in cursor.fetchall()]

    # ============================================================
    # RFID PERSON LOOKUP
    # ============================================================

    def validate_rfid_uid_is_unique(self, rfid_uid: str):
        normalized_uid = self.normalize_uid(rfid_uid)

        existing_student = self.find_student_by_rfid_uid(normalized_uid)
        if existing_student:
            full_name = self.format_full_name(existing_student)
            raise ValueError(f"RFID UID already assigned to student: {full_name}")

        existing_employee = self.find_employee_by_rfid_uid(normalized_uid)
        if existing_employee:
            full_name = self.format_full_name(existing_employee)
            raise ValueError(f"RFID UID already assigned to employee: {full_name}")

    def find_person_by_rfid_uid(self, rfid_uid: str) -> Optional[Dict]:
        normalized_uid = self.normalize_uid(rfid_uid)

        student = self.find_student_by_rfid_uid(normalized_uid)
        if student:
            return {
                "person_type": "Student",
                "person": student,
            }

        employee = self.find_employee_by_rfid_uid(normalized_uid)
        if employee:
            return {
                "person_type": "Employee",
                "person": employee,
            }

        return None

    # ============================================================
    # ATTENDANCE LOGS
    # ============================================================

    def get_active_attendance_log(
        self,
        person_id: int,
        person_type: str,
    ) -> Optional[Dict]:
        person_type = person_type.strip().capitalize()

        if person_type == "Student":
            column_name = "student_id"
        elif person_type == "Employee":
            column_name = "employee_id"
        else:
            raise ValueError("Invalid person type. Must be Student or Employee.")

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                f"""
                SELECT *
                FROM attendance_logs
                WHERE {column_name} = ?
                AND time_out IS NULL
                ORDER BY id DESC
                LIMIT 1
                """,
                (person_id,),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def get_today_attendance_log(
        self,
        person_id: int,
        person_type: str,
    ) -> Optional[Dict]:
        today = self.current_date()
        person_type = person_type.strip().capitalize()

        if person_type == "Student":
            column_name = "student_id"
        elif person_type == "Employee":
            column_name = "employee_id"
        else:
            raise ValueError("Invalid person type. Must be Student or Employee.")

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                f"""
                SELECT *
                FROM attendance_logs
                WHERE {column_name} = ?
                AND log_date = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (person_id, today),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def create_time_in_log(
        self,
        person_id: int,
        person_type: str,
    ) -> str:
        now = self.current_datetime()
        today = self.current_date()
        person_type = person_type.strip().capitalize()

        if person_type == "Student":
            student_id = person_id
            employee_id = None
        elif person_type == "Employee":
            student_id = None
            employee_id = person_id
        else:
            raise ValueError("Invalid person type. Must be Student or Employee.")

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO attendance_logs (
                    student_id,
                    employee_id,
                    log_date,
                    time_in,
                    time_out,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, NULL, 'Timed In', ?, ?)
                """,
                (
                    student_id,
                    employee_id,
                    today,
                    now,
                    now,
                    now,
                ),
            )

            connection.commit()

        return now

    def update_time_out_log(self, attendance_log_id: int) -> str:
        now = self.current_datetime()

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                UPDATE attendance_logs
                SET time_out = ?,
                    status = 'Timed Out',
                    updated_at = ?
                WHERE id = ?
                """,
                (now, now, attendance_log_id),
            )

            connection.commit()

        return now

    # ============================================================
    # RFID SCAN LOGS
    # ============================================================

    def log_rfid_scan(
        self,
        rfid_uid: str,
        scan_result: str,
        action: Optional[str],
        message: str,
        person_type: Optional[str] = None,
    ):
        now = self.current_datetime()
        normalized_uid = self.normalize_uid(rfid_uid)

        if person_type:
            person_type = person_type.strip().capitalize()

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO rfid_scan_logs (
                    rfid_uid,
                    scan_result,
                    user_type,
                    action,
                    message,
                    scanned_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_uid,
                    scan_result,
                    person_type,
                    action,
                    message,
                    now,
                ),
            )

            connection.commit()

    # ============================================================
    # RECENT LOGS
    # ============================================================

    def get_recent_attendance_logs(self, limit: int = 20) -> List[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT
                    attendance_logs.id,
                    'Student' AS user_type,
                    students.student_number AS user_number,
                    students.last_name,
                    students.first_name,
                    students.middle_name,
                    students.suffix,
                    students.course,
                    students.year_level,
                    students.department,
                    NULL AS position,
                    students.rfid_uid,
                    attendance_logs.log_date,
                    attendance_logs.time_in,
                    attendance_logs.time_out,
                    attendance_logs.status
                FROM attendance_logs
                INNER JOIN students ON attendance_logs.student_id = students.id

                UNION ALL

                SELECT
                    attendance_logs.id,
                    'Employee' AS user_type,
                    employees.employee_number AS user_number,
                    employees.last_name,
                    employees.first_name,
                    employees.middle_name,
                    employees.suffix,
                    NULL AS course,
                    NULL AS year_level,
                    employees.department,
                    employees.position,
                    employees.rfid_uid,
                    attendance_logs.log_date,
                    attendance_logs.time_in,
                    attendance_logs.time_out,
                    attendance_logs.status
                FROM attendance_logs
                INNER JOIN employees ON attendance_logs.employee_id = employees.id

                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )

            rows = [dict(row) for row in cursor.fetchall()]

            for row in rows:
                row["full_name"] = self.format_full_name(row)

            return rows

    def get_recent_scan_logs(self, limit: int = 20) -> List[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM rfid_scan_logs
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )

            return [dict(row) for row in cursor.fetchall()]

    # ============================================================
    # DATABASE RESET FOR DEVELOPMENT
    # ============================================================

    def reset_database(self):
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute("PRAGMA foreign_keys = OFF")

            cursor.execute("DROP TABLE IF EXISTS attendance_logs")
            cursor.execute("DROP TABLE IF EXISTS rfid_scan_logs")
            cursor.execute("DROP TABLE IF EXISTS students")
            cursor.execute("DROP TABLE IF EXISTS employees")
            cursor.execute("DROP TABLE IF EXISTS users")

            cursor.execute("PRAGMA foreign_keys = ON")

            cursor.execute(USER_TABLE_SCHEMA)
            cursor.execute(STUDENT_TABLE_SCHEMA)
            cursor.execute(EMPLOYEE_TABLE_SCHEMA)
            cursor.execute(ATTENDANCE_LOG_TABLE_SCHEMA)
            cursor.execute(RFID_SCAN_LOG_TABLE_SCHEMA)

            connection.commit()