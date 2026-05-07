import time
from typing import Dict, Optional

from attendance_service import AttendanceService
from database import DatabaseManager
from rfid_reader import RFIDReaderService
from ui import AttendanceUI


class AttendanceBackend:
    def __init__(self, ui: AttendanceUI):
        self.ui = ui
        self.running = False

        self.database_manager = DatabaseManager()
        self.attendance_service = AttendanceService(self.database_manager)

        self.rfid_reader = RFIDReaderService(
            on_uid_callback=self.handle_uid,
            on_status_callback=self.show_status,
        )

    def show_status(self, message: str):
        try:
            self.ui.post_system(message)
        except Exception:
            pass

    @staticmethod
    def format_full_name(person: Optional[Dict]) -> str:
        if not person:
            return "N/A"

        last_name = person.get("last_name") or ""
        first_name = person.get("first_name") or ""
        middle_name = person.get("middle_name") or ""
        suffix = person.get("suffix") or ""

        name_parts = [
            part
            for part in [last_name, first_name, middle_name, suffix]
            if part
        ]

        if not name_parts:
            return "N/A"

        return ", ".join(name_parts[:1]) + (
            f", {' '.join(name_parts[1:])}" if len(name_parts) > 1 else ""
        )

    def handle_uid(self, uid: str):
        try:
            result = self.attendance_service.process_rfid_tap(uid)

        except Exception as error:
            message = f"Unexpected error processing UID {uid}: {error}"

            try:
                self.ui.post_event(
                    success=False,
                    text=message,
                    uid=uid,
                    action=None,
                )
            except Exception:
                pass

            return

        success = result.get("success", False)
        message = result.get("message", "Unknown error occurred.")
        action = result.get("action") or ""

        try:
            self.ui.post_event(
                success=success,
                text=message,
                uid=uid,
                action=action if success else None,
            )
        except Exception:
            pass

    def run(self):
        if self.running:
            try:
                self.ui.post_log("WARN", "BACKEND", "Backend is already running.")
            except Exception:
                pass

            return

        self.running = True

        try:
            self.rfid_reader.start()

            try:
                self.ui.post_log("SUCCESS", "BACKEND", "RFID backend started.")
            except Exception:
                pass

            while self.running:
                time.sleep(1)

        except Exception as error:
            try:
                self.ui.post_log(
                    "ERROR",
                    "BACKEND",
                    f"Fatal backend error: {error}",
                )
            except Exception:
                pass

        finally:
            self.stop()

    def stop(self):
        if not self.running:
            try:
                self.ui.post_log("WARN", "BACKEND", "Backend is already stopped.")
            except Exception:
                pass

            return

        self.running = False

        try:
            self.rfid_reader.stop()

            try:
                self.ui.post_log("SYSTEM", "BACKEND", "RFID backend stopped.")
            except Exception:
                pass

        except Exception as error:
            try:
                self.ui.post_log(
                    "ERROR",
                    "BACKEND",
                    f"Error while stopping RFID reader: {error}",
                )
            except Exception:
                pass


def main():
    ui = AttendanceUI()
    backend = AttendanceBackend(ui=ui)

    ui.launch(
        backend_start_fn=backend.run,
        backend_stop_fn=backend.stop,
        auto_start=False,
    )


if __name__ == "__main__":
    main()