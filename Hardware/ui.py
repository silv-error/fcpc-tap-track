"""
attendance_ui.py

Server-side debug monitor for the RFID Attendance System.
Industrial control-panel aesthetic — clean, dense, professional.

Standalone demo:  python attendance_ui.py
Backend usage:    ui.launch(backend_start_fn=backend.run)
"""

import queue
import threading
import tkinter as tk
from tkinter import font as tkfont
from datetime import datetime
from typing import Optional


# ──────────────────────────────────────────────────────────────────────────────
# Design tokens
# ──────────────────────────────────────────────────────────────────────────────

# Base surfaces
C_BG        = "#0e1015"   # deepest background
C_SURFACE   = "#14171f"   # panel surface
C_RAISED    = "#1c2030"   # slightly lifted element
C_BORDER    = "#262c3e"   # subtle rule
C_BORDER_HI = "#3a4260"   # prominent rule / divider

# Accent palette — one per semantic meaning, used sparingly
C_TEAL      = "#00c9a7"   # primary brand / ready state
C_BLUE      = "#3d8ef0"   # INFO
C_GREEN     = "#2ecc71"   # SUCCESS / TIME_IN
C_AMBER     = "#e6a817"   # WARN / TIME_OUT
C_RED       = "#e05252"   # ERROR
C_SLATE     = "#4e5a78"   # SYSTEM / dim accent

# Text hierarchy
C_TEXT_1    = "#dde3f0"   # primary content
C_TEXT_2    = "#7b87a8"   # secondary / labels
C_TEXT_3    = "#3f4d6a"   # dim / decorative

# Fonts  — Consolas > Courier New fallback (both ship with Windows/Mac/Linux)
F_MONO      = "Consolas"
F_FALLBACK  = "Courier New"

SZ_TITLE    = 13
SZ_LABEL    = 8
SZ_LOG      = 9
SZ_BADGE    = 8
SZ_CLOCK    = 9

MAX_ROWS    = 600

LEVEL_META = {
    #  level      colour    abbrev
    "SUCCESS": (C_GREEN,  "OK "),
    "ERROR":   (C_RED,    "ERR"),
    "WARN":    (C_AMBER,  "WRN"),
    "INFO":    (C_BLUE,   "INF"),
    "SYSTEM":  (C_SLATE,  "SYS"),
}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _mono(size: int, bold: bool = False) -> tuple:
    """Return (family, size, weight) tuple for tkfont.Font."""
    return (F_MONO, size, "bold" if bold else "normal")


class _Sep(tk.Frame):
    """1-pixel horizontal rule."""
    def __init__(self, parent, color=C_BORDER, **kw):
        super().__init__(parent, bg=color, height=1, **kw)
        self.pack(fill="x")


class _VLine(tk.Frame):
    """1-pixel vertical rule."""
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
            self, orient="vertical", command=self._cv.yview,
            bg=C_SURFACE, troughcolor=C_BG,
            activebackground=C_TEAL, width=10,
        )
        self._inner = tk.Frame(self._cv, bg=bg)

        self._inner.bind("<Configure>", lambda _: self._cv.configure(
            scrollregion=self._cv.bbox("all")))
        self._wid = self._cv.create_window((0, 0), window=self._inner, anchor="nw")
        self._cv.configure(yscrollcommand=self._sb.set)

        self._cv.pack(side="left", fill="both", expand=True)
        self._sb.pack(side="right", fill="y")

        self._cv.bind("<Configure>",
                      lambda e: self._cv.itemconfig(self._wid, width=e.width))
        for w in (self._inner, self._cv):
            w.bind("<MouseWheel>",
                   lambda e: self._cv.yview_scroll(int(-1*(e.delta/120)), "units"))

    @property
    def inner(self):
        return self._inner

    def to_bottom(self):
        self._cv.yview_moveto(1.0)


# ──────────────────────────────────────────────────────────────────────────────
# Pulsing dot widget
# ──────────────────────────────────────────────────────────────────────────────

class _PulseDot(tk.Canvas):
    """A small canvas dot that pulses when active."""

    RADIUS = 5

    def __init__(self, parent, **kw):
        size = self.RADIUS * 2 + 2
        super().__init__(parent, width=size, height=size,
                         bg=C_SURFACE, highlightthickness=0, **kw)
        self._dot = self.create_oval(1, 1, size - 1, size - 1,
                                     fill=C_SLATE, outline="")
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
        self.itemconfig(self._dot,
                        fill=self._color if self._pulse_state else C_BORDER)
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
# Main UI class
# ──────────────────────────────────────────────────────────────────────────────

