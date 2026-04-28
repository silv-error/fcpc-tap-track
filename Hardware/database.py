import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

from config import DATABASE_PATH
from models import (
    USER_TABLE_SCHEMA,
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
        return connection

    def initialize_database(self):
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.execute(USER_TABLE_SCHEMA)
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

    def add_user(
        self,
        user_number: str,
        full_name: str,
        user_type: str,
        department: str,
        rfid_uid: str,
        is_active: int = 1,
    ):
        now = self.current_datetime()
        normalized_uid = self.normalize_uid(rfid_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO users (
                    user_number,
                    full_name,
                    user_type,
                    department,
                    rfid_uid,
                    is_active,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_number.strip(),
                    full_name.strip(),
                    user_type.strip(),
                    department.strip(),
                    normalized_uid,
                    is_active,
                    now,
                    now,
                ),
            )

            connection.commit()

    def find_user_by_rfid_uid(self, rfid_uid: str) -> Optional[Dict]:
        normalized_uid = self.normalize_uid(rfid_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE UPPER(rfid_uid) = UPPER(?)
                LIMIT 1
                """,
                (normalized_uid,),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def get_active_attendance_log(self, user_id: int) -> Optional[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM attendance_logs
                WHERE user_id = ?
                AND time_out IS NULL
                ORDER BY id DESC
                LIMIT 1
                """,
                (user_id,),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def get_today_attendance_log(self, user_id: int) -> Optional[Dict]:
        today = self.current_date()

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT *
                FROM attendance_logs
                WHERE user_id = ?
                AND log_date = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (user_id, today),
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def create_time_in_log(self, user_id: int) -> str:
        now = self.current_datetime()
        today = self.current_date()

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO attendance_logs (
                    user_id,
                    log_date,
                    time_in,
                    time_out,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, NULL, 'Timed In', ?, ?)
                """,
                (user_id, today, now, now, now),
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

    def log_rfid_scan(
        self,
        rfid_uid: str,
        scan_result: str,
        action: Optional[str],
        message: str,
    ):
        now = self.current_datetime()
        normalized_uid = self.normalize_uid(rfid_uid)

        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO rfid_scan_logs (
                    rfid_uid,
                    scan_result,
                    action,
                    message,
                    scanned_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    normalized_uid,
                    scan_result,
                    action,
                    message,
                    now,
                ),
            )

            connection.commit()

    def get_recent_attendance_logs(self, limit: int = 20) -> List[Dict]:
        with self.get_connection() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                SELECT
                    attendance_logs.id,
                    users.user_number,
                    users.full_name,
                    users.user_type,
                    users.department,
                    users.rfid_uid,
                    attendance_logs.log_date,
                    attendance_logs.time_in,
                    attendance_logs.time_out,
                    attendance_logs.status
                FROM attendance_logs
                INNER JOIN users ON attendance_logs.user_id = users.id
                ORDER BY attendance_logs.id DESC
                LIMIT ?
                """,
                (limit,),
            )

            return [dict(row) for row in cursor.fetchall()]

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