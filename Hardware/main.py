import time

from attendance_service import AttendanceService
from database import DatabaseManager
from rfid_reader import RFIDReaderService


class AttendanceBackend:
    def __init__(self):
        self.database_manager = DatabaseManager()
        self.attendance_service = AttendanceService(self.database_manager)

        self.rfid_reader = RFIDReaderService(
            on_uid_callback=self.handle_uid,
            on_status_callback=self.show_status,
        )

    @staticmethod
    def show_status(message: str):
        print(f"[STATUS] {message}")

    @staticmethod
    def format_full_name(person: dict) -> str:
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

        return ", ".join(name_parts[:1]) + (
            f", {' '.join(name_parts[1:])}" if len(name_parts) > 1 else ""
        ) or "N/A"

    def handle_uid(self, uid: str):
        print()
        print(f"[SCAN] UID detected: {uid}")

        result = self.attendance_service.process_rfid_tap(uid)

        if not result.get("success"):
            print(f"[FAILED] {result.get('message', 'Unknown error occurred.')}")
            print("-" * 60)
            return

        person = result.get("person", {})
        person_type = result.get("person_type", "Unknown")
        full_name = self.format_full_name(person)

        print(f"[SUCCESS] {result.get('message', 'Attendance recorded successfully.')}")
        print(f"Name       : {full_name}")
        print(f"Type       : {person_type}")

        if person_type == "Student":
            print(f"ID Number  : {person.get('student_number', 'N/A')}")
            print(f"Course     : {person.get('course', 'N/A')}")
            print(f"Year Level : {person.get('year_level', 'N/A')}")

        elif person_type == "Employee":
            print(f"ID Number  : {person.get('employee_number', 'N/A')}")
            print(f"Position   : {person.get('position', 'N/A')}")

        print(f"Department : {person.get('department', 'N/A')}")
        print(f"Action     : {result.get('action', 'N/A')}")
        print(f"Time       : {result.get('time', 'N/A')}")
        print("-" * 60)

    def run(self):
        print("Starting NFC Attendance Backend...")
        print("Press CTRL + C to stop.")
        print()

        self.rfid_reader.start()

        try:
            while True:
                time.sleep(1)

        except KeyboardInterrupt:
            print()
            print("Stopping backend...")
            self.rfid_reader.stop()
            print("Backend stopped.")


def main():
    backend = AttendanceBackend()
    backend.run()


if __name__ == "__main__":
    main()