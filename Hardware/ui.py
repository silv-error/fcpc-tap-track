"""
attendance_ui.py

Desktop UI window for the RFID Attendance System.
Displays live scan feedback, attendance logs, and system status.

Run standalone:
    python attendance_ui.py

Or import and use AttendanceUI.launch() from your backend.
"""

import queue
import threading
import tkinter as tk
from tkinter import font as tkfont
from datetime import datetime
from typing import Optional


# ─────────────────────────────────────────────
# Palette & constants
# ─────────────────────────────────────────────
BG          = "#0d0f14"
BG_PANEL    = "#13161e"
BG_CARD     = "#1a1d27"
BG_INPUT    = "#0f1118"
BORDER      = "#252836"

ACCENT_CYAN  = "#00e5c3"
ACCENT_BLUE  = "#4d9fff"
ACCENT_GREEN = "#39d98a"
ACCENT_RED   = "#ff5c5c"
ACCENT_AMBER = "#ffb347"

FG_PRIMARY   = "#e8ecf4"
FG_SECONDARY = "#7a8299"
FG_DIM       = "#3e4460"

MONO_FONT    = "Courier New"
TITLE_SIZE   = 18
LABEL_SIZE   = 9
LOG_SIZE     = 10
STATUS_SIZE  = 11

MAX_EVENTS   = 200   # max rows kept in the live event feed
MAX_LOGS     = 100   # max rows kept in the attendance log


class _ScrollableFrame(tk.Frame):
    """A vertically-scrollable container."""

    def __init__(self, parent, bg=BG_PANEL, **kw):
        super().__init__(parent, bg=bg, **kw)

        self._canvas = tk.Canvas(self, bg=bg, highlightthickness=0, bd=0)
        self._scrollbar = tk.Scrollbar(self, orient="vertical",
                                       command=self._canvas.yview,
                                       bg=BG_PANEL, troughcolor=BG,
                                       activebackground=ACCENT_CYAN)
        self._inner = tk.Frame(self._canvas, bg=bg)

        self._inner.bind("<Configure>", self._on_configure)
        self._win_id = self._canvas.create_window(
            (0, 0), window=self._inner, anchor="nw"
        )
        self._canvas.configure(yscrollcommand=self._scrollbar.set)

        self._canvas.pack(side="left", fill="both", expand=True)
        self._scrollbar.pack(side="right", fill="y")

        self._canvas.bind("<Configure>", self._on_canvas_resize)
        self._inner.bind("<MouseWheel>", self._on_mousewheel)
        self._canvas.bind("<MouseWheel>", self._on_mousewheel)

    def _on_configure(self, _event=None):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    def _on_canvas_resize(self, event):
        self._canvas.itemconfig(self._win_id, width=event.width)

    def _on_mousewheel(self, event):
        self._canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    @property
    def inner(self):
        return self._inner

    def scroll_to_bottom(self):
        self._canvas.yview_moveto(1.0)


