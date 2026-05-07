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

RECONNECT_INTERVAL = 2.0   # seconds between detection retries


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

    # ──────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────

    def start(self):
        if self.running:
            return

        self.running = True
        self.thread = threading.Thread(target=self.reader_loop, daemon=True)
        self.thread.start()

    def stop(self):
        if not self.running:
            return

        self.running = False
        self.send_status("Stopping RFID reader...")

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)

        self.send_status("RFID reader stopped.")

    # ──────────────────────────────────────────────────────────────
    # Callbacks
    # ──────────────────────────────────────────────────────────────

    def send_status(self, message: str):
        if self.on_status_callback:
            self.on_status_callback(message)
        else:
            print(message)

    def send_uid(self, uid: str):
        if self.on_uid_callback:
            self.on_uid_callback(uid)

    # ──────────────────────────────────────────────────────────────
    # Hardware helpers
    # ──────────────────────────────────────────────────────────────

    def get_reader(self):
        if readers is None:
            raise RuntimeError(
                "pyscard is not installed. Run: python -m pip install pyscard"
            )

        detected = readers()

        if not detected:
            raise RuntimeError("No NFC reader detected.")

        return detected[0]

    def read_uid(self) -> str:
        if self.reader is None:
            raise RuntimeError("RFID reader is not initialized.")

        connection = None

        try:
            connection = self.reader.createConnection()
            connection.connect()

            data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])

            if sw1 == 0x90 and sw2 == 0x00:
                return self.to_hex_string(data)

            raise RuntimeError(f"Failed to read UID. Status: {sw1:02X} {sw2:02X}")

        finally:
            if connection:
                try:
                    connection.disconnect()
                except Exception:
                    pass

    def _try_connect_reader(self) -> bool:
        """
        Try once to find a reader.
        Returns True on success, False if not plugged in yet.
        Raises RuntimeError for unrecoverable errors (e.g. pyscard missing).
        """
        try:
            self.reader = self.get_reader()
            return True
        except RuntimeError as error:
            if "pyscard is not installed" in str(error):
                raise
            return False

    # ──────────────────────────────────────────────────────────────
    # Wait-for-reader loop  (logs ONE message, then silently retries)
    # ──────────────────────────────────────────────────────────────

    def _wait_for_reader(self, *, on_reconnect: bool = False) -> bool:
        """
        Block until a reader is found or self.running goes False.
        Emits a single status message, then retries silently.
        Returns True when a reader is connected, False if stopped.
        """
        if on_reconnect:
            self.send_status("RFID reader disconnected. Detecting reader...")
        else:
            self.send_status("Detecting RFID reader...")

        while self.running:
            try:
                if self._try_connect_reader():
                    self.send_status(f"RFID reader connected: {self.reader}")
                    self.send_status("Ready. Tap NFC card.")
                    return True
            except RuntimeError as error:
                self.running = False
                self.send_status(f"Fatal reader error: {error}")
                return False

            time.sleep(RECONNECT_INTERVAL)

        return False

    # ──────────────────────────────────────────────────────────────
    # Main loop
    # ──────────────────────────────────────────────────────────────

    def reader_loop(self):
        if not self._wait_for_reader():
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

                self.send_uid(uid)
                time.sleep(0.5)

            except NoCardException:
                time.sleep(0.2)

            except CardConnectionException:
                time.sleep(0.2)

            except Exception as error:
                error_message = str(error)

                no_card_keywords = [
                    "No card",
                    "Card is unresponsive",
                    "Card connection failed",
                    "Unable to connect",
                    "The smart card has been removed",
                    "SCARD_W_REMOVED_CARD",
                ]

                if any(k in error_message for k in no_card_keywords):
                    time.sleep(0.2)
                    continue

                disconnect_keywords = [
                    "SCARD_E_NO_READERS_AVAILABLE",
                    "SCARD_E_READER_UNAVAILABLE",
                    "No reader",
                    "reader removed",
                    "device has been disconnected",
                    "Device not found",
                ]

                is_disconnect = any(k in error_message for k in disconnect_keywords)

                if not is_disconnect:
                    try:
                        is_disconnect = not readers()
                    except Exception:
                        is_disconnect = True

                if is_disconnect:
                    self.reader = None
                    if not self._wait_for_reader(on_reconnect=True):
                        return
                    continue

                self.send_status(f"RFID read error: {error_message}")
                time.sleep(1)

    # ──────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────

    def is_duplicate_tap(self, uid: str, current_time: float) -> bool:
        return (
            uid == self.last_uid
            and current_time - self.last_tap_time < self.cooldown_seconds
        )

    @staticmethod
    def to_hex_string(data) -> str:
        return "".join(f"{byte:02X}" for byte in data)