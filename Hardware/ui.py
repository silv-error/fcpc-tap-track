"""
attendance_ui.py

Server-side debug monitor for the RFID Attendance System.
Industrial control-panel aesthetic — clean, dense, professional.

Standalone demo:  python attendance_ui.py
Backend usage:    ui.launch(backend_start_fn=backend.run)
"""

import queue
import threading
import traceback
import tkinter as tk
from tkinter import font as tkfont
from datetime import datetime
from typing import Optional, Set


# ──────────────────────────────────────────────────────────────────────────────
# Design tokens
# ──────────────────────────────────────────────────────────────────────────────

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

COLS = [
    ("#", 36, 10),
    ("TIME", 62, 8),
    ("LVL", 26, 8),
    ("TAG", 54, 8),
    ("UID", 70, 8),
    ("ACTION", 72, 8),
    ("MESSAGE", 0, 10),
]


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _mono(size: int, bold: bool = False) -> tuple:
    return (F_MONO, size, "bold" if bold else "normal")


class _Sep(tk.Frame):
    def __init__(self, parent, color=C_BORDER, **kw):
        super().__init__(parent, bg=color, height=1, **kw)
        self.pack(fill="x")


class _VLine(tk.Frame):
    def __init__(self, parent, color=C_BORDER, **kw):
        super().__init__(parent, bg=color, width=1, **kw)
        self.pack(side="left", fill="y", padx=0)


# ──────────────────────────────────────────────────────────────────────────────
# Scrollable canvas
# ──────────────────────────────────────────────────────────────────────────────

class _Scroller(tk.Frame):
    def __init__(self, parent, bg=C_SURFACE, **kw):
        super().__init__(parent, bg=bg, **kw)

        self._cv = tk.Canvas(self, bg=bg, highlightthickness=0, bd=0)
        self._sb = tk.Scrollbar(
            self,
            orient="vertical",
            command=self._cv.yview,
            bg=C_SURFACE,
            troughcolor=C_BG,
            activebackground=C_TEAL,
            width=10,
        )
        self._inner = tk.Frame(self._cv, bg=bg)

        self._inner.bind(
            "<Configure>",
            lambda _: self._cv.configure(scrollregion=self._cv.bbox("all")),
        )

        self._wid = self._cv.create_window((0, 0), window=self._inner, anchor="nw")
        self._cv.configure(yscrollcommand=self._sb.set)

        self._cv.pack(side="left", fill="both", expand=True)
        self._sb.pack(side="right", fill="y")

        self._cv.bind(
            "<Configure>",
            lambda e: self._cv.itemconfig(self._wid, width=e.width),
        )

        for widget in (self._inner, self._cv):
            widget.bind(
                "<MouseWheel>",
                lambda e: self._cv.yview_scroll(int(-1 * (e.delta / 120)), "units"),
            )

    @property
    def inner(self):
        return self._inner

    def to_bottom(self):
        self._cv.yview_moveto(1.0)


# ──────────────────────────────────────────────────────────────────────────────
# Pulsing dot widget
# ──────────────────────────────────────────────────────────────────────────────

