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

    def handle_uid(self, uid: str):
        print()
        print(f"[SCAN] UID detected: {uid}")

        result = self.attendance_service.process_rfid_tap(uid)

        if not result["success"]:
            print(f"[FAILED] {result['message']}")
            print("-" * 60)
            return

        user = result["user"]

        print(f"[SUCCESS] {result['message']}")
        print(f"Name       : {user['full_name']}")
        print(f"Type       : {user['user_type']}")
        print(f"ID Number  : {user['user_number']}")
        print(f"Department : {user['department']}")
        print(f"Action     : {result['action']}")
        print(f"Time       : {result['time']}")
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