# ─────────────────────────────────────────────
# Main UI class
# ─────────────────────────────────────────────
class AttendanceUI:
    """
    Standalone desktop window for the RFID attendance system.

    Thread-safe: call post_event() and post_attendance() from any thread.
    """

    def __init__(self):
        self._queue: queue.Queue = queue.Queue()

        self.root = tk.Tk()
        self.root.title("RFID Attendance Monitor")
        self.root.geometry("1100x700")
        self.root.minsize(900, 580)
        self.root.configure(bg=BG)

        # ── try to set a nice window icon (ignore if unavailable) ──
        try:
            self.root.iconbitmap(default="")
        except Exception:
            pass

        self._build_fonts()
        self._build_ui()
        self._pump()   # start queue polling

    # ─────────────────────────────────────────
    # Fonts
    # ─────────────────────────────────────────
    def _build_fonts(self):
        self.f_title    = tkfont.Font(family=MONO_FONT, size=TITLE_SIZE, weight="bold")
        self.f_label    = tkfont.Font(family=MONO_FONT, size=LABEL_SIZE, weight="bold")
        self.f_log      = tkfont.Font(family=MONO_FONT, size=LOG_SIZE)
        self.f_log_bold = tkfont.Font(family=MONO_FONT, size=LOG_SIZE, weight="bold")
        self.f_status   = tkfont.Font(family=MONO_FONT, size=STATUS_SIZE, weight="bold")
        self.f_dim      = tkfont.Font(family=MONO_FONT, size=LABEL_SIZE)

    # ─────────────────────────────────────────
    # Layout
    # ─────────────────────────────────────────
    def _build_ui(self):
        # ── top header bar ──────────────────────────────────────────
        header = tk.Frame(self.root, bg=BG_PANEL,
                          highlightbackground=BORDER, highlightthickness=1)
        header.pack(fill="x", padx=0, pady=0)

        tk.Label(header, text="◈  RFID ATTENDANCE MONITOR",
                 font=self.f_title, bg=BG_PANEL, fg=ACCENT_CYAN,
                 padx=20, pady=12).pack(side="left")

        self._clock_var = tk.StringVar()
        tk.Label(header, textvariable=self._clock_var,
                 font=self.f_label, bg=BG_PANEL, fg=FG_SECONDARY,
                 padx=20).pack(side="right", pady=12)
        self._tick_clock()

        # ── status bar (last scan result) ───────────────────────────
        status_bar = tk.Frame(self.root, bg=BG_CARD,
                              highlightbackground=BORDER, highlightthickness=1,
                              height=56)
        status_bar.pack(fill="x", padx=8, pady=(6, 0))
        status_bar.pack_propagate(False)

        self._status_dot   = tk.Label(status_bar, text="●", font=self.f_status,
                                      bg=BG_CARD, fg=FG_DIM, padx=14)
        self._status_dot.pack(side="left")

        self._status_label = tk.Label(status_bar, text="Waiting for RFID scan…",
                                      font=self.f_status, bg=BG_CARD,
                                      fg=FG_SECONDARY)
        self._status_label.pack(side="left")

        self._status_time  = tk.Label(status_bar, text="",
                                      font=self.f_dim, bg=BG_CARD,
                                      fg=FG_DIM, padx=14)
        self._status_time.pack(side="right")

        # ── main body (two columns) ──────────────────────────────────
        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True, padx=8, pady=8)
        body.columnconfigure(0, weight=6)
        body.columnconfigure(1, weight=4)
        body.rowconfigure(0, weight=1)

        # left: live event feed
        self._build_event_panel(body)
        # right: attendance log + stats
        self._build_right_panel(body)

    # ─────────────────────────────────────────
    # Left panel – live event feed
    # ─────────────────────────────────────────
    def _build_event_panel(self, parent):
        frame = tk.Frame(parent, bg=BG_PANEL,
                         highlightbackground=BORDER, highlightthickness=1)
        frame.grid(row=0, column=0, sticky="nsew", padx=(0, 4))

        hdr = tk.Frame(frame, bg=BG_CARD,
                       highlightbackground=BORDER, highlightthickness=1)
        hdr.pack(fill="x")
        tk.Label(hdr, text="LIVE EVENTS", font=self.f_label,
                 bg=BG_CARD, fg=ACCENT_BLUE, padx=12, pady=7).pack(side="left")
        self._event_count_var = tk.StringVar(value="0 events")
        tk.Label(hdr, textvariable=self._event_count_var, font=self.f_dim,
                 bg=BG_CARD, fg=FG_DIM, padx=12).pack(side="right")

        self._event_scroll = _ScrollableFrame(frame, bg=BG_PANEL)
        self._event_scroll.pack(fill="both", expand=True)

        self._event_rows = []
        self._event_count = 0

    # ─────────────────────────────────────────
    # Right panel – attendance log + counters
    # ─────────────────────────────────────────
    def _build_right_panel(self, parent):
        right = tk.Frame(parent, bg=BG)
        right.grid(row=0, column=1, sticky="nsew", padx=(4, 0))
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)

        # stat cards
        stats_frame = tk.Frame(right, bg=BG)
        stats_frame.grid(row=0, column=0, sticky="ew", pady=(0, 6))
        stats_frame.columnconfigure((0, 1, 2), weight=1)

        self._stat_total  = self._stat_card(stats_frame, "TOTAL",   "0", ACCENT_CYAN,  0)
        self._stat_in     = self._stat_card(stats_frame, "IN",      "0", ACCENT_GREEN, 1)
        self._stat_failed = self._stat_card(stats_frame, "FAILED",  "0", ACCENT_RED,   2)

        # attendance log
        log_frame = tk.Frame(right, bg=BG_PANEL,
                             highlightbackground=BORDER, highlightthickness=1)
        log_frame.grid(row=1, column=0, sticky="nsew")

        hdr = tk.Frame(log_frame, bg=BG_CARD,
                       highlightbackground=BORDER, highlightthickness=1)
        hdr.pack(fill="x")
        tk.Label(hdr, text="ATTENDANCE LOG", font=self.f_label,
                 bg=BG_CARD, fg=ACCENT_AMBER, padx=12, pady=7).pack(side="left")

        self._log_scroll = _ScrollableFrame(log_frame, bg=BG_PANEL)
        self._log_scroll.pack(fill="both", expand=True)

        self._log_rows   = []
        self._stat_vals  = {"total": 0, "in": 0, "failed": 0}

    def _stat_card(self, parent, title, value, color, col):
        card = tk.Frame(parent, bg=BG_CARD,
                        highlightbackground=color, highlightthickness=1)
        card.grid(row=0, column=col, padx=(0 if col == 0 else 4, 0), sticky="ew")

        tk.Label(card, text=title, font=self.f_dim,
                 bg=BG_CARD, fg=color, pady=4).pack()
        var = tk.StringVar(value=value)
        tk.Label(card, textvariable=var,
                 font=tkfont.Font(family=MONO_FONT, size=22, weight="bold"),
                 bg=BG_CARD, fg=FG_PRIMARY, pady=2).pack()

        return var

    # ─────────────────────────────────────────
    # Clock
    # ─────────────────────────────────────────
    def _tick_clock(self):
        self._clock_var.set(datetime.now().strftime("%Y-%m-%d  %H:%M:%S"))
        self.root.after(1000, self._tick_clock)

    # ─────────────────────────────────────────
    # Queue pump (thread-safe updates)
    # ─────────────────────────────────────────
    def _pump(self):
        try:
            while True:
                msg = self._queue.get_nowait()
                self._dispatch(msg)
        except queue.Empty:
            pass
        self.root.after(80, self._pump)

    def _dispatch(self, msg):
        kind = msg.get("kind")
        if kind == "event":
            self._add_event_row(msg)
        elif kind == "attendance":
            self._add_log_row(msg)
        elif kind == "status":
            self._set_status(msg)

    # ─────────────────────────────────────────
    # Internal renderers
    # ─────────────────────────────────────────
    def _add_event_row(self, msg):
        success   = msg.get("success", True)
        timestamp = msg.get("timestamp", datetime.now().strftime("%H:%M:%S"))
        uid       = msg.get("uid", "")
        text      = msg.get("text", "")
        action    = msg.get("action", "")

        color = ACCENT_GREEN if success else ACCENT_RED
        icon  = "▶" if success else "✕"

        row = tk.Frame(self._event_scroll.inner, bg=BG_PANEL,
                       highlightbackground=BG_CARD, highlightthickness=1)
        row.pack(fill="x", padx=4, pady=1)

        # icon
        tk.Label(row, text=icon, font=self.f_log_bold,
                 bg=BG_PANEL, fg=color, width=2, padx=6).pack(side="left")

        # time
        tk.Label(row, text=timestamp, font=self.f_dim,
                 bg=BG_PANEL, fg=FG_DIM, width=8).pack(side="left")

        # action badge
        if action:
            badge_color = ACCENT_GREEN if action == "TIME_IN" else ACCENT_AMBER
            badge = tk.Label(row, text=action, font=self.f_dim,
                             bg=BG_CARD, fg=badge_color,
                             padx=5, pady=1, relief="flat")
            badge.pack(side="left", padx=(4, 0))

        # uid
        tk.Label(row, text=uid, font=self.f_dim,
                 bg=BG_PANEL, fg=FG_DIM, padx=6).pack(side="left")

        # message
        tk.Label(row, text=text, font=self.f_log,
                 bg=BG_PANEL, fg=FG_PRIMARY if success else ACCENT_RED,
                 anchor="w").pack(side="left", fill="x", expand=True)

        self._event_rows.append(row)
        self._event_count += 1
        self._event_count_var.set(f"{self._event_count} events")

        # trim old rows
        if len(self._event_rows) > MAX_EVENTS:
            old = self._event_rows.pop(0)
            old.destroy()

        self._event_scroll.scroll_to_bottom()

    def _add_log_row(self, msg):
        name       = msg.get("name", "Unknown")
        person_type = msg.get("person_type", "")
        action     = msg.get("action", "")
        recorded_time = msg.get("time", "")
        timestamp  = msg.get("timestamp", datetime.now().strftime("%H:%M:%S"))

        type_color  = ACCENT_BLUE if person_type == "Student" else ACCENT_AMBER
        action_color = ACCENT_GREEN if action == "TIME_IN" else ACCENT_CYAN

        row = tk.Frame(self._log_scroll.inner, bg=BG_CARD,
                       highlightbackground=BORDER, highlightthickness=1)
        row.pack(fill="x", padx=4, pady=2)

        left = tk.Frame(row, bg=BG_CARD)
        left.pack(side="left", fill="x", expand=True, padx=8, pady=6)

        name_line = tk.Frame(left, bg=BG_CARD)
        name_line.pack(fill="x")

        tk.Label(name_line, text=name, font=self.f_log_bold,
                 bg=BG_CARD, fg=FG_PRIMARY, anchor="w").pack(side="left")
        tk.Label(name_line, text=person_type, font=self.f_dim,
                 bg=BG_CARD, fg=type_color, padx=6).pack(side="left")

        sub_line = tk.Frame(left, bg=BG_CARD)
        sub_line.pack(fill="x")
        tk.Label(sub_line, text=timestamp, font=self.f_dim,
                 bg=BG_CARD, fg=FG_DIM).pack(side="left")

        right = tk.Frame(row, bg=BG_CARD, padx=10)
        right.pack(side="right")

        tk.Label(right, text=action, font=self.f_log_bold,
                 bg=BG_CARD, fg=action_color).pack()
        tk.Label(right, text=recorded_time, font=self.f_dim,
                 bg=BG_CARD, fg=FG_DIM).pack()

        self._log_rows.append(row)
        if len(self._log_rows) > MAX_LOGS:
            old = self._log_rows.pop(0)
            old.destroy()

        self._log_scroll.scroll_to_bottom()

        # update counters
        self._stat_vals["total"] += 1
        self._stat_total.set(str(self._stat_vals["total"]))
        if action == "TIME_IN":
            self._stat_vals["in"] += 1
            self._stat_in.set(str(self._stat_vals["in"]))

    def _set_status(self, msg):
        success = msg.get("success", True)
        text    = msg.get("text", "")
        ts      = msg.get("timestamp", datetime.now().strftime("%H:%M:%S"))

        color = ACCENT_GREEN if success else ACCENT_RED
        self._status_dot.configure(fg=color)
        self._status_label.configure(text=text,
                                     fg=FG_PRIMARY if success else ACCENT_RED)
        self._status_time.configure(text=ts)

    # ─────────────────────────────────────────
    # Public thread-safe API
    # ─────────────────────────────────────────
    def post_event(
        self,
        *,
        success: bool,
        text: str,
        uid: str = "",
        action: Optional[str] = None,
    ):
        """
        Post a raw event to the live feed (thread-safe).
        Call this for every RFID result from AttendanceService.
        """
        self._queue.put({
            "kind":      "event",
            "success":   success,
            "text":      text,
            "uid":       uid,
            "action":    action or "",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        })
        # mirror to status bar as well
        self._queue.put({
            "kind":      "status",
            "success":   success,
            "text":      text,
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        })
        # increment failed counter
        if not success:
            self._queue.put({"kind": "_inc_failed"})

    def post_attendance(
        self,
        *,
        name: str,
        person_type: str,
        action: str,
        recorded_time: str,
    ):
        """
        Post a successful attendance record to the log panel (thread-safe).
        Call this only on TIME_IN / TIME_OUT success.
        """
        self._queue.put({
            "kind":        "attendance",
            "name":        name,
            "person_type": person_type,
            "action":      action,
            "time":        recorded_time,
            "timestamp":   datetime.now().strftime("%H:%M:%S"),
        })

    def post_system(self, text: str):
        """Post a neutral system/info message to the live feed."""
        self._queue.put({
            "kind":      "event",
            "success":   True,
            "text":      text,
            "uid":       "",
            "action":    "",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        })

    # override _dispatch to handle _inc_failed
    def _dispatch(self, msg):
        kind = msg.get("kind")
        if kind == "event":
            self._add_event_row(msg)
        elif kind == "attendance":
            self._add_log_row(msg)
        elif kind == "status":
            self._set_status(msg)
        elif kind == "_inc_failed":
            self._stat_vals["failed"] += 1
            self._stat_failed.set(str(self._stat_vals["failed"]))

    # ─────────────────────────────────────────
    # Launch
    # ─────────────────────────────────────────
    def launch(self, backend_start_fn=None):
        """
        Start the UI event loop.
        Optionally pass a callable that will be run in a daemon thread
        (e.g. AttendanceBackend.run) so the UI and backend run together.

        Example
        -------
        ui = AttendanceUI()
        ui.launch(backend_start_fn=backend.run)
        """
        if backend_start_fn:
            t = threading.Thread(target=backend_start_fn, daemon=True)
            t.start()

        self.root.mainloop()