class _PulseDot(tk.Canvas):
    RADIUS = 5

    def __init__(self, parent, **kw):
        size = self.RADIUS * 2 + 2

        super().__init__(
            parent,
            width=size,
            height=size,
            bg=C_SURFACE,
            highlightthickness=0,
            **kw,
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


# ──────────────────────────────────────────────────────────────────────────────
# Hardware reader watcher
# ──────────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────────
# Column cell helper
# ──────────────────────────────────────────────────────────────────────────────

def _cell(parent, text, col_idx, bg, fg, font, anchor="w", right_pad=0):
    _, px_w, lpad = COLS[col_idx]
    is_last = px_w == 0

    if is_last:
        label = tk.Label(
            parent,
            text=text,
            font=font,
            bg=bg,
            fg=fg,
            anchor=anchor,
        )
        label.pack(side="left", padx=(lpad, right_pad), fill="x", expand=True)
        return label

    frame = tk.Frame(parent, bg=bg, width=px_w)
    frame.pack_propagate(False)
    frame.pack(side="left", padx=(lpad, 0), fill="y")

    label = tk.Label(
        frame,
        text=text,
        font=font,
        bg=bg,
        fg=fg,
        anchor=anchor,
    )
    label.pack(fill="both", expand=True)

    return label


# ──────────────────────────────────────────────────────────────────────────────
# Main UI class
# ──────────────────────────────────────────────────────────────────────────────

class AttendanceUI:
    def __init__(self):
        self._q: queue.Queue = queue.Queue()
        self._rows: list = []
        self._row_idx: int = 0
        self._reader_detecting: bool = False
        self._backend_thread: Optional[threading.Thread] = None

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

    # ──────────────────────────────────────────
    # Fonts
    # ──────────────────────────────────────────

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

    # ──────────────────────────────────────────
    # Layout
    # ──────────────────────────────────────────

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
        bar = tk.Frame(self.root, bg=C_BG)
        bar.pack(fill="x")

        _cell(bar, "#", 0, C_BG, C_TEXT_3, self.fnt_dim, anchor="e")
        _cell(bar, "TIME", 1, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "LVL", 2, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "TAG", 3, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "UID", 4, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "ACTION", 5, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "MESSAGE", 6, C_BG, C_TEXT_3, self.fnt_dim, right_pad=12)

        bar.configure(pady=4)

    def _build_log_area(self):
        wrapper = tk.Frame(self.root, bg=C_BG)
        wrapper.pack(fill="both", expand=True)

        self._scroller = _Scroller(wrapper, bg=C_BG)
        self._scroller.pack(fill="both", expand=True)

    def _build_footer(self):
        _Sep(self.root, color=C_BORDER)

        bar = tk.Frame(self.root, bg=C_SURFACE, height=30)
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
        checkbox.pack(side="left", padx=14, pady=4)

        tk.Button(
            bar,
            text="CLEAR LOG",
            font=self.fnt_badge,
            bg=C_RAISED,
            fg=C_AMBER,
            bd=0,
            padx=12,
            pady=0,
            activebackground=C_BORDER,
            activeforeground=C_AMBER,
            cursor="hand2",
            relief="flat",
            command=self._clear,
        ).pack(side="right", padx=14, pady=4)

    # ──────────────────────────────────────────
    # Clock
    # ──────────────────────────────────────────

    def _tick_clock(self):
        self._clock_var.set(datetime.now().strftime("%Y-%m-%d   %H:%M:%S"))
        self.root.after(1000, self._tick_clock)

    # ──────────────────────────────────────────
    # Queue pump
    # ──────────────────────────────────────────

    def _pump(self):
        try:
            while True:
                self._handle(self._q.get_nowait())
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

    # ──────────────────────────────────────────
    # Row renderer
    # ──────────────────────────────────────────

    def _append(self, msg: dict):
        level = msg.get("level", "INFO")
        tag = msg.get("tag", "")
        text = msg.get("text", "")
        ts = msg.get("timestamp", "")
        uid = msg.get("uid", "")
        action = msg.get("action", "")

        color, abbrev = LEVEL_META.get(level, (C_SLATE, "???"))
        row_bg = C_BG if self._row_idx % 2 == 0 else C_SURFACE

        row = tk.Frame(self._scroller.inner, bg=row_bg, pady=1)
        row.pack(fill="x")

        _cell(row, f"{self._row_idx + 1}", 0, row_bg, C_TEXT_3, self.fnt_log, anchor="e")
        _cell(row, ts, 1, row_bg, C_TEXT_3, self.fnt_log)
        _cell(row, abbrev, 2, row_bg, color, self.fnt_badge)
        _cell(row, tag[:8] if tag else "", 3, row_bg, C_SLATE, self.fnt_log)
        _cell(row, uid[:10] if uid else "", 4, row_bg, C_TEXT_3, self.fnt_log)

        _, px_w, lpad = COLS[5]

        action_frame = tk.Frame(row, bg=row_bg, width=px_w)
        action_frame.pack_propagate(False)
        action_frame.pack(side="left", padx=(lpad, 0), fill="y")

        if action:
            action_color = C_GREEN if action == "TIME_IN" else C_TEAL

            pill = tk.Label(
                action_frame,
                text=action,
                font=self.fnt_badge,
                bg=C_RAISED,
                fg=action_color,
                padx=4,
                pady=1,
            )
            pill.place(relx=0.0, rely=0.5, anchor="w")

        msg_fg = color if level in ("ERROR", "WARN") else C_TEXT_1
        _cell(row, text, 6, row_bg, msg_fg, self.fnt_log, right_pad=12)

        tk.Frame(self._scroller.inner, bg=C_BORDER, height=1).pack(fill="x")

        self._rows.append(row)
        self._row_idx += 1
        self._count_var.set(str(self._row_idx))

        if len(self._rows) > MAX_ROWS:
            old_row = self._rows.pop(0)
            old_row.destroy()

        if self._autoscroll.get():
            self._scroller.to_bottom()

    # ──────────────────────────────────────────
    # Status updates
    # ──────────────────────────────────────────

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

    # ──────────────────────────────────────────
    # Hardware watcher callbacks
    # ──────────────────────────────────────────

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
        for widget in list(self._scroller.inner.winfo_children()):
            widget.destroy()

        self._rows.clear()
        self._row_idx = 0
        self._count_var.set("0")

    # ──────────────────────────────────────────
    # Public thread-safe API
    # ──────────────────────────────────────────

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
            name = text.split("connected:")[-1].strip() if "connected:" in text else ""
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

    # ──────────────────────────────────────────
    # Backend runner
    # ──────────────────────────────────────────

    def _run_backend_safely(self, backend_start_fn):
        """
        Run backend in a protected daemon thread.

        This prevents backend exceptions from being hidden behind Tkinter mainloop.
        Any crash will be printed in the terminal and also posted to the UI log.
        """
        try:
            self.post_system("Backend thread starting...")
            backend_start_fn()

        except Exception as exc:
            error_text = f"Backend crashed: {exc}"
            full_traceback = traceback.format_exc()

            print()
            print("=" * 80)
            print("[BACKEND THREAD ERROR]")
            print(full_traceback)
            print("=" * 80)
            print()

            self.post_log("ERROR", "BACKEND", error_text)

            traceback_lines = full_traceback.strip().splitlines()

            for line in traceback_lines[-12:]:
                self.post_log("ERROR", "TRACE", line[:180])

        finally:
            self.post_system("Backend thread stopped.")

    # ──────────────────────────────────────────
    # Launch
    # ──────────────────────────────────────────

    def launch(self, backend_start_fn=None):
        """
        Start the tkinter main loop.

        The UI runs on the main thread.
        The RFID backend runs in a protected daemon thread.
        """
        if backend_start_fn:
            self._backend_thread = threading.Thread(
                target=self._run_backend_safely,
                args=(backend_start_fn,),
                daemon=True,
                name="AttendanceBackendThread",
            )
            self._backend_thread.start()

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        try:
            self.root.mainloop()

        except KeyboardInterrupt:
            print()
            print("CTRL + C detected. Closing UI safely...")
            self._on_close()

        except Exception as error:
            print()
            print("=" * 80)
            print("[UI MAINLOOP ERROR]")
            print(traceback.format_exc())
            print("=" * 80)

            try:
                self.post_log("ERROR", "UI", f"UI crashed: {error}")
            except Exception:
                pass

            self._on_close()

    def _on_close(self):
        try:
            self._watcher.stop()
        except Exception as exc:
            print(f"[UI CLOSE ERROR] Failed to stop watcher: {exc}")

        try:
            if self.root.winfo_exists():
                self.root.quit()
                self.root.destroy()
        except Exception as exc:
            print(f"[UI CLOSE ERROR] Failed to destroy window: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# Demo
# ──────────────────────────────────────────────────────────────────────────────

def _demo():
    import time

    ui = AttendanceUI()

    def _feed():
        time.sleep(2.0)

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
            (
                True,
                "11223344",
                "TIME_IN",
                "Time In recorded for Dela Torre, Ana R.",
            ),
            (
                False,
                "FFFF0001",
                None,
                "Database lookup failed for RFID UID: FFFF0001",
            ),
            (
                True,
                "AABBCCDD",
                "TIME_IN",
                "Time In recorded for Villanueva, Marco S.",
            ),
        ]

        for ok, uid, action, message in scans:
            time.sleep(1.1)
            ui.post_event(
                success=ok,
                text=message,
                uid=uid,
                action=action,
            )

        time.sleep(0.9)
        ui.post_log("WARN", "BUFFER", "RFID UID buffer insert latency > 200ms")

        time.sleep(0.4)
        ui.post_log("INFO", "DB", "Connection pool: 2/10 active")

        time.sleep(0.4)
        ui.post_log(
            "ERROR",
            "DB",
            "Failed to save scan log. UID=CAFE1234, Error=timeout",
        )

    threading.Thread(target=_feed, daemon=True).start()
    ui.launch()


if __name__ == "__main__":
    _demo()