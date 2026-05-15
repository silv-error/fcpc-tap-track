import json
import queue
import threading
import traceback
import tkinter as tk
from http.server import BaseHTTPRequestHandler, HTTPServer
from tkinter import font as tkfont
from datetime import datetime
from typing import Optional, Set

import config

HTTP_LOG_LISTENER_PORT = 5678

# Backgrounds
C_BG        = "#0e1015"
C_SURFACE   = "#14171f"
C_RAISED    = "#1c2030"
C_BORDER    = "#262c3e"
C_BORDER_HI = "#3a4260"

# Accent palette 
C_TEAL   = "#00c9a7"
C_BLUE   = "#4d9fff"
C_GREEN  = "#3ddc84"
C_AMBER  = "#ffb347"
C_RED    = "#ff5f5f"
C_PURPLE = "#b48eff"

# SYSTEM log entries: mid-brightness cyan-steel
C_SLATE  = "#6eb5c0"

# ── Text hierarchy ────────────────────────────────────────────────────────────
C_TEXT_1 = "#e8edf8"
C_TEXT_2 = "#a8bbd0"
C_TEXT_3 = "#4e8fa0"

# Typography
F_MONO     = "Consolas"
F_FALLBACK = "Courier New"

SZ_TITLE = 13
SZ_LABEL = 9
SZ_LOG   = 9
SZ_BADGE = 9
SZ_CLOCK = 9

MAX_ROWS      = 600
MAX_HTTP_ROWS = 300

LEVEL_META = {
    "SUCCESS": (C_GREEN,  "OK "),
    "ERROR":   (C_RED,    "ERR"),
    "WARN":    (C_AMBER,  "WRN"),
    "INFO":    (C_BLUE,   "INF"),
    "SYSTEM":  (C_SLATE,  "SYS"),
}

HTTP_METHOD_COLORS = {
    "GET":    C_TEAL,
    "POST":   C_BLUE,
    "PUT":    C_AMBER,
    "PATCH":  C_PURPLE,
    "DELETE": C_RED,
}

# ── Column headers ─────────────────────────────────────────────────────────────
RFID_HEADER = (
    f"{'#':>4}  "
    f"{'TIME':<8}  "
    f"{'LVL':<3}  "
    f"{'TAG':<10}  "
    f"MESSAGE\n"
)

HTTP_HEADER = (
    f"{'#':>4}  "
    f"{'TIME':<8}  "
    f"{'MTH':<4}  "
    f"{'ST':<3}  "
    f"{'LAT':<6}  "
    f"ENDPOINT  ·  DETAIL\n"
)

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
            parent, width=size, height=size,
            bg=C_SURFACE, highlightthickness=0, **kwargs,
        )
        self._dot = self.create_oval(1, 1, size - 1, size - 1, fill=C_SLATE, outline="")
        self._color       = C_SLATE
        self._pulsing     = False
        self._pulse_state = False

    def set_color(self, color: str, pulse: bool = False):
        self._color   = color
        self._pulsing = pulse
        if not pulse:
            self.itemconfig(self._dot, fill=color)

    def _tick(self):
        if not self._pulsing:
            return
        self._pulse_state = not self._pulse_state
        self.itemconfig(self._dot, fill=self._color if self._pulse_state else C_BORDER)
        self.after(600, self._tick)

    def start_pulse(self):
        if self._pulsing:
            return
        self._pulsing = True
        self._tick()

    def stop_pulse(self, color: str):
        self._pulsing = False
        self._color   = color
        self.itemconfig(self._dot, fill=color)


# ══════════════════════════════════════════════════════════════════════════════
#  DB CONFIG DIALOG
# ══════════════════════════════════════════════════════════════════════════════

