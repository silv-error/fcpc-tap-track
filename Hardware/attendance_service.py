import logging
from typing import Dict, Optional

from database import DatabaseManager


logger = logging.getLogger(__name__)


class AttendanceService:
    def __init__(self, database_manager: DatabaseManager):
        self.database_manager = database_manager

    @staticmethod
    def normalize_uid(rfid_uid: str) -> str:
        return (
            str(rfid_uid)
            .strip()
            .replace(" ", "")
            .replace("-", "")
            .replace(":", "")
            .upper()
        )

    @staticmethod
    def format_full_name(person: Optional[Dict]) -> str:
        if not person:
            return "Unregistered"

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
        raw_uid = rfid_uid
        uid = self.normalize_uid(rfid_uid)

        logger.info("=" * 70)
        logger.info("RFID TAP PROCESS STARTED")
        logger.info("Raw UID received: %s", raw_uid)
        logger.info("Normalized UID: %s", uid)

        if not uid:
            message = "Invalid RFID UID."

            logger.warning("RFID tap failed: UID is empty or invalid.")
            logger.debug("Raw UID value that caused invalid UID: %r", raw_uid)

            self.safe_log_rfid_scan(
                rfid_uid="UNKNOWN",
                scan_result="FAILED",
                action=None,
                message=message,
                person_type=None,
            )

            response = self.build_response(
                success=False,
                message=message,
                action=None,
                person=None,
                person_type=None,
                recorded_time=None,
            )

            logger.info("RFID TAP PROCESS ENDED: FAILED - INVALID UID")
            logger.info("=" * 70)

            return response

        try:
            logger.info("Saving UID to RFID UID buffer...")
            buffer_result = self.database_manager.save_rfid_uid_to_buffer(uid)

            logger.info(
                "RFID UID buffer saved: rfid_uid=%s, is_used=%s, used_by_student_id=%s",
                buffer_result.get("rfid_uid"),
                buffer_result.get("is_used"),
                buffer_result.get("used_by_student_id"),
            )

        except AttributeError as error:
            logger.error(
                "DatabaseManager is missing save_rfid_uid_to_buffer(). "
                "Make sure the method is inside the DatabaseManager class.",
                exc_info=True,
            )

        except Exception as error:
            logger.error(
                "Failed to save UID to RFID UID buffer. UID=%s, Error=%s",
                uid,
                error,
                exc_info=True,
            )

        logger.info("Searching registered person by RFID UID: %s", uid)

        try:
            person_data = self.database_manager.find_person_by_rfid_uid(uid)

        except Exception as error:
            message = f"Database lookup failed for RFID UID: {uid}"

            logger.error(
                "RFID person lookup failed. UID=%s, Error=%s",
                uid,
                error,
                exc_info=True,
            )

            self.safe_log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action=None,
                message=message,
                person_type=None,
            )

            response = self.build_response(
                success=False,
                message=message,
                action=None,
                person=None,
                person_type=None,
                recorded_time=None,
            )

            logger.info("RFID TAP PROCESS ENDED: FAILED - DATABASE LOOKUP ERROR")
            logger.info("=" * 70)

            return response

        person = None
        person_type = None
        full_name = f"Unregistered ({uid})"

        if person_data:
            person_type = person_data["person_type"]
            person = person_data["person"]
            full_name = self.format_full_name(person)

            logger.info("Registered person found.")
            logger.info("Person type: %s", person_type)
            logger.info("Person ID: %s", person.get("id"))
            logger.info("Full name: %s", full_name)
            logger.info("Is active: %s", person.get("is_active"))

            if int(person.get("is_active", 0)) != 1:
                message = f"{person_type} is inactive: {full_name}"

                logger.warning(
                    "RFID tap rejected because person is inactive. "
                    "UID=%s, person_type=%s, person_id=%s, full_name=%s",
                    uid,
                    person_type,
                    person.get("id"),
                    full_name,
                )

                self.safe_log_rfid_scan(
                    rfid_uid=uid,
                    scan_result="FAILED",
                    action=None,
                    message=message,
                    person_type=person_type,
                )

                response = self.build_response(
                    success=False,
                    message=message,
                    action=None,
                    person=person,
                    person_type=person_type,
                    recorded_time=None,
                )

                logger.info("RFID TAP PROCESS ENDED: FAILED - INACTIVE PERSON")
                logger.info("=" * 70)

                return response
        else:
            logger.info("RFID UID is not registered: %s", uid)

        logger.info(
            "Checking active attendance log. person_id=%s, person_type=%s, uid=%s",
            person.get("id") if person else None,
            person_type or "Unregistered",
            uid,
        )

        try:
            active_log = self.database_manager.get_active_attendance_log(
                person_id=person["id"] if person else None,
                person_type=person_type,
                rfid_uid=None if person else uid,
            )

        except Exception as error:
            message = f"Failed to check active attendance log for {full_name}."

            logger.error(
                "Failed to get active attendance log. UID=%s, person_type=%s, "
                "person_id=%s, Error=%s",
                uid,
                person_type or "Unregistered",
                person.get("id") if person else None,
                error,
                exc_info=True,
            )

            self.safe_log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action=None,
                message=message,
                person_type=person_type,
            )

            response = self.build_response(
                success=False,
                message=message,
                action=None,
                person=person,
                person_type=person_type,
                recorded_time=None,
            )

            logger.info("RFID TAP PROCESS ENDED: FAILED - ACTIVE LOG CHECK ERROR")
            logger.info("=" * 70)

            return response

        if active_log:
            person_id = person.get("id") if person else None
            logger.info(
                "Active attendance log found. attendance_log_id=%s. "
                "Proceeding with TIME_OUT.",
                active_log.get("id"),
            )

            try:
                time_out = self.database_manager.update_time_out_log(
                    attendance_log_id=active_log["id"],
                )

            except Exception as error:
                message = f"Failed to record Time Out for {full_name}."

                logger.error(
                    "Failed to update time-out log. UID=%s, person_type=%s, "
                    "person_id=%s, attendance_log_id=%s, Error=%s",
                    uid,
                    person_type,
                    person_id,
                    active_log.get("id"),
                    error,
                    exc_info=True,
                )

                self.safe_log_rfid_scan(
                    rfid_uid=uid,
                    scan_result="FAILED",
                    action="TIME_OUT",
                    message=message,
                    person_type=person_type,
                )

                response = self.build_response(
                    success=False,
                    message=message,
                    action="TIME_OUT",
                    person=person,
                    person_type=person_type,
                    recorded_time=None,
                )

                logger.info("RFID TAP PROCESS ENDED: FAILED - TIME_OUT ERROR")
                logger.info("=" * 70)

                return response

            action = "TIME_OUT"
            message = f"Time Out recorded for {full_name}."

            logger.info(
                "TIME_OUT successful. UID=%s, person_type=%s, person_id=%s, "
                "full_name=%s, time_out=%s",
                uid,
                person_type,
                person_id,
                full_name,
                time_out,
            )

            self.safe_log_rfid_scan(
                rfid_uid=uid,
                scan_result="SUCCESS",
                action=action,
                message=message,
                person_type=person_type,
            )

            response = self.build_response(
                success=True,
                message=message,
                action=action,
                person=person,
                person_type=person_type,
                recorded_time=time_out,
            )

            logger.info("RFID TAP PROCESS ENDED: SUCCESS - TIME_OUT")
            logger.info("=" * 70)

            return response

        logger.info("No active attendance log found. Proceeding with TIME_IN.")

        try:
            time_in = self.database_manager.create_time_in_log(
                person_id=person["id"] if person else None,
                person_type=person_type,
                rfid_uid=uid,
                registration_status="registered" if person else "unregistered",
            )

        except Exception as error:
            message = f"Failed to record Time In for {full_name}."

            logger.error(
                "Failed to create time-in log. UID=%s, person_type=%s, "
                "person_id=%s, Error=%s",
                uid,
                person_type or "Unregistered",
                person.get("id") if person else None,
                error,
                exc_info=True,
            )

            self.safe_log_rfid_scan(
                rfid_uid=uid,
                scan_result="FAILED",
                action="TIME_IN",
                message=message,
                person_type=person_type,
            )

            response = self.build_response(
                success=False,
                message=message,
                action="TIME_IN",
                person=person,
                person_type=person_type or "Unregistered",
                recorded_time=None,
            )

            logger.info("RFID TAP PROCESS ENDED: FAILED - TIME_IN ERROR")
            logger.info("=" * 70)

            return response

        action = "TIME_IN"
        message = f"Time In recorded for {full_name}."

        logger.info(
            "TIME_IN successful. UID=%s, person_type=%s, person_id=%s, "
            "full_name=%s, time_in=%s",
            uid,
            person_type or "Unregistered",
            person.get("id") if person else None,
            full_name,
            time_in,
        )

        self.safe_log_rfid_scan(
            rfid_uid=uid,
            scan_result="SUCCESS",
            action=action,
            message=message,
            person_type=person_type,
        )

        response = self.build_response(
            success=True,
            message=message,
            action=action,
            person=person,
            person_type=person_type or "Unregistered",
            recorded_time=time_in,
        )

        logger.info("RFID TAP PROCESS ENDED: SUCCESS - TIME_IN")
        logger.info("=" * 70)

        return response

    def safe_log_rfid_scan(
        self,
        rfid_uid: str,
        scan_result: str,
        action: Optional[str],
        message: str,
        person_type: Optional[str],
    ) -> None:
        try:
            self.database_manager.log_rfid_scan(
                rfid_uid=rfid_uid,
                scan_result=scan_result,
                action=action,
                message=message,
                person_type=person_type,
            )

            logger.info(
                "RFID scan log saved. UID=%s, result=%s, action=%s, person_type=%s",
                rfid_uid,
                scan_result,
                action,
                person_type,
            )

        except Exception as error:
            logger.error(
                "Failed to save RFID scan log. UID=%s, result=%s, action=%s, "
                "person_type=%s, message=%s, Error=%s",
                rfid_uid,
                scan_result,
                action,
                person_type,
                message,
                error,
                exc_info=True,
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