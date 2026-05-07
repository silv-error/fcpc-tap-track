import logging
import time
from typing import Dict, Optional

from attendance_service import AttendanceService
from database import DatabaseManager
from rfid_reader import RFIDReaderService


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger(__name__)


class AttendanceBackend:
    def __init__(self):
        logger.info("Initializing Attendance Backend...")

        self.database_manager = DatabaseManager()
        self.attendance_service = AttendanceService(self.database_manager)

        self.rfid_reader = RFIDReaderService(
            on_uid_callback=self.handle_uid,
            on_status_callback=self.show_status,
        )

        logger.info("Attendance Backend initialized successfully.")

    @staticmethod
    def show_status(message: str):
        logger.info("RFID Reader Status: %s", message)
        print(f"[STATUS] {message}")

    @staticmethod
    def format_full_name(person: Optional[Dict]) -> str:
        if not person:
            return "N/A"

        last_name = person.get("last_name") or ""
        first_name = person.get("first_name") or ""
        middle_name = person.get("middle_name") or ""
        suffix = person.get("suffix") or ""

        name_parts = []

        if last_name:
            name_parts.append(last_name)

        if first_name:
            name_parts.append(first_name)

        if middle_name:
            name_parts.append(middle_name)

        if suffix:
            name_parts.append(suffix)

        if not name_parts:
            return "N/A"

        return ", ".join(name_parts[:1]) + (
            f", {' '.join(name_parts[1:])}" if len(name_parts) > 1 else ""
        )

    def handle_uid(self, uid: str):
        print()
        print(f"[SCAN] UID detected: {uid}")

        logger.info("=" * 70)
        logger.info("New RFID scan received.")
        logger.info("UID received from reader: %s", uid)

        try:
            # IMPORTANT:
            # Do not call save_rfid_uid_to_buffer() here anymore.
            # AttendanceService.process_rfid_tap() already saves the UID to the buffer.
            # Calling it here also will create duplicate buffer logs.
            result = self.attendance_service.process_rfid_tap(uid)

        except Exception as error:
            logger.error(
                "Unexpected error while processing RFID UID=%s. Error=%s",
                uid,
                error,
                exc_info=True,
            )

            print(f"[STATUS] RFID read error: {error}")
            print("-" * 60)
            return

        if not result.get("success"):
            message = result.get("message", "Unknown error occurred.")

            logger.warning(
                "RFID scan failed. UID=%s, message=%s",
                uid,
                message,
            )

            print(f"[FAILED] {message}")
            print("-" * 60)
            return

        person = result.get("person") or {}
        person_type = result.get("person_type") or "Unknown"
        full_name = self.format_full_name(person)

        action = result.get("action", "N/A")
        recorded_time = result.get("time", "N/A")
        message = result.get("message", "Attendance recorded successfully.")

        logger.info(
            "RFID scan processed successfully. UID=%s, person_type=%s, "
            "person_id=%s, full_name=%s, action=%s, time=%s",
            uid,
            person_type,
            person.get("id"),
            full_name,
            action,
            recorded_time,
        )

        print(f"[SUCCESS] {message}")
        print(f"Name       : {full_name}")
        print(f"Type       : {person_type}")

        if person_type == "Student":
            print(f"ID Number  : {person.get('student_number', 'N/A')}")
            print(f"Program    : {person.get('program', 'N/A')}")
            print(f"Year Level : {person.get('year_level', 'N/A')}")

        elif person_type == "Employee":
            print(f"ID Number  : {person.get('employee_number', 'N/A')}")
            print(f"Position   : {person.get('position', 'N/A')}")

        else:
            logger.warning(
                "Unknown person type returned from attendance service. UID=%s, person_type=%s",
                uid,
                person_type,
            )

        print(f"Department : {person.get('department', 'N/A')}")
        print(f"Action     : {action}")
        print(f"Time       : {recorded_time}")
        print("-" * 60)

        logger.info("RFID scan handling completed.")
        logger.info("=" * 70)

    def run(self):
        logger.info("Starting NFC Attendance Backend...")

        print("Starting NFC Attendance Backend...")
        print("Press CTRL + C to stop.")
        print()

        try:
            self.rfid_reader.start()
            logger.info("RFID reader started successfully.")

            while True:
                time.sleep(1)

        except KeyboardInterrupt:
            print()
            print("Stopping backend...")

            logger.info("Keyboard interrupt received. Stopping backend...")

            try:
                self.rfid_reader.stop()
                logger.info("RFID reader stopped successfully.")

            except Exception as error:
                logger.error(
                    "Error while stopping RFID reader. Error=%s",
                    error,
                    exc_info=True,
                )

            print("Backend stopped.")
            logger.info("Backend stopped.")

        except Exception as error:
            logger.critical(
                "Fatal backend error. Error=%s",
                error,
                exc_info=True,
            )

            print(f"[ERROR] Fatal backend error: {error}")

            try:
                self.rfid_reader.stop()

            except Exception:
                logger.error(
                    "Failed to stop RFID reader after fatal error.",
                    exc_info=True,
                )


def main():
    backend = AttendanceBackend()
    backend.run()


if __name__ == "__main__":
    main()