class _DbConfigDialog(tk.Toplevel):
    """
    Modal dialog shown before the main log view.

    On successful connection the values are:
      • saved to db_config.json (via config.save)
      • returned through self.result as a dict
    """

    def __init__(self, parent, on_connect):
        super().__init__(parent)
        self.title("Database Configuration")
        self.configure(bg=C_BG)
        self.resizable(False, False)
        self.grab_set()           # modal
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)

        self._on_connect  = on_connect
        self.result: Optional[dict] = None

        # pre-fill from persisted / default values
        cfg = config.load()

        self._build_fonts()
        self._build_ui(cfg)

        # centre over parent
        self.update_idletasks()
        pw = parent.winfo_width()
        ph = parent.winfo_height()
        px = parent.winfo_x()
        py = parent.winfo_y()
        dw = self.winfo_width()
        dh = self.winfo_height()
        self.geometry(f"+{px + (pw - dw)//2}+{py + (ph - dh)//2}")

    # ── fonts ─────────────────────────────────────────────────────────────────

    def _build_fonts(self):
        def mf(size, bold=False):
            w = "bold" if bold else "normal"
            try:
                return tkfont.Font(family=F_MONO, size=size, weight=w)
            except Exception:
                return tkfont.Font(family=F_FALLBACK, size=size, weight=w)

        self.fnt_title  = mf(SZ_TITLE, bold=True)
        self.fnt_label  = mf(SZ_LABEL, bold=True)
        self.fnt_input  = mf(SZ_LOG)
        self.fnt_badge  = mf(SZ_BADGE, bold=True)
        self.fnt_status = mf(SZ_LABEL)

    # ── UI ────────────────────────────────────────────────────────────────────

    def _build_ui(self, cfg: dict):
        # ── title bar ────────────────────────────────────────────────────────
        title_bar = tk.Frame(self, bg=C_SURFACE)
        title_bar.pack(fill="x")

        tk.Label(title_bar, text="▪", font=self.fnt_label,
                 bg=C_SURFACE, fg=C_TEAL).pack(side="left", padx=(18, 6), pady=12)
        tk.Label(title_bar, text="DATABASE CONFIGURATION", font=self.fnt_title,
                 bg=C_SURFACE, fg=C_TEXT_1).pack(side="left", pady=12)

        _Sep(self, color=C_BORDER_HI)

        # ── form ─────────────────────────────────────────────────────────────
        form = tk.Frame(self, bg=C_BG, padx=28, pady=20)
        form.pack(fill="both", expand=True)

        def _row(label: str, row: int, show: str = ""):
            tk.Label(form, text=label, font=self.fnt_label,
                     bg=C_BG, fg=C_TEXT_3, anchor="w",
                     width=12).grid(row=row, column=0, sticky="w", pady=5)
            var = tk.StringVar()
            ent = tk.Entry(
                form, textvariable=var, font=self.fnt_input,
                bg=C_RAISED, fg=C_TEXT_1, insertbackground=C_TEXT_1,
                bd=0, highlightthickness=1,
                highlightbackground=C_BORDER, highlightcolor=C_TEAL,
                relief="flat", width=30, show=show,
            )
            ent.grid(row=row, column=1, sticky="ew", padx=(10, 0), pady=5)
            return var, ent

        self._host_var, self._host_ent     = _row("Host",     0)
        self._user_var, _                  = _row("User",     1)
        self._pass_var, _                  = _row("Password", 2, show="●")
        self._db_var,   _                  = _row("Database", 3)
        self._port_var, _                  = _row("Port",     4)

        form.columnconfigure(1, weight=1)

        # pre-fill
        self._host_var.set(cfg.get("host",     "localhost"))
        self._user_var.set(cfg.get("user",     "root"))
        self._pass_var.set(cfg.get("password", ""))
        self._db_var.set(  cfg.get("database", "rfid_attendance"))
        self._port_var.set(str(cfg.get("port", 3306)))

        # ── status label ──────────────────────────────────────────────────────
        self._status_var = tk.StringVar(value="")
        self._status_lbl = tk.Label(
            form, textvariable=self._status_var,
            font=self.fnt_status, bg=C_BG, fg=C_AMBER,
            anchor="w", wraplength=340,
        )
        self._status_lbl.grid(row=5, column=0, columnspan=2, sticky="w", pady=(8, 0))

        _Sep(self, color=C_BORDER)

        # ── buttons ───────────────────────────────────────────────────────────
        btn_bar = tk.Frame(self, bg=C_SURFACE, padx=18, pady=10)
        btn_bar.pack(fill="x")

        self._connect_btn = tk.Button(
            btn_bar, text="▶  CONNECT", font=self.fnt_badge,
            bg=C_GREEN, fg="#0e1015", bd=0, padx=16, pady=4,
            activebackground=C_TEAL, activeforeground="#0e1015",
            cursor="hand2", relief="flat",
            command=self._attempt_connect,
        )
        self._connect_btn.pack(side="left", padx=(0, 8))

        tk.Button(
            btn_bar, text="CANCEL", font=self.fnt_badge,
            bg=C_RAISED, fg=C_TEXT_3, bd=0, padx=12, pady=4,
            activebackground=C_BORDER, activeforeground=C_RED,
            cursor="hand2", relief="flat",
            command=self._on_cancel,
        ).pack(side="left")

        # focus the first field
        self._host_ent.focus_set()
        self.bind("<Return>", lambda _e: self._attempt_connect())

    # ── connection attempt ────────────────────────────────────────────────────

    def _attempt_connect(self):
        host     = self._host_var.get().strip()
        user     = self._user_var.get().strip()
        password = self._pass_var.get()
        database = self._db_var.get().strip()
        port_str = self._port_var.get().strip()

        if not all([host, user, database, port_str]):
            self._set_status("Please fill in all required fields.", C_AMBER)
            return

        try:
            port = int(port_str)
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            self._set_status("Port must be a valid number (1–65535).", C_AMBER)
            return

        self._set_status("Connecting…", C_SLATE)
        self._connect_btn.configure(state="disabled")
        self.update()

        db_cfg = {
            "host": host, "user": user, "password": password,
            "database": database, "port": port,
        }

        def _worker():
            try:
                # lightweight import — only the connector is needed here
                import mysql.connector
                conn = mysql.connector.connect(
                    host=host, user=user, password=password,
                    database=database, port=port,
                    connect_timeout=5,
                )
                conn.close()
                self.after(0, lambda: self._on_success(db_cfg))
            except Exception as exc:
                msg = str(exc)
                self.after(0, lambda: self._on_failure(msg))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_success(self, db_cfg: dict):
        config.save(**db_cfg)
        self.result = db_cfg
        self._on_connect(db_cfg)
        self.grab_release()
        self.destroy()

    def _on_failure(self, message: str):
        self._set_status(f"Connection failed: {message}", C_RED)
        self._connect_btn.configure(state="normal")

    def _set_status(self, text: str, color: str):
        self._status_var.set(text)
        self._status_lbl.configure(fg=color)

    def _on_cancel(self):
        # Dismiss the dialog only — the main window stays open.
        # The user can re-open the dialog any time via ⚙ DB CONFIG.
        self.grab_release()
        self.destroy()


# ══════════════════════════════════════════════════════════════════════════════
#  READER WATCHER
# ══════════════════════════════════════════════════════════════════════════════

