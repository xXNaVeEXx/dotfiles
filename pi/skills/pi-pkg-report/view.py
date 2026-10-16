#!/usr/bin/env python3
"""view.py — rendert HTML als ANSI-Text im Terminal (nur Python-stdlib).

Nutzung:
  view.py                  rendert ~/pi-extensions-guide.html
  view.py <datei.html>     rendert eine beliebige simple HTML-Datei
  view.py --full           inklusive <pre>-Codeblöcke (Tutorials)
"""
import os
import re
import shutil
import sys
from html.parser import HTMLParser

HOME = os.path.expanduser("~")
DEFAULT = os.path.join(HOME, "pi-extensions-guide.html")

B, DIM, R = "\033[1m", "\033[2m", "\033[0m"
CY, G, Y, MAG = "\033[36m", "\033[32m", "\033[33m", "\033[35m"

VOID = {"meta", "br", "hr", "img", "input", "link", "source", "wbr"}
SKIP_TAGS = {"script", "style", "title", "nav", "button"}
SKIP_CLASSES = {"search-wrap"}
CAP_TAGS = {"h1", "h2", "h3", "h4", "p", "li"}


def _wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        if len(cur) + len(w_) + 1 > width and cur:
            lines.append(cur)
            cur = w_
        else:
            cur = f"{cur} {w_}".strip()
    if cur:
        lines.append(cur)
    return lines or [""]


