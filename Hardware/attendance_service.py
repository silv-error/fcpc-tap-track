from typing import Dict, Optional

from database import DatabaseManager


class AttendanceService:
    def __init__(self, database_manager: DatabaseManager):
        self.database_manager = database_manager

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

    def process_rfid_tap(self, rfid_uid: str) -> Dict:
        uid = self.normalize_uid(rfid_uid)

        if not uid:
            message = "Invalid RFID UID."

            self.database_manager.log_rfid_scan(
                rfid_uid="UNKNOWN",
                scan_result="FAILED",
                action=None,
                message=message,
                person_type=None,
            )

            return self.build_response(
                success=False,
                message=message,
                action=None,
                person=None,
                person_type=None,
                recorded_time=None,
            )

        person_data = self.database_manager.find_person_by_rfid_uid(uid)

        if not person_data:
            message = f"RFID UID is not registered: {uid}"

            self.database_manager.log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action=None,
                message=message,
                person_type=None,
            )

            return self.build_response(
                success=False,
                message=message,
                action=None,
                person=None,
                person_type=None,
                recorded_time=None,
            )

        person_type = person_data["person_type"]
        person = person_data["person"]
        full_name = self.format_full_name(person)

        if int(person["is_active"]) != 1:
            message = f"{person_type} is inactive: {full_name}"

            self.database_manager.log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action=None,
                message=message,
                person_type=person_type,
            )

            return self.build_response(
                success=False,
                message=message,
                action=None,
                person=person,
                person_type=person_type,
                recorded_time=None,
            )

        active_log = self.database_manager.get_active_attendance_log(
            person_id=person["id"],
            person_type=person_type,
        )

        if active_log:
            time_out = self.database_manager.update_time_out_log(
                attendance_log_id=active_log["id"],
            )

            action = "TIME_OUT"
            message = f"Time Out recorded for {full_name}."

            self.database_manager.log_rfid_scan(
                rfid_uid=uid,
                scan_result="SUCCESS",
                action=action,
                message=message,
                person_type=person_type,
            )

            return self.build_response(
                success=True,
                message=message,
                action=action,
                person=person,
                person_type=person_type,
                recorded_time=time_out,
            )

        time_in = self.database_manager.create_time_in_log(
            person_id=person["id"],
            person_type=person_type,
        )

        action = "TIME_IN"
        message = f"Time In recorded for {full_name}."

        self.database_manager.log_rfid_scan(
            rfid_uid=uid,
            scan_result="SUCCESS",
            action=action,
            message=message,
            person_type=person_type,
        )

        return self.build_response(
            success=True,
            message=message,
            action=action,
            person=person,
            person_type=person_type,
            recorded_time=time_in,
        )

    @staticmethod
    def build_response(
        success: bool,
        message: str,
        action: Optional[str],
        person: Optional[Dict],
        person_type: Optional[str],
        recorded_time: Optional[str],
    ) -> Dict:
        return {
            "success": success,
            "message": message,
            "action": action,
            "person": person,
            "person_type": person_type,
            "time": recorded_time,

            # Compatibility keys for older backend/main.py code.
            "user": person,
            "user_type": person_type,
        }