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
from typing import Optional, Set


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
# Column layout — single source of truth used by BOTH header and rows.
#
# Each entry: (header_text, pixel_width, left_pad)
#   pixel_width  — exact px width of the containing Frame; a Label is placed
#                  inside so it never stretches the column beyond this width.
#                  0 means the column expands to fill remaining space.
#   left_pad     — px gap to the left of this column.
# ──────────────────────────────────────────────────────────────────────────────

COLS = [
    # name       px-w  lpad
    ("#",         36,   10),   # 0  line number
    ("TIME",      62,    8),   # 1  HH:MM:SS
    ("LVL",       26,    8),   # 2  OK / ERR / …
    ("TAG",       54,    8),   # 3  tag string
    ("UID",       70,    8),   # 4  uid string
    ("ACTION",    72,    8),   # 5  TIME_IN / TIME_OUT badge
    ("MESSAGE",    0,   10),   # 6  fills remainder (width=0 → expand)
]


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
# Hardware reader watcher — runs in a daemon thread, pushes state changes
# into AttendanceUI's queue via the same post_system() / post_log() calls.
#
# Strategy (in order of preference):
#   1. pyscard  (pip install pyscard)  — PC/SC, works on Windows/macOS/Linux.
#      Gives us real reader names and reliable connect/disconnect events.
#   2. Fallback message telling the operator to install pyscard.
#
# The watcher is completely independent of the backend; it starts as soon as
# AttendanceUI.__init__() completes so hotplug feedback works even in demo
# mode with no backend attached.
# ──────────────────────────────────────────────────────────────────────────────

class _ReaderWatcher:
    """
    Polls PC/SC for reader changes every POLL_MS milliseconds.
    Fires callbacks on the UI queue when readers appear or disappear.
    Thread-safe: all public methods may be called from any thread.
    """

    POLL_MS   = 800   # how often to poll (milliseconds → seconds internally)
    _STOP_EV  = threading.Event

    def __init__(self, on_connected, on_disconnected, on_no_pcsc, on_log):
        """
        on_connected(name)   — called when a new reader is detected.
        on_disconnected(name)— called when a previously seen reader vanishes.
        on_no_pcsc()         — called once if pyscard is not installed.
        on_log(level, tag, text) — generic log forwarder.
        """
        self._on_connected    = on_connected
        self._on_disconnected = on_disconnected
        self._on_no_pcsc      = on_no_pcsc
        self._on_log          = on_log
        self._stop            = threading.Event()
        self._known: Set[str] = set()   # readers seen in last successful poll

    def start(self):
        t = threading.Thread(target=self._run, daemon=True, name="ReaderWatcher")
        t.start()

    def stop(self):
        self._stop.set()

    # ── internal ──────────────────────────────────────────────────────────────

    def _run(self):
        # Try to import pyscard
        try:
            from smartcard.System import readers as sc_readers
            from smartcard.Exceptions import CardConnectionException
        except ImportError:
            self._on_no_pcsc()
            return

        # PC/SC available — enter poll loop
        pcsc_error_logged = False

        while not self._stop.is_set():
            try:
                current: Set[str] = {str(r) for r in sc_readers()}
                pcsc_error_logged = False   # reset on success

                appeared  = current - self._known
                vanished  = self._known - current

                for name in sorted(appeared):
                    self._known.add(name)
                    self._on_connected(name)

                for name in sorted(vanished):
                    self._known.discard(name)
                    self._on_disconnected(name)

            except Exception as exc:
                # PC/SC daemon not running, permission error, etc.
                if not pcsc_error_logged:
                    self._on_log("WARN", "PCSC",
                                 f"PC/SC subsystem error: {exc}")
                    pcsc_error_logged = True
                # If we had readers tracked, consider them all gone
                for name in sorted(self._known):
                    self._on_disconnected(name)
                self._known.clear()

            self._stop.wait(self.POLL_MS / 1000)


# ──────────────────────────────────────────────────────────────────────────────
# Column cell helpers — shared by header and row renderers
#
# FIX: tk.Label's `width` option is in CHARACTER units, not pixels.
# We wrap every fixed-width cell in a Frame sized in pixels (via pack with
# a fixed width and pack_propagate=False), then place the Label inside it.
# The last column (px_w == 0) still uses a plain Label with expand=True.
# ──────────────────────────────────────────────────────────────────────────────

