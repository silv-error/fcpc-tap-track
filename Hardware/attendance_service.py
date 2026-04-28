from typing import Dict, Optional

from config import ALLOW_MULTIPLE_SESSIONS_PER_DAY
from database import DatabaseManager


class AttendanceService:
    def __init__(self, database_manager: DatabaseManager):
        self.database_manager = database_manager

    @staticmethod
    def normalize_uid(rfid_uid: str) -> str:
        return str(rfid_uid).strip().replace(" ", "").upper()

    def process_rfid_tap(self, rfid_uid: str) -> Dict:
        uid = self.normalize_uid(rfid_uid)

        if not uid:
            message = "Invalid RFID UID."
            self.database_manager.log_rfid_scan(
                rfid_uid="UNKNOWN",
                scan_result="FAILED",
                action=None,
                message=message,
            )

            return self.build_response(False, message, None, None, None)

        user = self.database_manager.find_user_by_rfid_uid(uid)

        if not user:
            message = f"RFID UID is not registered: {uid}"
            self.database_manager.log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action=None,
                message=message,
            )

            return self.build_response(False, message, None, None, None)

        if int(user["is_active"]) != 1:
            message = f"User is inactive: {user['full_name']}"
            self.database_manager.log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action=None,
                message=message,
            )

            return self.build_response(False, message, None, user, None)

        if not ALLOW_MULTIPLE_SESSIONS_PER_DAY:
            today_log = self.database_manager.get_today_attendance_log(user["id"])

            if today_log and today_log["time_in"] and today_log["time_out"]:
                message = f"Attendance already completed today for {user['full_name']}."
                self.database_manager.log_rfid_scan(
                    rfid_uid=uid,
                    scan_result="FAILED",
                    action="COMPLETED",
                    message=message,
                )

                return self.build_response(False, message, "COMPLETED", user, None)

        active_log = self.database_manager.get_active_attendance_log(user["id"])

        if active_log:
            time_out = self.database_manager.update_time_out_log(active_log["id"])
            message = f"Time Out recorded for {user['full_name']}."

            self.database_manager.log_rfid_scan(
                rfid_uid=uid,
                scan_result="SUCCESS",
                action="TIME_OUT",
                message=message,
            )

            return self.build_response(True, message, "TIME_OUT", user, time_out)

        time_in = self.database_manager.create_time_in_log(user["id"])
        message = f"Time In recorded for {user['full_name']}."

        self.database_manager.log_rfid_scan(
            rfid_uid=uid,
            scan_result="SUCCESS",
            action="TIME_IN",
            message=message,
        )

        return self.build_response(True, message, "TIME_IN", user, time_in)

    @staticmethod
    def build_response(
        success: bool,
        message: str,
        action: Optional[str],
        user: Optional[Dict],
        recorded_time: Optional[str],
    ) -> Dict:
        return {
            "success": success,
            "message": message,
            "action": action,
            "user": user,
            "time": recorded_time,
        }