class _ReaderWatcher:
    POLL_MS = 800

    def __init__(self, on_connected, on_disconnected, on_no_pcsc, on_log):
        self._on_connected    = on_connected
        self._on_disconnected = on_disconnected
        self._on_no_pcsc      = on_no_pcsc
        self._on_log          = on_log
        self._stop            = threading.Event()
        self._known: Set[str] = set()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="ReaderWatcher")
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
                current: Set[str] = {str(r) for r in sc_readers()}
                pcsc_error_logged = False
                for name in sorted(current - self._known):
                    self._known.add(name)
                    self._on_connected(name)
                for name in sorted(self._known - current):
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

class _HttpLogListener:
    """Receives POST /http-log JSON payloads from PHP via cURL."""

    def __init__(self, port: int, on_request):
        self._port       = port
        self._on_request = on_request
        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    def start(self):
        on_request = self._on_request
        port       = self._port

        class _Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                if self.path != "/http-log":
                    self.send_response(404); self.end_headers(); return
                try:
                    length = int(self.headers.get("Content-Length", 0))
                    data   = json.loads(self.rfile.read(length))
                    on_request(data)
                except Exception:
                    pass
                self.send_response(204); self.end_headers()

            def log_message(self, *args):
                pass

        try:
            self._server = HTTPServer(("127.0.0.1", port), _Handler)
        except OSError:
            return

        self._thread = threading.Thread(
            target=self._server.serve_forever, daemon=True, name="HttpLogListener"
        )
        self._thread.start()

    def stop(self):
        if self._server:
            self._server.shutdown()