def _cell(parent, text, col_idx, bg, fg, font, anchor="w", right_pad=0):
    """
    Pack a fixed-pixel-width cell for column col_idx.
    Uses COLS[col_idx] for (px_width, left_pad).
    The last column (width=0) expands to fill remaining space.
    """
    _, px_w, lpad = COLS[col_idx]
    is_last = (px_w == 0)

    if is_last:
        # Expanding message column — plain Label, no wrapper needed
        lbl = tk.Label(parent, text=text, font=font, bg=bg, fg=fg, anchor=anchor)
        lbl.pack(side="left", padx=(lpad, right_pad), fill="x", expand=True)
        return lbl
    else:
        # Fixed-width column — Frame enforces pixel width; fill="y" so it
        # inherits the row's height and the label inside remains visible.
        frame = tk.Frame(parent, bg=bg, width=px_w)
        frame.pack_propagate(False)          # prevent Label from resizing frame
        frame.pack(side="left", padx=(lpad, 0), fill="y")

        lbl = tk.Label(frame, text=text, font=font, bg=bg, fg=fg, anchor=anchor)
        lbl.pack(fill="both", expand=True)
        return lbl


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

        # Start hardware watcher — fires callbacks that enqueue UI updates.
        # Runs independently of any backend; hotplug works in standalone demo.
        self._watcher = _ReaderWatcher(
            on_connected    = self._on_reader_connected,
            on_disconnected = self._on_reader_disconnected,
            on_no_pcsc      = self._on_no_pcsc,
            on_log          = self.post_log,
        )
        self._watcher.start()

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

        self._reader_dot = _PulseDot(inner)
        self._reader_dot.pack(side="left", pady=10, padx=(0, 7))

        self._reader_var = tk.StringVar(value="READER  ·  detecting...")
        tk.Label(inner, textvariable=self._reader_var,
                 font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        _VLine(bar, color=C_BORDER)

        mid = tk.Frame(bar, bg=C_SURFACE)
        mid.pack(side="left", fill="y", padx=18)

        self._scan_dot = tk.Label(mid, text="●", font=self.fnt_label,
                                  bg=C_SURFACE, fg=C_TEXT_3, padx=0)
        self._scan_dot.pack(side="left", padx=(0, 6), pady=10)

        tk.Label(mid, text="LAST SCAN  ·", font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_3).pack(side="left", padx=(0, 6))

        self._scan_var = tk.StringVar(value="awaiting first tap")
        tk.Label(mid, textvariable=self._scan_var,
                 font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        right = tk.Frame(bar, bg=C_SURFACE)
        right.pack(side="right", padx=18)

        self._count_var = tk.StringVar(value="0")
        tk.Label(right, textvariable=self._count_var,
                 font=self.fnt_logb, bg=C_SURFACE, fg=C_TEXT_2).pack(side="right")
        tk.Label(right, text="entries  ",
                 font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_3).pack(side="right")

    # ── Log column header ────────────────────────

    def _build_log_header(self):
        """
        Header row — uses the exact same COLS pixel widths and paddings
        as each data row so the columns are guaranteed to align.
        """
        bar = tk.Frame(self.root, bg=C_BG)
        bar.pack(fill="x")

        # col 0: # — right-aligned
        _cell(bar, "#",       0, C_BG, C_TEXT_3, self.fnt_dim, anchor="e")
        _cell(bar, "TIME",    1, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "LVL",     2, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "TAG",     3, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "UID",     4, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "ACTION",  5, C_BG, C_TEXT_3, self.fnt_dim)
        _cell(bar, "MESSAGE", 6, C_BG, C_TEXT_3, self.fnt_dim, right_pad=12)

        bar.configure(pady=4)

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

        row_bg = C_BG if self._row_idx % 2 == 0 else C_SURFACE

        row = tk.Frame(self._scroller.inner, bg=row_bg, pady=1)
        row.pack(fill="x")

        # col 0 — line number, right-aligned
        _cell(row, f"{self._row_idx + 1}", 0, row_bg, C_TEXT_3,
              self.fnt_log, anchor="e")

        # col 1 — timestamp
        _cell(row, ts, 1, row_bg, C_TEXT_3, self.fnt_log)

        # col 2 — level badge (coloured, bold)
        _cell(row, abbrev, 2, row_bg, color, self.fnt_badge)

        # col 3 — tag
        _cell(row, tag[:8] if tag else "", 3, row_bg, C_SLATE, self.fnt_log)

        # col 4 — uid
        _cell(row, uid[:10] if uid else "", 4, row_bg, C_TEXT_3, self.fnt_log)

        # col 5 — action pill inside a fixed-width Frame
        _, px_w, lpad = COLS[5]
        action_frame = tk.Frame(row, bg=row_bg, width=px_w)
        action_frame.pack_propagate(False)
        action_frame.pack(side="left", padx=(lpad, 0), fill="y")
        if action:
            a_color = C_GREEN if action == "TIME_IN" else C_TEAL
            pill = tk.Label(action_frame, text=action, font=self.fnt_badge,
                            bg=C_RAISED, fg=a_color, padx=4, pady=1)
            pill.place(relx=0.0, rely=0.5, anchor="w")

        # col 6 — message, expands
        msg_fg = color if level in ("ERROR", "WARN") else C_TEXT_1
        _cell(row, text, 6, row_bg, msg_fg, self.fnt_log, right_pad=12)

        # thin row separator
        tk.Frame(self._scroller.inner, bg=C_BORDER, height=1).pack(fill="x")

        self._rows.append(row)
        self._row_idx += 1
        self._count_var.set(str(self._row_idx))

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
        state = msg.get("state", "detecting")
        name  = msg.get("name", "")

        if state == "detecting":
            self._reader_var.set("READER  ·  detecting...")
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()
        elif state == "connected":
            label = f"READER  ·  {name}" if name else "READER  ·  connected"
            self._reader_var.set(label[:60])
            self._reader_dot.stop_pulse(C_GREEN)
        elif state == "disconnected":
            # Show which reader left; revert to detecting
            label = f"READER  ·  disconnected ({name})" if name else "READER  ·  disconnected"
            self._reader_var.set((label + "  —  detecting...")[:60])
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()

    # ──────────────────────────────────────────
    # Hardware watcher callbacks (called from watcher thread → thread-safe
    # because they only push to self._q, never touch Tk widgets directly)
    # ──────────────────────────────────────────

    def _on_reader_connected(self, name: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({"kind": "reader", "state": "connected", "name": name})
        self._q.put({
            "kind": "row",
            "level": "SYSTEM",
            "tag": "HOTPLUG",
            "text": f"Reader connected: {name}",
            "uid": "", "action": "", "timestamp": ts,
        })

    def _on_reader_disconnected(self, name: str):
        ts = datetime.now().strftime("%H:%M:%S")
        # Only switch to "detecting" state if no other readers remain known
        self._q.put({"kind": "reader", "state": "disconnected", "name": name})
        self._q.put({
            "kind": "row",
            "level": "WARN",
            "tag": "HOTPLUG",
            "text": f"Reader disconnected: {name}",
            "uid": "", "action": "", "timestamp": ts,
        })

    def _on_no_pcsc(self):
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({
            "kind": "row",
            "level": "WARN",
            "tag": "PCSC",
            "text": "pyscard not installed — install with: pip install pyscard",
            "uid": "", "action": "", "timestamp": ts,
        })
        # Leave reader indicator in its initial "detecting" state

    def _clear(self):
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
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.mainloop()

    def _on_close(self):
        self._watcher.stop()
        self.root.destroy()


# ──────────────────────────────────────────────────────────────────────────────
# Demo
# ──────────────────────────────────────────────────────────────────────────────

def _demo():
    """
    Feeds simulated RFID scan events so the UI can be tested without
    a live backend.  Reader connect/disconnect feedback now comes from
    the _ReaderWatcher thread watching your actual PC/SC subsystem —
    plug or unplug a reader while the demo is running to see it live.
    """
    import time

    ui = AttendanceUI()

    def _feed():
        # Give the watcher a moment to report the initial reader state
        time.sleep(2.0)

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

    threading.Thread(target=_feed, daemon=True).start()
    ui.launch()


if __name__ == "__main__":
    _demo()