class AttendanceUI:
    """
    Professional debug monitor window for the RFID attendance system.

    Thread-safe public API
    ──────────────────────
    post_event(success, text, uid, action)   RFID scan result
    post_system(text)                         reader / system message
    post_log(level, tag, text)                generic levelled line
    launch(backend_start_fn=None)             start mainloop (blocks)
    """

    def __init__(self):
        self._q: queue.Queue = queue.Queue()
        self._rows: list = []
        self._row_idx: int = 0
        self._reader_detecting: bool = False   # tracks "Detecting…" state

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

    # ──────────────────────────────────────────
    # Fonts
    # ──────────────────────────────────────────

    def _build_fonts(self):
        def f(size, bold=False):
            w = "bold" if bold else "normal"
            try:
                return tkfont.Font(family=F_MONO, size=size, weight=w)
            except Exception:
                return tkfont.Font(family=F_FALLBACK, size=size, weight=w)

        self.fnt_title  = f(SZ_TITLE, bold=True)
        self.fnt_label  = f(SZ_LABEL, bold=True)
        self.fnt_log    = f(SZ_LOG)
        self.fnt_logb   = f(SZ_LOG, bold=True)
        self.fnt_badge  = f(SZ_BADGE, bold=True)
        self.fnt_clock  = f(SZ_CLOCK)
        self.fnt_dim    = f(SZ_LABEL)

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

    # ── Header ──────────────────────────────────

    def _build_header(self):
        bar = tk.Frame(self.root, bg=C_SURFACE)
        bar.pack(fill="x")

        left = tk.Frame(bar, bg=C_SURFACE)
        left.pack(side="left", padx=(18, 0), pady=10)

        # small decorative mark
        tk.Label(left, text="▪", font=self.fnt_label,
                 bg=C_SURFACE, fg=C_TEAL).pack(side="left", padx=(0, 6))

        tk.Label(left, text="RFID ATTENDANCE", font=self.fnt_title,
                 bg=C_SURFACE, fg=C_TEXT_1).pack(side="left")

        tk.Label(left, text="  DEBUG MONITOR", font=self.fnt_title,
                 bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        right = tk.Frame(bar, bg=C_SURFACE)
        right.pack(side="right", padx=18, pady=10)

        self._clock_var = tk.StringVar()
        tk.Label(right, textvariable=self._clock_var,
                 font=self.fnt_clock, bg=C_SURFACE, fg=C_TEXT_3).pack()
        self._tick_clock()

    # ── Status bar ──────────────────────────────

    def _build_status_bar(self):
        bar = tk.Frame(self.root, bg=C_SURFACE, height=38)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        inner = tk.Frame(bar, bg=C_SURFACE)
        inner.pack(side="left", fill="y", padx=18)

        # reader state section
        self._reader_dot = _PulseDot(inner)
        self._reader_dot.pack(side="left", pady=10, padx=(0, 7))

        self._reader_var = tk.StringVar(value="READER  ·  detecting...")
        tk.Label(inner, textvariable=self._reader_var,
                 font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        # vertical divider
        _VLine(bar, color=C_BORDER)

        mid = tk.Frame(bar, bg=C_SURFACE)
        mid.pack(side="left", fill="y", padx=18)

        # last scan result
        self._scan_dot = tk.Label(mid, text="●", font=self.fnt_label,
                                  bg=C_SURFACE, fg=C_TEXT_3, padx=0)
        self._scan_dot.pack(side="left", padx=(0, 6), pady=10)

        tk.Label(mid, text="LAST SCAN  ·", font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_3).pack(side="left", padx=(0, 6))

        self._scan_var = tk.StringVar(value="awaiting first tap")
        tk.Label(mid, textvariable=self._scan_var,
                 font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        # right side: entry count
        right = tk.Frame(bar, bg=C_SURFACE)
        right.pack(side="right", padx=18)

        self._count_var = tk.StringVar(value="0")
        tk.Label(right, textvariable=self._count_var,
                 font=self.fnt_logb, bg=C_SURFACE, fg=C_TEXT_2).pack(side="right")
        tk.Label(right, text="entries  ",
                 font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_3).pack(side="right")

    # ── Log column header ────────────────────────

    def _build_log_header(self):
        bar = tk.Frame(self.root, bg=C_BG)
        bar.pack(fill="x")

        cols = [
            ("  #",    4,  C_TEXT_3, "e"),
            ("TIME",   9,  C_TEXT_3, "w"),
            ("LVL",    5,  C_TEXT_3, "w"),
            ("TAG",    10, C_TEXT_3, "w"),
            ("UID",    10, C_TEXT_3, "w"),
            ("ACTION", 9,  C_TEXT_3, "w"),
            ("MESSAGE", 0, C_TEXT_3, "w"),
        ]

        padx_left = 14
        for i, (name, width, color, anchor) in enumerate(cols):
            px = (padx_left, 0) if i == 0 else (8, 0)
            kw = dict(font=self.fnt_dim, bg=C_BG, fg=color,
                      anchor=anchor, pady=4)
            if width:
                kw["width"] = width
            lbl = tk.Label(bar, text=name, **kw)
            lbl.pack(side="left", padx=px)

    # ── Log area ────────────────────────────────

    def _build_log_area(self):
        wrapper = tk.Frame(self.root, bg=C_BG)
        wrapper.pack(fill="both", expand=True)

        self._scroller = _Scroller(wrapper, bg=C_BG)
        self._scroller.pack(fill="both", expand=True)

    # ── Footer ──────────────────────────────────

    def _build_footer(self):
        _Sep(self.root, color=C_BORDER)
        bar = tk.Frame(self.root, bg=C_SURFACE, height=30)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        self._autoscroll = tk.BooleanVar(value=True)
        cb = tk.Checkbutton(
            bar, text="Auto-scroll", variable=self._autoscroll,
            font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_2,
            selectcolor=C_RAISED, activebackground=C_SURFACE,
            activeforeground=C_TEXT_1, bd=0, cursor="hand2",
        )
        cb.pack(side="left", padx=14, pady=4)

        tk.Button(
            bar, text="CLEAR LOG", font=self.fnt_badge,
            bg=C_RAISED, fg=C_AMBER, bd=0,
            padx=12, pady=0,
            activebackground=C_BORDER, activeforeground=C_AMBER,
            cursor="hand2", relief="flat",
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
        kind = msg["kind"]
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
        level   = msg.get("level", "INFO")
        tag     = msg.get("tag", "")
        text    = msg.get("text", "")
        ts      = msg.get("timestamp", "")
        uid     = msg.get("uid", "")
        action  = msg.get("action", "")

        color, abbrev = LEVEL_META.get(level, (C_SLATE, "???"))

        # alternating row background
        row_bg = C_BG if self._row_idx % 2 == 0 else C_SURFACE

        row = tk.Frame(self._scroller.inner, bg=row_bg, pady=1)
        row.pack(fill="x")

        def lbl(text, width=0, fg=C_TEXT_2, bold=False, anchor="w", padx=(8, 0)):
            kw = dict(font=self.fnt_logb if bold else self.fnt_log,
                      bg=row_bg, fg=fg, anchor=anchor, pady=0)
            if width:
                kw["width"] = width
            tk.Label(row, text=text, **kw).pack(side="left", padx=padx)

        # line number
        lbl(f"{self._row_idx + 1:>5}", width=5, fg=C_TEXT_3,
            anchor="e", padx=(10, 0))

        # timestamp
        lbl(ts, width=9, fg=C_TEXT_3)

        # level abbreviation with colour
        tk.Label(row, text=abbrev, font=self.fnt_badge,
                 bg=row_bg, fg=color, width=4, anchor="w"
                 ).pack(side="left", padx=(8, 0))

        # tag
        lbl(f"{tag[:10]:<10}" if tag else " " * 10, width=10, fg=C_SLATE)

        # uid
        lbl(f"{uid[:10]:<10}" if uid else " " * 10, width=10, fg=C_TEXT_3)

        # action badge
        if action:
            a_color = C_GREEN if action == "TIME_IN" else C_TEAL
            tk.Label(row, text=action, font=self.fnt_badge,
                     bg=C_RAISED, fg=a_color,
                     padx=5, pady=1).pack(side="left", padx=(8, 0))
        else:
            tk.Label(row, text=" " * 9, font=self.fnt_log,
                     bg=row_bg).pack(side="left", padx=(8, 0))

        # message — fills remaining space
        msg_fg = color if level in ("ERROR", "WARN") else C_TEXT_1
        tk.Label(row, text=text, font=self.fnt_log,
                 bg=row_bg, fg=msg_fg, anchor="w"
                 ).pack(side="left", fill="x", expand=True, padx=(10, 12))

        # thin bottom separator every row
        tk.Frame(self._scroller.inner, bg=C_BORDER, height=1).pack(
            fill="x", padx=0)

        self._rows.append(row)
        self._row_idx += 1
        self._count_var.set(str(self._row_idx))

        # trim oldest
        if len(self._rows) > MAX_ROWS:
            self._rows.pop(0).destroy()

        if self._autoscroll.get():
            self._scroller.to_bottom()

    # ──────────────────────────────────────────
    # Status updates
    # ──────────────────────────────────────────

    def _update_scan_status(self, msg: dict):
        success = msg.get("success", True)
        text    = msg.get("text", "")
        self._scan_dot.configure(fg=C_GREEN if success else C_RED)
        self._scan_var.set(text[:80])

    def _update_reader_status(self, msg: dict):
        state = msg.get("state", "detecting")   # "detecting" | "connected" | "disconnected"

        if state == "detecting":
            self._reader_var.set("READER  ·  detecting...")
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()
        elif state == "connected":
            reader_name = msg.get("name", "")
            label = f"READER  ·  {reader_name}" if reader_name else "READER  ·  connected"
            self._reader_var.set(label[:60])
            self._reader_dot.stop_pulse(C_GREEN)
        elif state == "disconnected":
            self._reader_var.set("READER  ·  disconnected — detecting...")
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()

    def _clear(self):
        for r in self._rows:
            r.destroy()
        # also clear the separator frames
        for w in list(self._scroller.inner.winfo_children()):
            w.destroy()
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
        """Post an RFID scan result to the log."""
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({
            "kind": "row",
            "level": "SUCCESS" if success else "ERROR",
            "tag": "RFID",
            "text": text,
            "uid": uid,
            "action": action or "",
            "timestamp": ts,
        })
        self._q.put({
            "kind": "status",
            "success": success,
            "text": text,
        })

    def post_system(self, text: str):
        """Post a system/reader message. Automatically updates reader indicator."""
        ts = datetime.now().strftime("%H:%M:%S")

        # derive reader state from known message patterns
        tl = text.lower()
        if "detecting" in tl or "waiting" in tl:
            self._q.put({"kind": "reader", "state": "detecting"})
        elif "connected:" in tl:
            name = text.split("connected:")[-1].strip() if "connected:" in text else ""
            self._q.put({"kind": "reader", "state": "connected", "name": name})
        elif "disconnected" in tl:
            self._q.put({"kind": "reader", "state": "disconnected"})
        elif "ready" in tl:
            self._q.put({"kind": "reader", "state": "connected"})

        self._q.put({
            "kind": "row",
            "level": "SYSTEM",
            "tag": "SYSTEM",
            "text": text,
            "uid": "",
            "action": "",
            "timestamp": ts,
        })

    def post_log(self, level: str, tag: str, text: str):
        """Post a generic levelled debug line (INFO/WARN/ERROR/SUCCESS/SYSTEM)."""
        self._q.put({
            "kind": "row",
            "level": level.upper(),
            "tag": tag,
            "text": text,
            "uid": "",
            "action": "",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        })

    # ──────────────────────────────────────────
    # Launch
    # ──────────────────────────────────────────

    def launch(self, backend_start_fn=None):
        """
        Start the tkinter main loop (must be called from the main thread).
        Pass backend_start_fn to run it in a daemon thread alongside the UI.
        """
        if backend_start_fn:
            threading.Thread(target=backend_start_fn, daemon=True).start()
        self.root.mainloop()


# ──────────────────────────────────────────────────────────────────────────────
# Demo
# ──────────────────────────────────────────────────────────────────────────────

def _demo():
    import time

    ui = AttendanceUI()

    def _feed():
        time.sleep(0.5)
        ui.post_system("Detecting RFID reader...")
        time.sleep(1.8)
        ui.post_system("RFID reader connected: ACS ACR122U 00 00")
        ui.post_system("Ready. Tap NFC card.")
        time.sleep(0.6)

        scans = [
            (True,  "A1B2C3D4", "TIME_IN",  "Time In recorded for Santos, Juan dela Cruz."),
            (True,  "DEADBEEF", "TIME_IN",  "Time In recorded for Reyes, Maria Paz."),
            (False, "00000000", None,        "RFID UID is not registered: 00000000"),
            (True,  "CAFE1234", "TIME_OUT", "Time Out recorded for Santos, Juan dela Cruz."),
            (False, "BADA5510", None,        "Student is inactive: Lim, Carlo B."),
            (True,  "11223344", "TIME_IN",  "Time In recorded for Dela Torre, Ana R."),
            (False, "FFFF0001", None,        "Database lookup failed for RFID UID: FFFF0001"),
            (True,  "AABBCCDD", "TIME_IN",  "Time In recorded for Villanueva, Marco S."),
        ]

        for ok, uid, action, msg in scans:
            time.sleep(1.1)
            ui.post_event(success=ok, text=msg, uid=uid, action=action)

        time.sleep(0.9)
        ui.post_log("WARN",  "BUFFER", "RFID UID buffer insert latency > 200ms")
        time.sleep(0.4)
        ui.post_log("INFO",  "DB",     "Connection pool: 2/10 active")
        time.sleep(0.4)
        ui.post_log("ERROR", "DB",     "Failed to save scan log. UID=CAFE1234, Error=timeout")
        time.sleep(1.0)
        ui.post_system("RFID reader disconnected — detecting...")
        time.sleep(2.0)
        ui.post_system("RFID reader connected: ACS ACR122U 00 00")
        ui.post_system("Ready. Tap NFC card.")

    threading.Thread(target=_feed, daemon=True).start()
    ui.launch()


if __name__ == "__main__":
    _demo()