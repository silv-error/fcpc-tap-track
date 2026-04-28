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
        self.thread = None
        self.reader = None

        self.last_uid = None
        self.last_tap_time = 0
        self.cooldown_seconds = TAP_COOLDOWN_SECONDS

    def start(self):
        if self.running:
            self.send_status("RFID reader is already running.")
            return

        self.running = True
        self.thread = threading.Thread(target=self.reader_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        self.send_status("RFID reader stopped.")

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1)

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
        connection = self.reader.createConnection()
        connection.connect()

        get_uid_apdu = [0xFF, 0xCA, 0x00, 0x00, 0x00]
        data, sw1, sw2 = connection.transmit(get_uid_apdu)

        if sw1 == 0x90 and sw2 == 0x00:
            return self.to_hex_string(data)

        raise RuntimeError(f"Failed to read UID. Status: {sw1:02X} {sw2:02X}")

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

                if (
                    uid == self.last_uid
                    and current_time - self.last_tap_time < self.cooldown_seconds
                ):
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
                self.send_status(f"RFID read error: {error}")
                time.sleep(1)

    @staticmethod
    def to_hex_string(data) -> str:
        return "".join(f"{byte:02X}" for byte in data)