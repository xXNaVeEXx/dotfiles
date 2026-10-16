#!/usr/bin/env python3
"""preview.py — Dateien IM TERMINAL ansehen (tmux-Splits), ohne es zu verlassen.

Modi:
  preview.py <datei>            inline rendern (aktuelle Pane)
  preview.py --split <datei>    rechte tmux-Pane (45 %) mit Live-Vorschau (watch)
  preview.py --both <datei>     neues tmux-Fenster: links Code, rechts Vorschau
  preview.py --watch <datei>    inline rendern + bei Änderung aktualisieren
  preview.py --code             erzwingt Code-Ansicht (bat) statt Typ-Erkennung

Typen: Bilder → chafa (ANSI, symbols — Sixel NICHT nutzen, tmux schluckt es!),
HTML → view.py (Terminal-Render, gleicher Ordner), Code/Text → bat.
Getestet mit: tmux 3.7c, WezTerm; bat, chafa (nix), /usr/bin/python3.
"""
import os
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
VIEW = os.path.join(HERE, "view.py")

IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".tiff", ".svg"}
HTML_EXT = {".html", ".htm"}
CY, DIM, R = "\x1b[36m", "\x1b[2m", "\x1b[0m"


def type_of(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in IMG_EXT:
        return "image"
    if ext in HTML_EXT:
        return "html"
    return "code"


def run(cmd: list) -> None:
    try:
        subprocess.run(cmd, check=False)
    except FileNotFoundError:
        print(f"{DIM}fehlend: {cmd[0]}{R}")


def pane_size():
    """Größe der eigenen tmux-Pane — damit chafa die Breite wirklich nutzt."""
    p = os.environ.get("TMUX_PANE")
    if not p:
        return None
    r = subprocess.run(
        ["tmux", "display-message", "-p", "-t", p, "#{pane_width} #{pane_height}"],
        capture_output=True, text=True)
    try:
        w, h = r.stdout.split()
        return int(w), int(h)
    except ValueError:
        return None


def render(path: str, force_code: bool = False) -> None:
    """Eine Ausgabe rendern — in echter Pane (TTY) oder umgeleitet."""
    if not os.path.isfile(path):
        print(f"Datei nicht gefunden: {path}")
        return
    t = "code" if force_code else type_of(path)
    if t == "image":
        cmd = ["chafa", "--format", "symbols"]
        size = pane_size()
        if size:
            w, h = size
            cmd += ["-s", f"{w}x{max(4, h - 4)}"]
        run(cmd + [path])
    elif t == "html":
        run([sys.executable, VIEW, path])
    else:
        run(["bat", "--style=numbers,header", "--paging=never", "--color=always", path])


def watch(path: str, force_code: bool = False) -> None:
    """Render-Schleife: aktualisiert, sobald sich die Datei ändert."""
    mtime = 0.0
    while True:
        try:
            m = os.path.getmtime(path)
        except OSError:
            m = -1.0
        if m != mtime:
            mtime = m
            print("\x1b[2J\x1b[H", end="")  # clear + home
            print(f"{CY}{os.path.basename(path)}{R} {DIM}↻ Live-Vorschau — Pane mit `exit` oder Strg-d schließen{R}\n")
            render(path, force_code)
        time.sleep(0.8)


def tmux(*args: str) -> str:
    r = subprocess.run(["tmux", *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"tmux-Fehler: {r.stderr.strip()}")
    return r.stdout.strip()


def in_tmux() -> bool:
    return bool(os.environ.get("TMUX"))


def me() -> str:
    """python3-Aufruf für Panes — der Interpreter, der uns gerade läuft."""
    return shlex.quote(sys.executable)


def cmd_inline(path: str, code: bool) -> str:
    flags = " --code" if code else ""
    return f"{me()} {shlex.quote(os.path.join(HERE, 'preview.py'))} --watch{flags} {shlex.quote(os.path.abspath(path))}"


def split(path: str, code: bool) -> None:
    """Rechts eine Pane (45 %) mit Live-Vorschau öffnen; Fokus bleibt links."""
    if not in_tmux():
        sys.exit("Nicht in tmux — starte pi innerhalb deiner tmux-Session oder nutze den Inline-Modus.")
    tmux("split-window", "-h", "-l", "45%", cmd_inline(path, code))


def both(path: str, code: bool) -> None:
    """Neues Fenster: links Code, rechts Live-Vorschau (HTML)."""
    if not in_tmux():
        sys.exit("Nicht in tmux — --both braucht eine tmux-Session.")
    if type_of(path) != "html" or code:
        split(path, code)  # Nicht-HTML: Vorschau reicht, links bleibt dein Kontext
        return
    name = "code:" + os.path.basename(path)[:24]
    wid = tmux("new-window", "-P", "-F", "#{window_id}", "-n", name,
               cmd_inline(path, code=True))
    tmux("split-window", "-h", "-l", "45%", "-t", wid, cmd_inline(path, code=False))


def main() -> None:
    args = sys.argv[1:]
    force_code = "--code" in args
    do_watch = "--watch" in args
    mode = "inline"
    if "--split" in args:
        mode = "split"
    elif "--both" in args:
        mode = "both"
    paths = [a for a in args if not a.startswith("--")]
    if not paths:
        print(__doc__)
        sys.exit(2)
    path = os.path.abspath(paths[0])

    if mode == "split":
        split(path, force_code)
    elif mode == "both":
        both(path, force_code)
    elif do_watch:
        watch(path, force_code)
    else:
        render(path, force_code)
        print(f"\n{DIM}Tipp: --split (Pane rechts) · --both (Code+Vorschau) · --watch (Live){R}")


if __name__ == "__main__":
    main()