# ─────────────────────────────────────────────
# Demo – run this file directly to see the UI
# ─────────────────────────────────────────────
def _demo():
    import time, random

    ui = AttendanceUI()

    def _feed():
        time.sleep(1.0)
        ui.post_system("RFID reader connected: ACS ACR122U")
        ui.post_system("Ready. Tap NFC card.")
        time.sleep(0.8)

        samples = [
            (True,  "A1B2C3D4", "TIME_IN",  "Santos, Juan dela Cruz", "Student",  "08:01:12"),
            (True,  "DEADBEEF", "TIME_IN",  "Reyes, Maria Paz",       "Employee", "08:03:45"),
            (False, "00000000", None,        "RFID UID is not registered: 00000000", "", ""),
            (True,  "CAFE1234", "TIME_OUT", "Santos, Juan dela Cruz", "Student",  "17:00:03"),
            (False, "BADA5510", None,        "Student is inactive: Lim, Carlo",     "", ""),
            (True,  "11223344", "TIME_IN",  "Dela Torre, Ana R.",     "Employee", "08:15:00"),
        ]

        for i, (ok, uid, action, name_or_msg, ptype, rec_time) in enumerate(samples):
            time.sleep(1.2)
            if ok:
                ui.post_event(success=True, text=f"{'Time In' if action=='TIME_IN' else 'Time Out'} recorded for {name_or_msg}.", uid=uid, action=action)
                ui.post_attendance(name=name_or_msg, person_type=ptype, action=action, recorded_time=rec_time)
            else:
                ui.post_event(success=False, text=name_or_msg, uid=uid)

    threading.Thread(target=_feed, daemon=True).start()
    ui.launch()


if __name__ == "__main__":
    _demo()