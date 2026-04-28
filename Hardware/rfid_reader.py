import threading
import time
from typing import Callable, Optional

from config import TAP_COOLDOWN_SECONDS

try:
    from smartcard.System import readers
    from smartcard.Exceptions import NoCardException, CardConnectionException
except ImportError:
    readers = None
    NoCardException = Exception
    CardConnectionException = Exception


class RFIDReaderService:
    def __init__(
        self,
        on_uid_callback: Callable[[str], None],
        on_status_callback: Optional[Callable[[str], None]] = None,
    ):
        self.on_uid_callback = on_uid_callback
        self.on_status_callback = on_status_callback

        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.reader = None

        self.last_uid: Optional[str] = None
        self.last_tap_time = 0.0
        self.cooldown_seconds = TAP_COOLDOWN_SECONDS

    def start(self):
        if self.running:
            self.send_status("RFID reader is already running.")
            return

        self.running = True

        self.thread = threading.Thread(
            target=self.reader_loop,
            daemon=True,
        )
        self.thread.start()

    def stop(self):
        if not self.running:
            self.send_status("RFID reader is already stopped.")
            return

        self.running = False
        self.send_status("Stopping RFID reader...")

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)

        self.send_status("RFID reader stopped.")

    def send_status(self, message: str):
        if self.on_status_callback:
            self.on_status_callback(message)
        else:
            print(message)

    def send_uid(self, uid: str):
        if self.on_uid_callback:
            self.on_uid_callback(uid)

    def get_reader(self):
        if readers is None:
            raise RuntimeError(
                "pyscard is not installed. Run: python -m pip install pyscard"
            )

        detected_readers = readers()

        if not detected_readers:
            raise RuntimeError(
                "No ACR122 NFC reader detected. Please plug in the reader."
            )

        return detected_readers[0]

    def read_uid(self) -> str:
        if self.reader is None:
            raise RuntimeError("RFID reader is not initialized.")

        connection = None

        try:
            connection = self.reader.createConnection()
            connection.connect()

            get_uid_apdu = [0xFF, 0xCA, 0x00, 0x00, 0x00]
            data, sw1, sw2 = connection.transmit(get_uid_apdu)

            if sw1 == 0x90 and sw2 == 0x00:
                return self.to_hex_string(data)

            raise RuntimeError(f"Failed to read UID. Status: {sw1:02X} {sw2:02X}")

        finally:
            if connection:
                try:
                    connection.disconnect()
                except Exception:
                    pass

    def reader_loop(self):
        try:
            self.reader = self.get_reader()
            self.send_status(f"RFID reader connected: {self.reader}")
            self.send_status("Ready. Tap NFC card.")

        except Exception as error:
            self.running = False
            self.send_status(f"Reader error: {error}")
            return

        while self.running:
            try:
                uid = self.read_uid()
                current_time = time.time()

                if self.is_duplicate_tap(uid, current_time):
                    time.sleep(0.3)
                    continue

                self.last_uid = uid
                self.last_tap_time = current_time

                self.send_status(f"Card detected: {uid}")
                self.send_uid(uid)

                time.sleep(0.5)

            except NoCardException:
                time.sleep(0.2)

            except CardConnectionException:
                time.sleep(0.2)

            except Exception as error:
                error_message = str(error)

                no_card_messages = [
                    "No card",
                    "Card is unresponsive",
                    "Card connection failed",
                    "Unable to connect",
                    "The smart card has been removed",
                    "SCARD_W_REMOVED_CARD",
                ]

                if any(message in error_message for message in no_card_messages):
                    time.sleep(0.2)
                    continue

                self.send_status(f"RFID read error: {error_message}")
                time.sleep(1)

    def is_duplicate_tap(self, uid: str, current_time: float) -> bool:
        return (
            uid == self.last_uid
            and current_time - self.last_tap_time < self.cooldown_seconds
        )

    @staticmethod
    def to_hex_string(data) -> str:
        return "".join(f"{byte:02X}" for byte in data)