class Renderer(HTMLParser):
    def __init__(self, width, full=False, links=False, base=""):
        super().__init__(convert_charrefs=True)
        self.w = width
        self.full = full
        self.links = links   # OSC-8-Hyperlinks (WezTerm/kitty/tmux>=3.4 render klickbar)
        self.base = base     # file://-URL der gerenderten Datei
        self.sid = ""        # id der aktuellen section.ext (für Sektions-Anker)
        self.out = []
        self.skip = []   # Tag-Stack: alles darin wird ignoriert
        self.cap = []    # Capture-Stack: {kind, parts, cells, th}

    def link(self, text, url=None):
        """Text als OSC-8-Hyperlink ausgeben (falls --links und URL vorhanden)."""
        if not self.links or text is None:
            return text if text is not None else ""
        u = url or self.base
        if not u:
            return text
        return f"\x1b]8;;{u}\x1b\\{text}\x1b]8;;\x1b\\"

    # ---------- Ausgabe-Helfer ----------
    def hr(self, char="─", n=78):
        self.out.append(f"{DIM}{char * min(self.w, n)}{R}\n")

    def para(self, text, indent="", color=""):
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return
        pad = " " * len(indent)
        for i, line in enumerate(_wrap(text, self.w - len(indent))):
            self.out.append(f"{color}{indent if i == 0 else pad}{line}{R}\n")

    def top(self):
        return self.cap[-1] if self.cap else None

    def nl(self):
        """Blockwechsel: offene Inline-Ausgabe (z.B. Chip-Zeile) abschließen."""
        if self.out and not self.out[-1].endswith("\n"):
            self.out.append("\n")

    # ---------- Parser-Events ----------
    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        if self.skip:
            self.skip.append(tag)  # Verschachtelung mitzählen
            return
        cls = (dict(attrs).get("class") or "").split()

        # Verschachteltes gleichnamiges Tag zählt auf die innerste offene Capture
        for c in reversed(self.cap):
            if c["kind"] == tag:
                c["depth"] = c.get("depth", 0) + 1
                break

        if tag in SKIP_TAGS or any(c in cls for c in SKIP_CLASSES):
            self.skip.append(tag)
        elif tag == "pre":
            if self.full:
                self.nl()
                self.cap.append({"kind": "pre", "parts": []})
            else:
                self.skip.append(tag)
        elif tag == "section" and "ext" in cls:
            self.nl()
            self.out.append("\n")
            self.sid = dict(attrs).get("id") or ""
        elif tag in CAP_TAGS:
            self.nl()
            self.cap.append({"kind": tag, "parts": []})
        elif tag == "span" and "chip" in cls:
            self.cap.append({"kind": "span", "as": "chip", "parts": []})
        elif tag == "div" and "tip" in cls:
            self.nl()
            self.cap.append({"kind": "div", "as": "tip", "parts": []})
        elif tag == "tr":
            self.nl()
            self.cap.append({"kind": "tr", "cells": [], "parts": [], "th": False})
        elif tag in ("td", "th"):
            t = self.top()
            if t is not None and t["kind"] == "tr":
                self.cap.append({"kind": tag, "as": "cell", "parts": [], "th": tag == "th"})
        elif tag == "code":
            t = self.top()
            if t is not None:
                t["parts"].append("`")
        # alle anderen Tags (div, a, b, span, table, thead, tbody …) steigen durch

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
            return
        if tag == "code":
            t = self.top()
            if t is not None:
                t["parts"].append("`")
            return
        c = self.top()
        if c is None or c["kind"] != tag:
            return  # Inline-Endtags (</b>, </a>, </code>…) ohne Capture
        if c.get("depth", 0) > 0:
            c["depth"] -= 1  # gehört zum verschachtelten Element
            return
        self.cap.pop()
        self.render(c.get("as", tag), c)
        # </code>-Backtick: Inline-Tag, kein Capture — siehe handle_starttag

    def handle_data(self, data):
        if self.skip or not data:
            return
        c = self.top()
        if c is not None:
            c["parts"].append(data)
        # Text außerhalb jedes Captures (Zwischenraum, Hero-Stats) wird verworfen

    # ---------- Rendering der gepoppten Captures ----------
    def render(self, kind, c):
        text = re.sub(r"\s+", " ", "".join(c["parts"])).strip()
        if kind == "pre":
            self.out.append(DIM)
            for ln in "".join(c["parts"]).splitlines():
                self.out.append("    " + ln.rstrip() + "\n")
            self.out.append(R)
        elif kind == "h1":
            if text:
                self.out.append(f"\n{B}{MAG}══ {self.link(text)} ══{R}\n")
        elif kind == "h2":
            if text:
                head = self.link(text, f"{self.base}#{self.sid}" if self.sid else None) if self.base else text
                self.out.append(f"\n{B}{CY}■ {head}{R}\n")
                self.hr()
        elif kind == "h3":
            if text:
                self.out.append(f"\n{B}{Y}{text}{R}\n")
        elif kind == "h4":
            if text:
                self.out.append(f"\n{B}{text}{R}\n")
        elif kind == "p":
            if text:
                self.para(text)
                self.out.append("\n")
        elif kind == "li":
            if text:
                lines = _wrap(text, self.w - 4)
                self.out.append(f"  {MAG}•{R} {lines[0]}\n")
                for line in lines[1:]:
                    self.out.append("    " + line + "\n")
        elif kind == "chip":
            if text:
                self.out.append(f"{DIM} [{text}]{R}")
        elif kind == "tip":
            if text:
                self.para(text, indent="  ", color=G)
                self.out.append("\n")
        elif kind == "cell":
            t = self.top()
            if text and t is not None and t["kind"] == "tr":
                t["cells"].append(text)
                if c.get("th"):
                    t["th"] = True
        elif kind == "tr":
            cells = [re.sub(r"\s+", " ", cel).strip() for cel in c["cells"]]
            if any(cells):
                color = B if c.get("th") else ""
                self.out.append("  " + color + f"{DIM} │ {R}".join(cells) + R + "\n")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    full = "--full" in sys.argv
    links = "--links" in sys.argv
    path = args[0] if args else DEFAULT
    if not os.path.isfile(path):
        sys.exit(f"Datei nicht gefunden: {path}")
    try:
        with open(path, encoding="utf-8") as f:
            html = f.read()
    except OSError as e:
        sys.exit(f"Fehler beim Lesen von {path}: {e}")
    width = min(shutil.get_terminal_size((100, 40)).columns, 100)
    r = Renderer(width, full=full, links=links, base="file://" + os.path.abspath(path))
    r.feed(html)
    print("".join(r.out).rstrip() + "\n")


if __name__ == "__main__":
    main()
