"""
main.py  (modified)

Changes from original:
- Imports AttendanceUI and passes it to AttendanceBackend.
- AttendanceBackend calls ui.post_event() after every RFID result
  and ui.post_system() for reader status messages.
- The UI window runs on the main thread; the backend reader runs
  in a daemon thread via ui.launch(backend_start_fn=backend.run).
"""

import logging
import time
from typing import Dict, Optional

from attendance_service import AttendanceService
from ui import AttendanceUI
from database import DatabaseManager
from rfid_reader import RFIDReaderService


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger(__name__)


class AttendanceBackend:
    def __init__(self, ui: AttendanceUI):
        logger.info("Initializing Attendance Backend...")

        self.ui = ui

        self.database_manager = DatabaseManager()
        self.attendance_service = AttendanceService(self.database_manager)

        self.rfid_reader = RFIDReaderService(
            on_uid_callback=self.handle_uid,
            on_status_callback=self.show_status,
        )

        logger.info("Attendance Backend initialized successfully.")

    def show_status(self, message: str):
        logger.info("RFID Reader Status: %s", message)
        print(f"[STATUS] {message}")
        self.ui.post_system(message)

    @staticmethod
    def format_full_name(person: Optional[Dict]) -> str:
        if not person:
            return "N/A"

        last_name   = person.get("last_name") or ""
        first_name  = person.get("first_name") or ""
        middle_name = person.get("middle_name") or ""
        suffix      = person.get("suffix") or ""

        name_parts = [p for p in [last_name, first_name, middle_name, suffix] if p]

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
            result = self.attendance_service.process_rfid_tap(uid)
        except Exception as error:
            msg = f"Unexpected error processing UID {uid}: {error}"
            logger.error(msg, exc_info=True)
            print(f"[STATUS] RFID read error: {error}")
            self.ui.post_event(success=False, text=msg, uid=uid)
            print("-" * 60)
            return

        success       = result.get("success", False)
        message       = result.get("message", "Unknown error occurred.")
        action        = result.get("action") or ""
        person        = result.get("person") or {}
        person_type   = result.get("person_type") or "Unknown"
        recorded_time = result.get("time") or ""
        full_name     = self.format_full_name(person)

        # ── post to debug UI ─────────────────────────────────────────
        self.ui.post_event(
            success=success,
            text=message,
            uid=uid,
            action=action if success else None,
        )

        # ── console output (unchanged) ───────────────────────────────
        if not success:
            logger.warning("RFID scan failed. UID=%s, message=%s", uid, message)
            print(f"[FAILED] {message}")
            print("-" * 60)
            return

        logger.info(
            "RFID scan processed successfully. UID=%s, person_type=%s, "
            "person_id=%s, full_name=%s, action=%s, time=%s",
            uid, person_type, person.get("id"), full_name, action, recorded_time,
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
                "Unknown person type returned. UID=%s, person_type=%s", uid, person_type
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
                logger.error("Error while stopping RFID reader. Error=%s", error, exc_info=True)

            print("Backend stopped.")
            logger.info("Backend stopped.")

        except Exception as error:
            logger.critical("Fatal backend error. Error=%s", error, exc_info=True)
            print(f"[ERROR] Fatal backend error: {error}")

            try:
                self.rfid_reader.stop()
            except Exception:
                logger.error("Failed to stop RFID reader after fatal error.", exc_info=True)


def main():
    ui = AttendanceUI()
    backend = AttendanceBackend(ui=ui)
    ui.launch(backend_start_fn=backend.run)


if __name__ == "__main__":
    main()