class AttendanceUI:
    def __init__(self):
        self._q: queue.Queue = queue.Queue()
        self._row_idx         = 0
        self._log_line_count  = 0
        self._http_row_idx    = 0
        self._http_line_count = 0

        self._backend_thread: Optional[threading.Thread] = None
        self._backend_start_fn = None
        self._backend_stop_fn  = None
        self._backend_running  = False

        # DB config resolved after the dialog succeeds
        self._db_config: Optional[dict] = None

        self.root = tk.Tk()
        self.root.title("RFID Attendance — Debug Monitor")
        self.root.minsize(900, 580)
        self.root.configure(bg=C_BG)
        self.root.state("zoomed")   # maximized on Windows; falls back gracefully on other OS

        # Maximize on startup (cross-platform)
        try:
            self.root.state("zoomed")           # Windows & some Linux WMs
        except tk.TclError:
            try:
                self.root.attributes("-zoomed", True)   # Linux/X11 fallback
            except tk.TclError:
                pass                            # macOS: falls back to geometry

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

        self._http_listener = _HttpLogListener(
            port=HTTP_LOG_LISTENER_PORT,
            on_request=self._on_php_http_log,
        )
        self._http_listener.start()

    # queue helper

    def _on_php_http_log(self, data: dict):
        self._q.put({
            "kind":       "http_row",
            "timestamp":  datetime.now().strftime("%H:%M:%S"),
            "method":     data.get("method", "GET"),
            "status":     int(data.get("status", 0)),
            "latency_ms": data.get("latency_ms"),
            "user":       data.get("user") or "-",
            "endpoint":   data.get("endpoint", ""),
            "detail":     data.get("detail", ""),
        })

    # fonts 

    def _build_fonts(self):
        def mf(size, bold=False):
            w = "bold" if bold else "normal"
            try:
                return tkfont.Font(family=F_MONO, size=size, weight=w)
            except Exception:
                return tkfont.Font(family=F_FALLBACK, size=size, weight=w)

        self.fnt_title = mf(SZ_TITLE, bold=True)
        self.fnt_label = mf(SZ_LABEL, bold=True)
        self.fnt_log   = mf(SZ_LOG)
        self.fnt_logb  = mf(SZ_LOG,   bold=True)
        self.fnt_badge = mf(SZ_BADGE, bold=True)
        self.fnt_clock = mf(SZ_CLOCK)
        self.fnt_dim   = mf(SZ_LABEL)

    # top-level layout

    def _build_ui(self):
        self._build_header()
        _Sep(self.root, color=C_BORDER_HI)
        self._build_status_bar()
        _Sep(self.root, color=C_BORDER)

        self._build_footer()
        _Sep(self.root, color=C_BORDER)

        self._paned = tk.PanedWindow(
            self.root,
            orient="horizontal",
            bg=C_BORDER_HI,
            sashwidth=3,
            sashrelief="flat",
            bd=0,
        )
        self._paned.pack(fill="both", expand=True)

        self._build_rfid_panel()
        self._build_http_panel()

    # header 

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

        # ── DB config button in header ─────────────────────────────────────
        self._db_btn = tk.Button(
            right, text="⚙  DB CONFIG", font=self.fnt_badge,
            bg=C_RAISED, fg=C_TEXT_2, bd=0, padx=10, pady=3,
            activebackground=C_BORDER, activeforeground=C_TEAL,
            cursor="hand2", relief="flat",
            command=self._open_db_config_dialog,
        )
        self._db_btn.pack(side="right", padx=(10, 0))

        self._clock_var = tk.StringVar()
        tk.Label(right, textvariable=self._clock_var, font=self.fnt_clock,
                 bg=C_SURFACE, fg=C_TEXT_3).pack(side="right")
        self._tick_clock()

    # status bar

    def _build_status_bar(self):
        bar = tk.Frame(self.root, bg=C_SURFACE, height=36)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        inner = tk.Frame(bar, bg=C_SURFACE)
        inner.pack(side="left", fill="y", padx=18)

        self._reader_dot = _PulseDot(inner)
        self._reader_dot.pack(side="left", pady=8, padx=(0, 7))

        self._reader_var = tk.StringVar(value="READER  ·  detecting...")
        tk.Label(inner, textvariable=self._reader_var, font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        _VLine(bar, color=C_BORDER)

        mid = tk.Frame(bar, bg=C_SURFACE)
        mid.pack(side="left", fill="y", padx=18)

        self._scan_dot = tk.Label(mid, text="●", font=self.fnt_label,
                                  bg=C_SURFACE, fg=C_TEXT_3, padx=0)
        self._scan_dot.pack(side="left", padx=(0, 6), pady=8)

        tk.Label(mid, text="LAST SCAN  ·", font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_3).pack(side="left", padx=(0, 6))

        self._scan_var = tk.StringVar(value="awaiting first tap")
        tk.Label(mid, textvariable=self._scan_var, font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        # ── DB connection indicator ────────────────────────────────────────
        _VLine(bar, color=C_BORDER)

        db_frame = tk.Frame(bar, bg=C_SURFACE)
        db_frame.pack(side="left", fill="y", padx=18)

        self._db_dot = tk.Label(db_frame, text="●", font=self.fnt_label,
                                bg=C_SURFACE, fg=C_AMBER)
        self._db_dot.pack(side="left", padx=(0, 5), pady=8)

        self._db_status_var = tk.StringVar(value="DB  ·  not configured")
        tk.Label(db_frame, textvariable=self._db_status_var, font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_2).pack(side="left")

        right = tk.Frame(bar, bg=C_SURFACE)
        right.pack(side="right", padx=18)

        self._count_var = tk.StringVar(value="0")
        tk.Label(right, textvariable=self._count_var, font=self.fnt_logb,
                 bg=C_SURFACE, fg=C_TEXT_2).pack(side="right")
        tk.Label(right, text="entries  ", font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_3).pack(side="right")

    # footer 

    def _build_footer(self):
        bar = tk.Frame(self.root, bg=C_SURFACE, height=40)
        bar.pack(side="bottom", fill="x")
        bar.pack_propagate(False)

        self._autoscroll = tk.BooleanVar(value=True)
        tk.Checkbutton(
            bar, text="Auto-scroll", variable=self._autoscroll,
            font=self.fnt_dim, bg=C_SURFACE, fg=C_TEXT_2,
            selectcolor=C_RAISED, activebackground=C_SURFACE,
            activeforeground=C_TEXT_1, bd=0, cursor="hand2",
        ).pack(side="left", padx=14, pady=6)

        _VLine(bar, color=C_BORDER)

        self._scanner_status_dot = tk.Label(
            bar, text="●", font=self.fnt_label, bg=C_SURFACE, fg=C_SLATE)
        self._scanner_status_dot.pack(side="left", padx=(12, 4), pady=6)

        self._scanner_status_var = tk.StringVar(value="SCANNER  ·  stopped")
        tk.Label(bar, textvariable=self._scanner_status_var, font=self.fnt_dim,
                 bg=C_SURFACE, fg=C_TEXT_2).pack(side="left", padx=(0, 12), pady=6)

        _VLine(bar, color=C_BORDER)

        self._start_btn = tk.Button(
            bar, text="▶  START", font=self.fnt_badge,
            bg=C_GREEN, fg="#0e1015", bd=0, padx=14, pady=3,
            activebackground=C_TEAL, activeforeground="#0e1015",
            cursor="hand2", relief="flat",
            command=self._start_backend_from_button,
        )
        self._start_btn.pack(side="left", padx=(4, 6), pady=6)

        self._stop_btn = tk.Button(
            bar, text="■  STOP", font=self.fnt_badge,
            bg=C_RAISED, fg=C_TEXT_3, bd=0, padx=14, pady=3,
            activebackground=C_BORDER, activeforeground=C_RED,
            cursor="hand2", relief="flat", state="disabled",
            command=self._stop_backend_from_button,
        )
        self._stop_btn.pack(side="left", padx=(0, 10), pady=6)

        tk.Button(
            bar, text="CLEAR ALL", font=self.fnt_badge,
            bg=C_RAISED, fg=C_AMBER, bd=0, padx=10, pady=3,
            activebackground=C_BORDER, activeforeground=C_AMBER,
            cursor="hand2", relief="flat",
            command=self._clear_all,
        ).pack(side="right", padx=14, pady=6)

    # RFID panel (left pane) 

    def _build_rfid_panel(self):
        self._rfid_panel = tk.Frame(self._paned, bg=C_BG)
        self._paned.add(self._rfid_panel, stretch="always", minsize=340)

        bar = tk.Frame(self._rfid_panel, bg=C_BG)
        bar.pack(fill="x")

        tk.Label(bar, text="▸  RFID  /  SYSTEM  LOG", font=self.fnt_badge,
                 bg=C_BG, fg=C_TEAL, anchor="w", padx=14, pady=6,
                 ).pack(side="left")

        tk.Button(
            bar, text="CLEAR", font=self.fnt_badge,
            bg=C_RAISED, fg=C_TEXT_3, bd=0, padx=8, pady=1,
            activebackground=C_BORDER, activeforeground=C_AMBER,
            cursor="hand2", relief="flat", command=self._clear_rfid,
        ).pack(side="right", padx=14, pady=4)

        _Sep(self._rfid_panel, color=C_BORDER)
        self._build_rfid_log_area()

    def _build_rfid_log_area(self):
        wrapper = tk.Frame(self._rfid_panel, bg=C_BG)
        wrapper.pack(fill="both", expand=True)

        self._log_text = tk.Text(
            wrapper,
            bg=C_BG, fg=C_TEXT_1,
            insertbackground=C_TEXT_1,
            font=self.fnt_log,
            bd=0, highlightthickness=0,
            wrap="word",
            state="disabled",
            padx=12, pady=6,
            spacing1=1,
            spacing3=1,
        )

        sb_y = tk.Scrollbar(wrapper, orient="vertical",
                            command=self._log_text.yview,
                            bg=C_SURFACE, troughcolor=C_BG,
                            activebackground=C_TEAL, width=8)

        self._log_text.configure(yscrollcommand=sb_y.set)
        self._log_text.pack(side="left", fill="both", expand=True)
        sb_y.pack(side="right", fill="y")

        self._log_text.tag_configure("HEADER",  foreground=C_TEXT_3)
        self._log_text.tag_configure("SUCCESS", foreground=C_GREEN)
        self._log_text.tag_configure("ERROR",   foreground=C_RED)
        self._log_text.tag_configure("WARN",    foreground=C_AMBER)
        self._log_text.tag_configure("INFO",    foreground=C_BLUE)
        self._log_text.tag_configure("SYSTEM",  foreground=C_SLATE)
        self._log_text.tag_configure("DB_CFG",  foreground=C_TEAL)

        self._log_text.configure(state="normal")
        self._log_text.insert("1.0", RFID_HEADER, "HEADER")
        self._log_text.configure(state="disabled")

    # HTTP panel (right pane)

    def _build_http_panel(self):
        self._http_panel = tk.Frame(self._paned, bg=C_BG)
        self._paned.add(self._http_panel, stretch="always", minsize=340)

        bar = tk.Frame(self._http_panel, bg=C_BG)
        bar.pack(fill="x")

        left = tk.Frame(bar, bg=C_BG)
        left.pack(side="left", fill="x", expand=True)

        tk.Label(left, text="▸  HTTP  REQUEST  LOG", font=self.fnt_badge,
                 bg=C_BG, fg=C_PURPLE, anchor="w", padx=14, pady=6,
                 ).pack(side="left")

        self._http_status_dot = tk.Label(left, text="●", font=self.fnt_badge,
                                         bg=C_BG, fg=C_TEXT_3)
        self._http_status_dot.pack(side="left", padx=(6, 3))

        self._http_status_var = tk.StringVar(value="idle")
        tk.Label(left, textvariable=self._http_status_var, font=self.fnt_dim,
                 bg=C_BG, fg=C_TEXT_3).pack(side="left")

        right = tk.Frame(bar, bg=C_BG)
        right.pack(side="right", padx=14)

        self._http_count_var = tk.StringVar(value="0")
        tk.Label(right, textvariable=self._http_count_var, font=self.fnt_logb,
                 bg=C_BG, fg=C_TEXT_2).pack(side="right")
        tk.Label(right, text="reqs  ", font=self.fnt_dim,
                 bg=C_BG, fg=C_TEXT_3).pack(side="right")

        tk.Button(
            right, text="CLEAR", font=self.fnt_badge,
            bg=C_RAISED, fg=C_TEXT_3, bd=0, padx=8, pady=1,
            activebackground=C_BORDER, activeforeground=C_AMBER,
            cursor="hand2", relief="flat", command=self._clear_http,
        ).pack(side="right", padx=(0, 8), pady=4)

        _Sep(self._http_panel, color=C_BORDER)
        self._build_http_log_area()

    def _build_http_log_area(self):
        wrapper = tk.Frame(self._http_panel, bg=C_BG)
        wrapper.pack(fill="both", expand=True)

        self._http_text = tk.Text(
            wrapper,
            bg=C_BG, fg=C_TEXT_1,
            insertbackground=C_TEXT_1,
            font=self.fnt_log,
            bd=0, highlightthickness=0,
            wrap="word",
            state="disabled",
            padx=12, pady=6,
            spacing1=1,
            spacing3=1,
        )

        sb_y = tk.Scrollbar(wrapper, orient="vertical",
                            command=self._http_text.yview,
                            bg=C_SURFACE, troughcolor=C_BG,
                            activebackground=C_PURPLE, width=8)

        self._http_text.configure(yscrollcommand=sb_y.set)
        self._http_text.pack(side="left", fill="both", expand=True)
        sb_y.pack(side="right", fill="y")

        self._http_text.tag_configure("HEADER",  foreground=C_TEXT_3)
        self._http_text.tag_configure("2xx",     foreground=C_GREEN)
        self._http_text.tag_configure("3xx",     foreground=C_TEAL)
        self._http_text.tag_configure("4xx",     foreground=C_AMBER)
        self._http_text.tag_configure("5xx",     foreground=C_RED)
        self._http_text.tag_configure("ERR",     foreground=C_RED)
        self._http_text.tag_configure("PENDING", foreground=C_SLATE)

        for method, color in HTTP_METHOD_COLORS.items():
            self._http_text.tag_configure(f"M_{method}", foreground=color)

        self._http_text.configure(state="normal")
        self._http_text.insert("1.0", HTTP_HEADER, "HEADER")
        self._http_text.configure(state="disabled")

    # ── DB config dialog ──────────────────────────────────────────────────────

    def _open_db_config_dialog(self):
        """Open the DB config dialog on demand (e.g. to change the server)."""
        self._show_db_dialog()

    def _apply_db_config(self, db_cfg: dict):
        """Called by the dialog on a successful connection."""
        self._db_config = db_cfg
        self._update_db_indicator(connected=True, cfg=db_cfg)
        self._log_db_config(db_cfg)

        # Notify any waiting backend launch
        if hasattr(self, "_db_config_event"):
            self._db_config_event.set()

    def _update_db_indicator(self, connected: bool, cfg: Optional[dict] = None):
        if connected and cfg:
            label = f"DB  ·  {cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['database']}"
            self._db_dot.configure(fg=C_GREEN)
        else:
            label = "DB  ·  not configured"
            self._db_dot.configure(fg=C_AMBER)
        self._db_status_var.set(label[:70])

    def _log_db_config(self, cfg: dict):
        """Emit the active DB settings as a block of SYSTEM log lines."""
        ts = datetime.now().strftime("%H:%M:%S")
        lines = [
            "━━━  DATABASE CONFIGURATION  ━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            f"  Host     : {cfg['host']}",
            f"  Port     : {cfg['port']}",
            f"  User     : {cfg['user']}",
            f"  Database : {cfg['database']}",
            f"  Password : {'*' * len(cfg['password']) if cfg['password'] else '(empty)'}",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        ]
        for line in lines:
            self._q.put({
                "kind": "row", "level": "SYSTEM", "tag": "DB_CFG",
                "text": line, "uid": "", "action": "", "timestamp": ts,
                "_color_tag": "DB_CFG",
            })

    # ── clock & event pump ────────────────────────────────────────────────────

    def _tick_clock(self):
        self._clock_var.set(datetime.now().strftime("%Y-%m-%d   %H:%M:%S"))
        self.root.after(1000, self._tick_clock)

    def _pump(self):
        handled = 0
        try:
            while handled < 100:
                self._handle(self._q.get_nowait())
                handled += 1
        except queue.Empty:
            pass
        self.root.after(50, self._pump)

    def _handle(self, msg: dict):
        kind = msg.get("kind")
        if kind == "row":
            self._append(msg)
        elif kind == "http_row":
            self._append_http(msg)
        elif kind == "status":
            self._update_scan_status(msg)
        elif kind == "reader":
            self._update_reader_status(msg)
        elif kind == "backend_buttons":
            self._apply_backend_buttons(msg.get("running", False))

    # RFID log append

    def _append(self, msg: dict):
        level      = msg.get("level", "INFO")
        tag        = msg.get("tag", "")
        text       = msg.get("text", "")
        ts         = msg.get("timestamp", "")
        uid        = msg.get("uid", "")
        action     = msg.get("action", "")
        color_tag  = msg.get("_color_tag", level)   # allow override for DB_CFG

        _, abbrev = LEVEL_META.get(level, (C_SLATE, "???"))

        self._row_idx        += 1
        self._log_line_count += 1

        prefix = ""
        if uid:
            prefix += f"[{uid}]"
        if action:
            prefix += f" → {action}"
        if prefix:
            prefix += "  "

        line = (
            f"{self._row_idx:>4}  "
            f"{ts:<8}  "
            f"{abbrev:<3}  "
            f"{tag[:10]:<10}  "
            f"{prefix}{text}\n"
        )

        self._log_text.configure(state="normal")
        self._log_text.insert("end", line, color_tag)

        if self._log_line_count > MAX_ROWS:
            self._log_text.delete("2.0", "3.0")
            self._log_line_count -= 1

        self._log_text.configure(state="disabled")
        self._count_var.set(str(self._row_idx))

        if self._autoscroll.get():
            self._log_text.see("end")

    # HTTP log append

    def _append_http(self, msg: dict):
        ts         = msg.get("timestamp", "")
        method     = msg.get("method", "GET").upper()
        status     = msg.get("status", 0)
        latency_ms = msg.get("latency_ms")
        user       = msg.get("user") or "-"
        endpoint   = msg.get("endpoint", "")
        detail     = msg.get("detail", "")

        self._http_row_idx    += 1
        self._http_line_count += 1

        if status == 0:
            tag = "ERR"; status_str = "ERR"
        elif 200 <= status < 300:
            tag = "2xx"; status_str = str(status)
        elif 300 <= status < 400:
            tag = "3xx"; status_str = str(status)
        elif 400 <= status < 500:
            tag = "4xx"; status_str = str(status)
        else:
            tag = "5xx"; status_str = str(status)

        lat_str = f"{latency_ms}ms" if latency_ms is not None else "—"

        detail_full = f"{user}  {detail}".strip() if user != "-" else detail

        line = (
            f"{self._http_row_idx:>4}  "
            f"{ts:<8}  "
            f"{method:<4}  "
            f"{status_str:<3}  "
            f"{lat_str:<6}  "
            f"{endpoint}  ·  {detail_full}\n"
        )

        self._http_text.configure(state="normal")
        self._http_text.insert("end", line, tag)

        if self._http_line_count > MAX_HTTP_ROWS:
            self._http_text.delete("2.0", "3.0")
            self._http_line_count -= 1

        self._http_text.configure(state="disabled")
        self._http_count_var.set(str(self._http_row_idx))

        dot_color = (C_GREEN  if tag == "2xx" else
                     C_AMBER  if tag in ("3xx", "4xx") else
                     C_RED)
        self._http_status_dot.configure(fg=dot_color)
        self._http_status_var.set(f"{method} {status_str}  {endpoint[:28]}")

        if self._autoscroll.get():
            self._http_text.see("end")

    # status updates

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
            self._reader_var.set(
                (f"READER  ·  {name}" if name else "READER  ·  connected")[:60])
            self._reader_dot.stop_pulse(C_GREEN)
        elif state == "disconnected":
            label = (f"READER  ·  disconnected ({name})"
                     if name else "READER  ·  disconnected")
            self._reader_var.set((label + "  —  detecting...")[:60])
            self._reader_dot.set_color(C_AMBER, pulse=True)
            self._reader_dot.start_pulse()

    def _on_reader_connected(self, name: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({"kind": "reader", "state": "connected", "name": name})
        self._q.put({"kind": "row", "level": "SYSTEM", "tag": "HOTPLUG",
                     "text": f"Reader connected: {name}",
                     "uid": "", "action": "", "timestamp": ts})

    def _on_reader_disconnected(self, name: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({"kind": "reader", "state": "disconnected", "name": name})
        self._q.put({"kind": "row", "level": "WARN", "tag": "HOTPLUG",
                     "text": f"Reader disconnected: {name}",
                     "uid": "", "action": "", "timestamp": ts})

    def _on_no_pcsc(self):
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({"kind": "row", "level": "WARN", "tag": "PCSC",
                     "text": "pyscard not installed — install with: pip install pyscard",
                     "uid": "", "action": "", "timestamp": ts})

    # clear 

    def _clear_rfid(self):
        self._log_text.configure(state="normal")
        self._log_text.delete("2.0", "end")
        self._log_text.configure(state="disabled")
        self._row_idx        = 0
        self._log_line_count = 0
        self._count_var.set("0")

    def _clear_http(self):
        self._http_text.configure(state="normal")
        self._http_text.delete("2.0", "end")
        self._http_text.configure(state="disabled")
        self._http_row_idx    = 0
        self._http_line_count = 0
        self._http_count_var.set("0")
        self._http_status_dot.configure(fg=C_TEXT_3)
        self._http_status_var.set("idle")

    def _clear_all(self):
        self._clear_rfid()
        self._clear_http()

    # backend button state

    def _queue_backend_button_state(self, running: bool):
        self._q.put({"kind": "backend_buttons", "running": running})

    def _apply_backend_buttons(self, running: bool):
        self._backend_running = running
        if not hasattr(self, "_start_btn"):
            return
        if running:
            self._start_btn.configure(state="disabled", bg=C_RAISED, fg=C_TEXT_3)
            self._stop_btn.configure(state="normal", bg=C_RED, fg="#0e1015")
            if hasattr(self, "_scanner_status_dot"):
                self._scanner_status_dot.configure(fg=C_GREEN)
                self._scanner_status_var.set("SCANNER  ·  active")
        else:
            self._start_btn.configure(state="normal", bg=C_GREEN, fg="#0e1015")
            self._stop_btn.configure(state="disabled", bg=C_RAISED, fg=C_TEXT_3)
            if hasattr(self, "_scanner_status_dot"):
                self._scanner_status_dot.configure(fg=C_SLATE)
                self._scanner_status_var.set("SCANNER  ·  stopped")

    def _start_backend_from_button(self):
        if self._backend_running:
            self.post_log("WARN", "BACKEND", "Backend is already running.")
            return
        if not self._db_config:
            self.post_log("WARN", "BACKEND",
                          "No database configured. Use ⚙ DB CONFIG first.")
            return
        if not self._backend_start_fn:
            self.post_log("ERROR", "BACKEND", "No backend start function was provided.")
            return
        self.post_system("Starting backend from UI button...")
        self._apply_backend_buttons(True)
        self._backend_thread = threading.Thread(
            target=self._run_backend_safely,
            args=(self._backend_start_fn,),
            daemon=True, name="AttendanceBackendThread",
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

    # public API — RFID / system logging 

    def post_event(self, *, success: bool, text: str,
                   uid: str = "", action: Optional[str] = None):
        ts = datetime.now().strftime("%H:%M:%S")
        self._q.put({"kind": "row",
                     "level": "SUCCESS" if success else "ERROR",
                     "tag": "RFID", "text": text, "uid": uid,
                     "action": action or "", "timestamp": ts})
        self._q.put({"kind": "status", "success": success, "text": text})

    def post_system(self, text: str):
        ts = datetime.now().strftime("%H:%M:%S")
        lo = text.lower()
        if "detecting" in lo or "waiting" in lo:
            self._q.put({"kind": "reader", "state": "detecting"})
        elif "connected:" in lo:
            self._q.put({"kind": "reader", "state": "connected",
                         "name": text.split("connected:")[-1].strip()})
        elif "disconnected" in lo:
            self._q.put({"kind": "reader", "state": "disconnected"})
        elif "ready" in lo:
            self._q.put({"kind": "reader", "state": "connected"})
        self._q.put({"kind": "row", "level": "SYSTEM", "tag": "SYSTEM",
                     "text": text, "uid": "", "action": "", "timestamp": ts})

    def post_log(self, level: str, tag: str, text: str,
                 uid: str = "", action: Optional[str] = None):
        self._q.put({"kind": "row", "level": level.upper(), "tag": tag,
                     "text": text, "uid": uid, "action": action or "",
                     "timestamp": datetime.now().strftime("%H:%M:%S")})

    # public API — HTTP request logging

    def post_http(self, method: str, endpoint: str, status: int = 0,
                  latency_ms: Optional[int] = None,
                  user: str = "-", detail: str = ""):
        self._q.put({"kind": "http_row",
                     "timestamp": datetime.now().strftime("%H:%M:%S"),
                     "method": method.upper(), "status": status,
                     "latency_ms": latency_ms, "user": user,
                     "endpoint": endpoint, "detail": detail})

    # backend thread runner

    def _run_backend_safely(self, backend_start_fn):
        try:
            self.post_system("Backend thread starting...")
            backend_start_fn()
        except Exception as exc:
            self.post_log("ERROR", "BACKEND", f"Backend crashed: {exc}")
            for line in traceback.format_exc().strip().splitlines()[-12:]:
                self.post_log("ERROR", "TRACE", line[:180])
        finally:
            self._queue_backend_button_state(False)
            self.post_system("Backend thread stopped.")

    # ── public accessor: resolved DB config ───────────────────────────────────

    def get_db_config(self) -> Optional[dict]:
        """Return the DB config set by the dialog, or None if not yet configured."""
        return self._db_config

    # ── launch ────────────────────────────────────────────────────────────────

    def launch(self, backend_start_fn=None, backend_stop_fn=None, auto_start=False):
        self._backend_start_fn = backend_start_fn
        self._backend_stop_fn  = backend_stop_fn
        self._auto_start       = auto_start
        self._apply_backend_buttons(False)

        # Always attempt to connect on startup.
        # • Config exists  → silent connect; show dialog only if it fails.
        # • No config yet  → show dialog immediately so the user can set up.
        if config.is_configured():
            self.root.after(100, self._silent_connect)
        else:
            self.root.after(100, self._show_db_dialog)

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

    def _show_db_dialog(self):
        """Open the config dialog (first run or manually triggered)."""
        self.post_log(
            "INFO", "DB_CFG",
            "Database not connected. Use ⚙ DB CONFIG in the toolbar to connect.",
        )
        _DbConfigDialog(parent=self.root, on_connect=self._on_dialog_connect)

    def _silent_connect(self):
        """
        Re-use the saved config without showing the dialog.
        Runs the actual TCP connect in a thread so the UI stays responsive.
        If the connection fails, fall back to showing the dialog.
        """
        cfg = config.load()
        self._update_db_indicator(connected=False)   # amber while connecting
        self._db_status_var.set("DB  ·  connecting…")

        def _worker():
            try:
                import mysql.connector
                conn = mysql.connector.connect(
                    host=cfg["host"],
                    user=cfg["user"],
                    password=cfg["password"],
                    database=cfg["database"],
                    port=cfg["port"],
                    connect_timeout=5,
                )
                conn.close()
                self.root.after(0, lambda: self._on_silent_success(cfg))
            except Exception as exc:
                self.root.after(0, lambda: self._on_silent_failure(cfg, str(exc)))

        threading.Thread(target=_worker, daemon=True, name="SilentConnect").start()

    def _on_silent_success(self, cfg: dict):
        """Saved config connected fine — proceed as normal."""
        self._apply_db_config(cfg)
        if self._auto_start and self._backend_start_fn:
            self._start_backend_from_button()

    def _on_silent_failure(self, cfg: dict, error_msg: str):
        """Saved config failed — log a warning and open the dialog so the
        user can correct the settings (e.g. host changed, new password)."""
        self._update_db_indicator(connected=False)
        self.post_log(
            "WARN", "DB_CFG",
            f"Could not connect to saved database ({cfg['host']}:{cfg['port']}): {error_msg}",
        )
        self.post_log(
            "INFO", "DB_CFG",
            "Please update your connection settings in the dialog that just opened.",
        )
        self._show_db_dialog()

    def _on_dialog_connect(self, db_cfg: dict):
        """Called when the dialog (first-run or manual) succeeds."""
        self._apply_db_config(db_cfg)
        if getattr(self, "_auto_start", False) and self._backend_start_fn:
            self._start_backend_from_button()

    def _on_close(self):
        for fn in (
            lambda: (self._backend_running
                     and self._backend_stop_fn
                     and self._backend_stop_fn()),
            self._watcher.stop,
            self._http_listener.stop,
            lambda: (self.root.winfo_exists()
                     and (self.root.quit() or self.root.destroy())),
        ):
            try:
                fn()
            except Exception:
                pass

def main():
    import time
    import random

    ui = AttendanceUI()
    demo_running = {"value": False}

    def demo_backend_start():
        if demo_running["value"]:
            return
        demo_running["value"] = True
        ui.post_log("SUCCESS", "DEMO", "Demo backend started.")

        scans = [
            (True,  "A1B2C3D4", "TIME_IN",  "Time In recorded for Santos, Juan dela Cruz."),
            (True,  "DEADBEEF", "TIME_IN",  "Time In recorded for Reyes, Maria Paz."),
            (False, "00000000", None,        "RFID UID is not registered: 00000000"),
            (True,  "CAFE1234", "TIME_OUT", "Time Out recorded for Santos, Juan dela Cruz."),
            (False, "BADA5510", None,        "Student is inactive: Lim, Carlo B."),
        ]

        http_endpoints = [
            ("POST", "/api/attendance.php", 200, "action=time_in — 1 row inserted"),
            ("POST", "/api/attendance.php", 200, "action=time_out — record updated"),
            ("GET",  "/api/students.php",   200, "action=validate-rfid — found"),
            ("GET",  "/api/students.php",   404, "action=validate-rfid — not found"),
            ("POST", "/api/attendance.php", 500, "Internal Server Error"),
            ("GET",  "/api/students.php",   200, "action=latest-rfid — OK"),
            ("POST", "/api/employees.php",  200, "action=time_in — employee logged"),
            ("GET",  "/api/students.php",     0, "Connection refused — server down?"),
        ]

        scan_idx = http_idx = 0
        while demo_running["value"]:
            ok, uid, action, message = scans[scan_idx % len(scans)]
            scan_idx += 1
            time.sleep(1.1)
            if not demo_running["value"]:
                break
            ui.post_event(success=ok, text=message, uid=uid, action=action)
            for _ in range(random.randint(1, 2)):
                m, ep, st, det = http_endpoints[http_idx % len(http_endpoints)]
                http_idx += 1
                ui.post_http(
                    method=m, endpoint=ep, status=st,
                    latency_ms=random.randint(12, 280) if st != 0 else None,
                    detail=det,
                )
                time.sleep(0.15)

        ui.post_log("SYSTEM", "DEMO", "Demo backend stopped.")

    def demo_backend_stop():
        demo_running["value"] = False

    ui.launch(
        backend_start_fn=demo_backend_start,
        backend_stop_fn=demo_backend_stop,
        auto_start=False,
    )


if __name__ == "__main__":
    main()