import threading
from typing import Optional

from attendance_service import AttendanceService
from database import DatabaseManager
from rfid_reader import RFIDReaderService
from ui import AttendanceUI


LOG_SOURCE = "BACKEND"


class AttendanceBackend:
    def __init__(self, ui: AttendanceUI):
        self.ui = ui

        self.stop_event = threading.Event()
        self.stop_event.set()  # IMPORTANT: backend starts in stopped state

        self.lock = threading.Lock()

        # database_manager and attendance_service are created fresh in run()
        # so they always reflect the latest DB config (e.g. after ⚙ DB CONFIG).
        self.database_manager: Optional[DatabaseManager] = None
        self.attendance_service: Optional[AttendanceService] = None

        self.rfid_reader = RFIDReaderService(
            on_uid_callback=self.handle_uid,
            on_status_callback=self.show_status,
        )

    def safe_post_system(self, message: str):
        try:
            self.ui.post_system(message)
        except Exception:
            pass

    def safe_post_log(self, level: str, source: str, message: str):
        try:
            self.ui.post_log(level, source, message)
        except Exception:
            pass

    def safe_post_event(
        self,
        success: bool,
        text: str,
        uid: str,
        action: Optional[str] = None,
    ):
        try:
            self.ui.post_event(
                success=success,
                text=text,
                uid=uid,
                action=action if success else None,
            )
        except Exception:
            pass

    def show_status(self, message: str):
        self.safe_post_system(message)

    @staticmethod
    def normalize_uid(uid: Optional[str]) -> str:
        if not uid:
            return ""

        return uid.strip().upper()

    @staticmethod
    def format_full_name(person: Optional[dict]) -> str:
        if not person:
            return "N/A"

        last_name = (person.get("last_name") or "").strip()
        first_name = (person.get("first_name") or "").strip()
        middle_name = (person.get("middle_name") or "").strip()
        suffix = (person.get("suffix") or "").strip()

        other_names = " ".join(
            part for part in [first_name, middle_name, suffix] if part
        )

        if last_name and other_names:
            return f"{last_name}, {other_names}"

        if last_name:
            return last_name

        if other_names:
            return other_names

        return "N/A"

    def handle_uid(self, uid: str):
        normalized_uid = self.normalize_uid(uid)

        if not normalized_uid:
            self.safe_post_event(
                success=False,
                text="Empty RFID UID received.",
                uid="N/A",
                action=None,
            )
            return

        try:
            result = self.attendance_service.process_rfid_tap(normalized_uid)

        except Exception as error:
            self.safe_post_event(
                success=False,
                text=f"Unexpected error processing UID {normalized_uid}: {error}",
                uid=normalized_uid,
                action=None,
            )
            return

        success = bool(result.get("success", False))
        message = result.get("message") or "Unknown error occurred."
        action = result.get("action") or None

        self.safe_post_event(
            success=success,
            text=message,
            uid=normalized_uid,
            action=action,
        )

    def is_running(self) -> bool:
        return not self.stop_event.is_set()

    def run(self):
        with self.lock:
            if self.is_running():
                self.safe_post_log(
                    "WARN",
                    LOG_SOURCE,
                    "Backend is already running.",
                )
                return

            self.stop_event.clear()

        try:
            # Build fresh DB objects using the config that is current at the
            # moment START is pressed — picks up any changes made via ⚙ DB CONFIG.
            self.database_manager   = DatabaseManager(db_config=self.ui.get_db_config())
            self.attendance_service = AttendanceService(self.database_manager)

            self.rfid_reader.start()

            self.safe_post_log(
                "SUCCESS",
                LOG_SOURCE,
                "RFID backend started.",
            )

            while not self.stop_event.wait(0.2):
                pass

        except Exception as error:
            self.safe_post_log(
                "ERROR",
                LOG_SOURCE,
                f"Fatal backend error: {error}",
            )

        finally:
            self.stop(silent=True)

    def stop(self, silent: bool = False):
        with self.lock:
            if not self.is_running():
                if not silent:
                    self.safe_post_log(
                        "WARN",
                        LOG_SOURCE,
                        "Backend is already stopped.",
                    )
                return

            self.stop_event.set()

        try:
            self.rfid_reader.stop()

            if not silent:
                self.safe_post_log(
                    "SYSTEM",
                    LOG_SOURCE,
                    "RFID backend stopped.",
                )

        except Exception as error:
            self.safe_post_log(
                "ERROR",
                LOG_SOURCE,
                f"Error while stopping RFID reader: {error}",
            )


def main():
    ui = AttendanceUI()

    # The backend is created inside the start callback so it picks up the
    # DB config that was entered in the dialog (which runs before auto_start).
    _backend: Optional[AttendanceBackend] = None

    def _start():
        nonlocal _backend
        _backend = AttendanceBackend(ui=ui)
        _backend.run()

    def _stop():
        if _backend:
            _backend.stop()

    ui.launch(
        backend_start_fn=_start,
        backend_stop_fn=_stop,
        auto_start=True,
    )


if __name__ == "__main__":
    main()