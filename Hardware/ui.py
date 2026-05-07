import queue
import threading
import traceback
import tkinter as tk
from tkinter import font as tkfont
from datetime import datetime
from typing import Optional, Set


C_BG = "#0e1015"
C_SURFACE = "#14171f"
C_RAISED = "#1c2030"
C_BORDER = "#262c3e"
C_BORDER_HI = "#3a4260"

C_TEAL = "#00c9a7"
C_BLUE = "#3d8ef0"
C_GREEN = "#2ecc71"
C_AMBER = "#e6a817"
C_RED = "#e05252"
C_SLATE = "#4e5a78"

C_TEXT_1 = "#dde3f0"
C_TEXT_2 = "#7b87a8"
C_TEXT_3 = "#3f4d6a"

F_MONO = "Consolas"
F_FALLBACK = "Courier New"

SZ_TITLE = 13
SZ_LABEL = 8
SZ_LOG = 9
SZ_BADGE = 8
SZ_CLOCK = 9

MAX_ROWS = 600

LEVEL_META = {
    "SUCCESS": (C_GREEN, "OK "),
    "ERROR": (C_RED, "ERR"),
    "WARN": (C_AMBER, "WRN"),
    "INFO": (C_BLUE, "INF"),
    "SYSTEM": (C_SLATE, "SYS"),
}


class _Sep(tk.Frame):
    def __init__(self, parent, color=C_BORDER, **kwargs):
        super().__init__(parent, bg=color, height=1, **kwargs)
        self.pack(fill="x")


class _VLine(tk.Frame):
    def __init__(self, parent, color=C_BORDER, **kwargs):
        super().__init__(parent, bg=color, width=1, **kwargs)
        self.pack(side="left", fill="y", padx=0)


class _PulseDot(tk.Canvas):
    RADIUS = 5

    def __init__(self, parent, **kwargs):
        size = self.RADIUS * 2 + 2

        super().__init__(
            parent,
            width=size,
            height=size,
            bg=C_SURFACE,
            highlightthickness=0,
            **kwargs,
        )

        self._dot = self.create_oval(
            1,
            1,
            size - 1,
            size - 1,
            fill=C_SLATE,
            outline="",
        )

        self._color = C_SLATE
        self._pulsing = False
        self._pulse_state = False

    def set_color(self, color: str, pulse: bool = False):
        self._color = color
        self._pulsing = pulse

        if not pulse:
            self.itemconfig(self._dot, fill=color)

    def _tick(self):
        if not self._pulsing:
            return

        self._pulse_state = not self._pulse_state

        self.itemconfig(
            self._dot,
            fill=self._color if self._pulse_state else C_BORDER,
        )

        self.after(600, self._tick)

    def start_pulse(self):
        if self._pulsing:
            return

        self._pulsing = True
        self._tick()

    def stop_pulse(self, color: str):
        self._pulsing = False
        self._color = color
        self.itemconfig(self._dot, fill=color)


class _ReaderWatcher:
    POLL_MS = 800

    def __init__(self, on_connected, on_disconnected, on_no_pcsc, on_log):
        self._on_connected = on_connected
        self._on_disconnected = on_disconnected
        self._on_no_pcsc = on_no_pcsc
        self._on_log = on_log
        self._stop = threading.Event()
        self._known: Set[str] = set()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return

        self._stop.clear()

        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name="ReaderWatcher",
        )
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _run(self):
        try:
            from smartcard.System import readers as sc_readers
        except ImportError:
            self._on_no_pcsc()
            return

        pcsc_error_logged = False

        while not self._stop.is_set():
            try:
                current: Set[str] = {str(reader) for reader in sc_readers()}
                pcsc_error_logged = False

                appeared = current - self._known
                vanished = self._known - current

                for name in sorted(appeared):
                    self._known.add(name)
                    self._on_connected(name)

                for name in sorted(vanished):
                    self._known.discard(name)
                    self._on_disconnected(name)

            except Exception as exc:
                if not pcsc_error_logged:
                    self._on_log("WARN", "PCSC", f"PC/SC subsystem error: {exc}")
                    pcsc_error_logged = True

                for name in sorted(self._known):
                    self._on_disconnected(name)

                self._known.clear()

            self._stop.wait(self.POLL_MS / 1000)


