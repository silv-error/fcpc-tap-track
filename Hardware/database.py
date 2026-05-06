from datetime import datetime
from typing import Dict, List, Optional

import mysql.connector
from mysql.connector import Error

from config import MYSQL_DATABASE, MYSQL_HOST, MYSQL_PASSWORD, MYSQL_PORT, MYSQL_USER


class DatabaseManager:
    def __init__(self):
        self.host = MYSQL_HOST
        self.user = MYSQL_USER
        self.password = MYSQL_PASSWORD
        self.database = MYSQL_DATABASE
        self.port = MYSQL_PORT

    def get_connection(self):
        try:
            return mysql.connector.connect(
                host=self.host,
                user=self.user,
                password=self.password,
                database=self.database,
                port=self.port,
            )
        except Error as error:
            raise ConnectionError(f"Database connection failed: {error}")

    @staticmethod
    def current_datetime() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def current_date() -> str:
        return datetime.now().strftime("%Y-%m-%d")

    @staticmethod
    def current_time() -> str:
        return datetime.now().strftime("%H:%M:%S")

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
    # STUDENTS
    # ============================================================

    def get_all_students(self) -> List[Dict]:
        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT *
                FROM students
                ORDER BY last_name ASC, first_name ASC, middle_name ASC
                """
            )

            return cursor.fetchall()

        except Error as error:
            raise RuntimeError(f"Failed to get students: {error}")

        finally:
            cursor.close()
            connection.close()

    def find_student_by_rfid_uid(self, rfid_uid: str) -> Optional[Dict]:
        normalized_uid = self.normalize_uid(rfid_uid)

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT *
                FROM students
                WHERE UPPER(rfid_uid) = UPPER(%s)
                AND is_active = 1
                LIMIT 1
                """,
                (normalized_uid,),
            )

            return cursor.fetchone()

        except Error as error:
            raise RuntimeError(f"Failed to find student by RFID UID: {error}")

        finally:
            cursor.close()
            connection.close()

    # ============================================================
    # EMPLOYEES
    # ============================================================

    def get_all_employees(self) -> List[Dict]:
        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT *
                FROM employees
                ORDER BY last_name ASC, first_name ASC, middle_name ASC
                """
            )

            return cursor.fetchall()

        except Error as error:
            raise RuntimeError(f"Failed to get employees: {error}")

        finally:
            cursor.close()
            connection.close()

    def find_employee_by_rfid_uid(self, rfid_uid: str) -> Optional[Dict]:
        normalized_uid = self.normalize_uid(rfid_uid)

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT *
                FROM employees
                WHERE UPPER(rfid_uid) = UPPER(%s)
                AND is_active = 1
                LIMIT 1
                """,
                (normalized_uid,),
            )

            return cursor.fetchone()

        except Error as error:
            raise RuntimeError(f"Failed to find employee by RFID UID: {error}")

        finally:
            cursor.close()
            connection.close()

    # ============================================================
    # RFID PERSON LOOKUP
    # ============================================================

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
        """
        Get the active (not yet timed out) attendance log for TODAY ONLY.
        This ensures that if a person didn't time out yesterday,
        a new time_in log is created for today instead of updating yesterday's log.
        """
        today = self.current_date()
        person_type = person_type.strip().capitalize()

        if person_type == "Student":
            column_name = "student_id"
        elif person_type == "Employee":
            column_name = "employee_id"
        else:
            raise ValueError("Invalid person type. Must be Student or Employee.")

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            query = f"""
                SELECT *
                FROM attendance_logs
                WHERE {column_name} = %s
                AND log_date = %s
                AND time_out IS NULL
                ORDER BY id DESC
                LIMIT 1
            """

            cursor.execute(query, (person_id, today))
            return cursor.fetchone()

        except Error as error:
            raise RuntimeError(f"Failed to get active attendance log: {error}")

        finally:
            cursor.close()
            connection.close()

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

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            query = f"""
                SELECT *
                FROM attendance_logs
                WHERE {column_name} = %s
                AND log_date = %s
                ORDER BY id DESC
                LIMIT 1
            """

            cursor.execute(query, (person_id, today))
            return cursor.fetchone()

        except Error as error:
            raise RuntimeError(f"Failed to get today's attendance log: {error}")

        finally:
            cursor.close()
            connection.close()

    def create_time_in_log(
        self,
        person_id: int,
        person_type: str,
    ) -> str:
        now_datetime = self.current_datetime()
        today = self.current_date()
        current_time = self.current_time()

        person_type = person_type.strip().capitalize()

        if person_type == "Student":
            student_id = person_id
            employee_id = None
        elif person_type == "Employee":
            student_id = None
            employee_id = person_id
        else:
            raise ValueError("Invalid person type. Must be Student or Employee.")

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

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
                VALUES (%s, %s, %s, %s, NULL, 'Timed In', %s, %s)
                """,
                (
                    student_id,
                    employee_id,
                    today,
                    current_time,
                    now_datetime,
                    now_datetime,
                ),
            )

            connection.commit()
            return current_time

        except Error as error:
            connection.rollback()
            raise RuntimeError(f"Failed to create time-in log: {error}")

        finally:
            cursor.close()
            connection.close()

    def update_time_out_log(self, attendance_log_id: int) -> str:
        now_datetime = self.current_datetime()
        current_time = self.current_time()

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                UPDATE attendance_logs
                SET time_out = %s,
                    status = 'Timed Out',
                    updated_at = %s
                WHERE id = %s
                """,
                (current_time, now_datetime, attendance_log_id),
            )

            connection.commit()
            return current_time

        except Error as error:
            connection.rollback()
            raise RuntimeError(f"Failed to update time-out log: {error}")

        finally:
            cursor.close()
            connection.close()

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
        normalized_scan_result = scan_result.strip().upper()

        if normalized_scan_result not in {"SUCCESS", "FAILED"}:
            raise ValueError("Invalid scan result. Must be SUCCESS or FAILED.")

        if person_type:
            person_type = person_type.strip().capitalize()

            if person_type not in {"Student", "Employee"}:
                raise ValueError("Invalid person type. Must be Student or Employee.")

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

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
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    normalized_uid,
                    normalized_scan_result,
                    person_type,
                    action,
                    message,
                    now,
                ),
            )

            connection.commit()

        except Error as error:
            connection.rollback()
            raise RuntimeError(f"Failed to log RFID scan: {error}")

        finally:
            cursor.close()
            connection.close()

    # ============================================================
    # RECENT LOGS
    # ============================================================

    def get_recent_attendance_logs(self, limit: int = 20) -> List[Dict]:
        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

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
                    students.program,
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
                    NULL AS program,
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
                LIMIT %s
                """,
                (limit,),
            )

            rows = cursor.fetchall()

            for row in rows:
                row["full_name"] = self.format_full_name(row)

            return rows

        except Error as error:
            raise RuntimeError(f"Failed to get recent attendance logs: {error}")

        finally:
            cursor.close()
            connection.close()

    def get_recent_scan_logs(self, limit: int = 20) -> List[Dict]:
        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT *
                FROM rfid_scan_logs
                ORDER BY id DESC
                LIMIT %s
                """,
                (limit,),
            )

            return cursor.fetchall()

        except Error as error:
            raise RuntimeError(f"Failed to get recent scan logs: {error}")

        finally:
            cursor.close()
            connection.close()

    def save_rfid_uid_to_buffer(self, rfid_uid: str):
        normalized_uid = self.normalize_uid(rfid_uid)
        now = self.current_datetime()

        connection = self.get_connection()

        try:
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                INSERT INTO rfid_uid_buffer (
                    rfid_uid,
                    is_used,
                    created_at
                )
                VALUES (%s, 0, %s)
                """,
                (
                    normalized_uid,
                    now,
                ),
            )

            connection.commit()

        except Error as error:
            connection.rollback()
            raise RuntimeError(f"Failed to save RFID UID to buffer: {error}")

        finally:
            cursor.close()
            connection.close()