class AttendanceUI:
    def __init__(self):
        self._q: queue.Queue = queue.Queue()
        self._row_idx = 0
        self._log_line_count = 0

        self._backend_thread: Optional[threading.Thread] = None
        self._backend_start_fn = None
        self._backend_stop_fn = None
        self._backend_running = False

        self.root = tk.Tk()
        self.root.title("RFID Attendance — Debug Monitor")
        self.root.geometry("1040x660")
        self.root.minsize(780, 480)
        self.root.configure(bg=C_BG)

        try:
            self.root.iconbitmap(default="")
        except Exception:
            pass

        self._build_fonts()
        self._build_ui()
        self._pump()

        self._watcher = _ReaderWatcher(
            on_connected=self._on_reader_connected,
            on_disconnected=self._on_reader_disconnected,
            on_no_pcsc=self._on_no_pcsc,
            on_log=self.post_log,
        )
        self._watcher.start()

    def _build_fonts(self):
        def make_font(size, bold=False):
            weight = "bold" if bold else "normal"

            try:
                return tkfont.Font(family=F_MONO, size=size, weight=weight)
            except Exception:
                return tkfont.Font(family=F_FALLBACK, size=size, weight=weight)

        self.fnt_title = make_font(SZ_TITLE, bold=True)
        self.fnt_label = make_font(SZ_LABEL, bold=True)
        self.fnt_log = make_font(SZ_LOG)
        self.fnt_logb = make_font(SZ_LOG, bold=True)
        self.fnt_badge = make_font(SZ_BADGE, bold=True)
        self.fnt_clock = make_font(SZ_CLOCK)
        self.fnt_dim = make_font(SZ_LABEL)

    def _build_ui(self):
        self._build_header()
        _Sep(self.root, color=C_BORDER_HI)
        self._build_status_bar()
        _Sep(self.root, color=C_BORDER)
        self._build_log_header()
        _Sep(self.root, color=C_BORDER)
        self._build_log_area()
        self._build_footer()

    def _build_header(self):
        bar = tk.Frame(self.root, bg=C_SURFACE)
        bar.pack(fill="x")

        left = tk.Frame(bar, bg=C_SURFACE)
        left.pack(side="left", padx=(18, 0), pady=10)

        tk.Label(
            left,
            text="▪",
            font=self.fnt_label,
            bg=C_SURFACE,
            fg=C_TEAL,
        ).pack(side="left", padx=(0, 6))

        tk.Label(
            left,
            text="RFID ATTENDANCE",
            font=self.fnt_title,
            bg=C_SURFACE,
            fg=C_TEXT_1,
        ).pack(side="left")

        tk.Label(
            left,
            text="  DEBUG MONITOR",
            font=self.fnt_title,
            bg=C_SURFACE,
            fg=C_TEXT_2,
        ).pack(side="left")

        right = tk.Frame(bar, bg=C_SURFACE)
        right.pack(side="right", padx=18, pady=10)

        self._clock_var = tk.StringVar()

        tk.Label(
            right,
            textvariable=self._clock_var,
            font=self.fnt_clock,
            bg=C_SURFACE,
            fg=C_TEXT_3,
        ).pack()

        self._tick_clock()

    def _build_status_bar(self):
        bar = tk.Frame(self.root, bg=C_SURFACE, height=38)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        inner = tk.Frame(bar, bg=C_SURFACE)
        inner.pack(side="left", fill="y", padx=18)

        self._reader_dot = _PulseDot(inner)
        self._reader_dot.pack(side="left", pady=10, padx=(0, 7))

        self._reader_var = tk.StringVar(value="READER  ·  detecting...")

        tk.Label(
            inner,
            textvariable=self._reader_var,
            font=self.fnt_dim,
            bg=C_SURFACE,
            fg=C_TEXT_2,
        ).pack(side="left")

        _VLine(bar, color=C_BORDER)

        mid = tk.Frame(bar, bg=C_SURFACE)
        mid.pack(side="left", fill="y", padx=18)

        self._scan_dot = tk.Label(
            mid,
            text="●",
            font=self.fnt_label,
            bg=C_SURFACE,
            fg=C_TEXT_3,
            padx=0,
        )
        self._scan_dot.pack(side="left", padx=(0, 6), pady=10)

        tk.Label(
            mid,
            text="LAST SCAN  ·",
            font=self.fnt_dim,
            bg=C_SURFACE,
            fg=C_TEXT_3,
        ).pack(side="left", padx=(0, 6))

        self._scan_var = tk.StringVar(value="awaiting first tap")

        tk.Label(
            mid,
            textvariable=self._scan_var,
            font=self.fnt_dim,
            bg=C_SURFACE,
            fg=C_TEXT_2,
        ).pack(side="left")

        right = tk.Frame(bar, bg=C_SURFACE)
        right.pack(side="right", padx=18)

        self._count_var = tk.StringVar(value="0")

        tk.Label(
            right,
            textvariable=self._count_var,
            font=self.fnt_logb,
            bg=C_SURFACE,
            fg=C_TEXT_2,
        ).pack(side="right")

        tk.Label(
            right,
            text="entries  ",
            font=self.fnt_dim,
            bg=C_SURFACE,
            fg=C_TEXT_3,
        ).pack(side="right")

    def _build_log_header(self):
        header_text = (
            f"{'#':>4}  "
            f"{'TIME':<8}  "
            f"{'LVL':<3}  "
            f"{'TAG':<8}  "
            f"{'UID':<10}  "
            f"{'ACTION':<10}  "
            f"MESSAGE"
        )

        bar = tk.Frame(self.root, bg=C_BG)
        bar.pack(fill="x")

        tk.Label(
            bar,
            text=header_text,
            font=self.fnt_dim,
            bg=C_BG,
            fg=C_TEXT_3,
            anchor="w",
            padx=14,
            pady=4,
        ).pack(fill="x")

    def _build_log_area(self):
        wrapper = tk.Frame(self.root, bg=C_BG)
        wrapper.pack(fill="both", expand=True)

        self._log_text = tk.Text(
            wrapper,
            bg=C_BG,
            fg=C_TEXT_1,
            insertbackground=C_TEXT_1,
            font=self.fnt_log,
            bd=0,
            highlightthickness=0,
            wrap="none",
            state="disabled",
            padx=14,
            pady=6,
        )

        scrollbar_y = tk.Scrollbar(
            wrapper,
            orient="vertical",
            command=self._log_text.yview,
            bg=C_SURFACE,
            troughcolor=C_BG,
            activebackground=C_TEAL,
            width=10,
        )

        scrollbar_x = tk.Scrollbar(
            wrapper,
            orient="horizontal",
            command=self._log_text.xview,
            bg=C_SURFACE,
            troughcolor=C_BG,
            activebackground=C_TEAL,
            width=10,
        )

        self._log_text.configure(
            yscrollcommand=scrollbar_y.set,
            xscrollcommand=scrollbar_x.set,
        )

        self._log_text.pack(side="left", fill="both", expand=True)
        scrollbar_y.pack(side="right", fill="y")
        scrollbar_x.pack(side="bottom", fill="x")

        self._log_text.tag_configure("SUCCESS", foreground=C_GREEN)
        self._log_text.tag_configure("ERROR", foreground=C_RED)
        self._log_text.tag_configure("WARN", foreground=C_AMBER)
        self._log_text.tag_configure("INFO", foreground=C_BLUE)
        self._log_text.tag_configure("SYSTEM", foreground=C_SLATE)

    def _build_footer(self):
        _Sep(self.root, color=C_BORDER)

        bar = tk.Frame(self.root, bg=C_SURFACE, height=34)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        self._autoscroll = tk.BooleanVar(value=True)

        checkbox = tk.Checkbutton(
            bar,
            text="Auto-scroll",
            variable=self._autoscroll,
            font=self.fnt_dim,
            bg=C_SURFACE,
            fg=C_TEXT_2,
            selectcolor=C_RAISED,
            activebackground=C_SURFACE,
            activeforeground=C_TEXT_1,
            bd=0,
            cursor="hand2",
        )
        checkbox.pack(side="left", padx=14, pady=5)

        self._start_btn = tk.Button(
            bar,
            text="START",
            font=self.fnt_badge,
            bg=C_RAISED,
            fg=C_GREEN,
            bd=0,
            padx=14,
            pady=1,
            activebackground=C_BORDER,
            activeforeground=C_GREEN,
            cursor="hand2",
            relief="flat",
            command=self._start_backend_from_button,
        )
        self._start_btn.pack(side="left", padx=(4, 6), pady=5)

        self._stop_btn = tk.Button(
            bar,
            text="STOP",
            font=self.fnt_badge,
            bg=C_RAISED,
            fg=C_TEXT_3,
            bd=0,
            padx=14,
            pady=1,
            activebackground=C_BORDER,
            activeforeground=C_RED,
            cursor="hand2",
            relief="flat",
            command=self._stop_backend_from_button,
            state="disabled",
        )
        self._stop_btn.pack(side="left", padx=(0, 10), pady=5)

        tk.Button(
            bar,
            text="CLEAR LOG",
            font=self.fnt_badge,
            bg=C_RAISED,
            fg=C_AMBER,
            bd=0,
            padx=12,
            pady=1,
            activebackground=C_BORDER,
            activeforeground=C_AMBER,
            cursor="hand2",
            relief="flat",
            command=self._clear,
        ).pack(side="right", padx=14, pady=5)

    def _tick_clock(self):
        self._clock_var.set(datetime.now().strftime("%Y-%m-%d   %H:%M:%S"))
        self.root.after(1000, self._tick_clock)

    def _pump(self):
        handled = 0
        max_per_pump = 100

        try:
            while handled < max_per_pump:
                self._handle(self._q.get_nowait())
                handled += 1
        except queue.Empty:
            pass

        self.root.after(50, self._pump)

    def _handle(self, msg: dict):
        kind = msg.get("kind")

        if kind == "row":
            self._append(msg)
        elif kind == "status":
            self._update_scan_status(msg)
        elif kind == "reader":
            self._update_reader_status(msg)
        elif kind == "backend_buttons":
            self._apply_backend_buttons(msg.get("running", False))

    def _append(self, msg: dict):
        level = msg.get("level", "INFO")
        tag = msg.get("tag", "")
        text = msg.get("text", "")
        ts = msg.get("timestamp", "")
        uid = msg.get("uid", "")
        action = msg.get("action", "")

        _, abbrev = LEVEL_META.get(level, (C_SLATE, "???"))

        self._row_idx += 1
        self._log_line_count += 1

        line = (
            f"{self._row_idx:>4}  "
            f"{ts:<8}  "
            f"{abbrev:<3}  "
            f"{tag[:8]:<8}  "
            f"{uid[:10]:<10}  "
            f"{action[:10]:<10}  "
            f"{text}\n"
        )

        self._log_text.configure(state="normal")
        self._log_text.insert("end", line, level)

        if self._log_line_count > MAX_ROWS:
            self._log_text.delete("1.0", "2.0")
            self._log_line_count -= 1

        self._log_text.configure(state="disabled")

        self._count_var.set(str(self._row_idx))

        if self._autoscroll.get():
            self._log_text.see("end")

    def _update_scan_status(self, msg: dict):
        success = msg.get("success", True)
        text = msg.get("text", "")

        self._scan_dot.configure(fg=C_GREEN if success else C_RED)
        self._scan_var.set(text[:80])

    def _update_reader_status(self, msg: dict):
        state = msg.get("state", "detecting")
        name = msg.get("name", "")

        if state == "detecting":
            self._reader_var.set("READER  ·  detecting...")
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()

        elif state == "connected":
            label = f"READER  ·  {name}" if name else "READER  ·  connected"
            self._reader_var.set(label[:60])
            self._reader_dot.stop_pulse(C_GREEN)

        elif state == "disconnected":
            label = (
                f"READER  ·  disconnected ({name})"
                if name
                else "READER  ·  disconnected"
            )
            self._reader_var.set((label + "  —  detecting...")[:60])
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()

    def _on_reader_connected(self, name: str):
        ts = datetime.now().strftime("%H:%M:%S")

        self._q.put({"kind": "reader", "state": "connected", "name": name})
        self._q.put(
            {
                "kind": "row",
                "level": "SYSTEM",
                "tag": "HOTPLUG",
                "text": f"Reader connected: {name}",
                "uid": "",
                "action": "",
                "timestamp": ts,
            }
        )

    def _on_reader_disconnected(self, name: str):
        ts = datetime.now().strftime("%H:%M:%S")

        self._q.put({"kind": "reader", "state": "disconnected", "name": name})
        self._q.put(
            {
                "kind": "row",
                "level": "WARN",
                "tag": "HOTPLUG",
                "text": f"Reader disconnected: {name}",
                "uid": "",
                "action": "",
                "timestamp": ts,
            }
        )

    def _on_no_pcsc(self):
        ts = datetime.now().strftime("%H:%M:%S")

        self._q.put(
            {
                "kind": "row",
                "level": "WARN",
                "tag": "PCSC",
                "text": "pyscard not installed — install with: pip install pyscard",
                "uid": "",
                "action": "",
                "timestamp": ts,
            }
        )

    def _clear(self):
        self._log_text.configure(state="normal")
        self._log_text.delete("1.0", "end")
        self._log_text.configure(state="disabled")

        self._row_idx = 0
        self._log_line_count = 0
        self._count_var.set("0")

    def _queue_backend_button_state(self, running: bool):
        self._q.put(
            {
                "kind": "backend_buttons",
                "running": running,
            }
        )

    def _apply_backend_buttons(self, running: bool):
        self._backend_running = running

        if not hasattr(self, "_start_btn") or not hasattr(self, "_stop_btn"):
            return

        if running:
            self._start_btn.configure(state="disabled", fg=C_TEXT_3)
            self._stop_btn.configure(state="normal", fg=C_RED)
        else:
            self._start_btn.configure(state="normal", fg=C_GREEN)
            self._stop_btn.configure(state="disabled", fg=C_TEXT_3)

    def _start_backend_from_button(self):
        if self._backend_running:
            self.post_log("WARN", "BACKEND", "Backend is already running.")
            return

        if not self._backend_start_fn:
            self.post_log("ERROR", "BACKEND", "No backend start function was provided.")
            return

        self.post_system("Starting backend from UI button...")
        self._apply_backend_buttons(True)

        self._backend_thread = threading.Thread(
            target=self._run_backend_safely,
            args=(self._backend_start_fn,),
            daemon=True,
            name="AttendanceBackendThread",
        )
        self._backend_thread.start()

    def _stop_backend_from_button(self):
        if not self._backend_running:
            self.post_log("WARN", "BACKEND", "Backend is already stopped.")
            return

        self.post_system("Stopping backend from UI button...")

        try:
            if self._backend_stop_fn:
                self._backend_stop_fn()
            else:
                self.post_log("WARN", "BACKEND", "No backend stop function was provided.")

        except Exception as exc:
            self.post_log("ERROR", "BACKEND", f"Failed to stop backend: {exc}")

        finally:
            self._apply_backend_buttons(False)
            self.post_system("Backend stop requested.")

    def post_event(
        self,
        *,
        success: bool,
        text: str,
        uid: str = "",
        action: Optional[str] = None,
    ):
        ts = datetime.now().strftime("%H:%M:%S")

        self._q.put(
            {
                "kind": "row",
                "level": "SUCCESS" if success else "ERROR",
                "tag": "RFID",
                "text": text,
                "uid": uid,
                "action": action or "",
                "timestamp": ts,
            }
        )

        self._q.put(
            {
                "kind": "status",
                "success": success,
                "text": text,
            }
        )

    def post_system(self, text: str):
        ts = datetime.now().strftime("%H:%M:%S")
        lowered_text = text.lower()

        if "detecting" in lowered_text or "waiting" in lowered_text:
            self._q.put({"kind": "reader", "state": "detecting"})

        elif "connected:" in lowered_text:
            name = text.split("connected:")[-1].strip()
            self._q.put({"kind": "reader", "state": "connected", "name": name})

        elif "disconnected" in lowered_text:
            self._q.put({"kind": "reader", "state": "disconnected"})

        elif "ready" in lowered_text:
            self._q.put({"kind": "reader", "state": "connected"})

        self._q.put(
            {
                "kind": "row",
                "level": "SYSTEM",
                "tag": "SYSTEM",
                "text": text,
                "uid": "",
                "action": "",
                "timestamp": ts,
            }
        )

    def post_log(
        self,
        level: str,
        tag: str,
        text: str,
        uid: str = "",
        action: Optional[str] = None,
    ):
        self._q.put(
            {
                "kind": "row",
                "level": level.upper(),
                "tag": tag,
                "text": text,
                "uid": uid,
                "action": action or "",
                "timestamp": datetime.now().strftime("%H:%M:%S"),
            }
        )

    def _run_backend_safely(self, backend_start_fn):
        try:
            self.post_system("Backend thread starting...")
            backend_start_fn()

        except Exception as exc:
            error_text = f"Backend crashed: {exc}"
            full_traceback = traceback.format_exc()

            self.post_log("ERROR", "BACKEND", error_text)

            traceback_lines = full_traceback.strip().splitlines()

            for line in traceback_lines[-12:]:
                self.post_log("ERROR", "TRACE", line[:180])

        finally:
            self._queue_backend_button_state(False)
            self.post_system("Backend thread stopped.")

    def launch(self, backend_start_fn=None, backend_stop_fn=None, auto_start=False):
        self._backend_start_fn = backend_start_fn
        self._backend_stop_fn = backend_stop_fn

        self._apply_backend_buttons(False)

        if auto_start and backend_start_fn:
            self._start_backend_from_button()

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        try:
            self.root.mainloop()

        except KeyboardInterrupt:
            self._on_close()

        except Exception as error:
            try:
                self.post_log("ERROR", "UI", f"UI crashed: {error}")
            except Exception:
                pass

            self._on_close()

    def _on_close(self):
        try:
            if self._backend_running and self._backend_stop_fn:
                self._backend_stop_fn()
        except Exception:
            pass

        try:
            self._watcher.stop()
        except Exception:
            pass

        try:
            if self.root.winfo_exists():
                self.root.quit()
                self.root.destroy()
        except Exception:
            pass


def _demo():
    import time

    ui = AttendanceUI()

    demo_running = {
        "value": False,
    }

    def demo_backend_start():
        if demo_running["value"]:
            return

        demo_running["value"] = True
        ui.post_log("SUCCESS", "DEMO", "Demo backend started.")

        scans = [
            (
                True,
                "A1B2C3D4",
                "TIME_IN",
                "Time In recorded for Santos, Juan dela Cruz.",
            ),
            (
                True,
                "DEADBEEF",
                "TIME_IN",
                "Time In recorded for Reyes, Maria Paz.",
            ),
            (
                False,
                "00000000",
                None,
                "RFID UID is not registered: 00000000",
            ),
            (
                True,
                "CAFE1234",
                "TIME_OUT",
                "Time Out recorded for Santos, Juan dela Cruz.",
            ),
            (
                False,
                "BADA5510",
                None,
                "Student is inactive: Lim, Carlo B.",
            ),
        ]

        while demo_running["value"]:
            for ok, uid, action, message in scans:
                if not demo_running["value"]:
                    break

                time.sleep(1.1)

                ui.post_event(
                    success=ok,
                    text=message,
                    uid=uid,
                    action=action,
                )

        ui.post_log("SYSTEM", "DEMO", "Demo backend stopped.")

    def demo_backend_stop():
        demo_running["value"] = False

    ui.launch(
        backend_start_fn=demo_backend_start,
        backend_stop_fn=demo_backend_stop,
        auto_start=False,
    )


if __name__ == "__main__":
    _demo()