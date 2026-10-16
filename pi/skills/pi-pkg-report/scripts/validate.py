#!/usr/bin/env python3
"""Struktur-Validator für ~/pi-extensions-guide.html (SKILL.md Schritt 3, Pflicht nach jeder Änderung).

Prüft: VOID-Tags/Stack-Balance (HTMLParser), alle href="#…"-Anker existieren als id
(regex-basiert — HTMLParser alleine sammelt hrefs nur bei startendtag), section.ext-Anzahl
== npm-Pakete in settings.json + Eigenbau-Extensions in ~/.pi/agent/extensions/,
Quickref-Nummern lückenlos 1..N.

Exit-Codes: 0 = ok, 1 = Fehler gefunden, 2 = Setup-Fehler.
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from report import local_extensions  # noqa: E402  (single source of truth für den Eigenbau-Scan)

HOME = os.path.expanduser("~")
GUIDE = os.path.join(HOME, "pi-extensions-guide.html")
SETTINGS = os.path.join(HOME, ".pi/agent/settings.json")
VOID = {"meta", "br", "hr", "img", "input", "link", "source", "wbr"}


class BalanceChecker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.errors = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            self.errors.append(f"Stack-Verletzung: </{tag}> bei Zeile {self.getpos()[0]}")
        else:
            self.stack.pop()


def main():
    if not os.path.exists(GUIDE):
        sys.exit(f"Guide nicht gefunden: {GUIDE}")
    src = open(GUIDE, encoding="utf-8").read()

    # 1) Stack-Balance
    p = BalanceChecker()
    p.feed(src)
    p.close()
    errors = list(p.errors)
    if p.stack:
        errors.append(f"Offene Tags am Dateiende: {[t for t, _ in p.stack]}")

    # 2) Anker vs. IDs (regex, nicht HTMLParser — der verliert hrefs bei normalem starttag)
    hrefs = set(re.findall(r'href="#([^"]+)"', src))
    ids = set(re.findall(r'\bid="([^"]+)"', src))
    dead = sorted(hrefs - ids)
    if dead:
        errors.append(f"Tote Anker (href ohne id): {dead}")

    # 3) section.ext-Anzahl == npm-Pakete + Eigenbau-Extensions
    sections = re.findall(r'<section class="ext" id="([^"]+)"', src)
    n_eig = len(local_extensions())
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            entries = json.load(f).get("packages", [])
        n_npm = sum(1 for e in entries if isinstance(e, str) and e.startswith("npm:"))
    except (OSError, ValueError):
        n_npm = None
    if n_npm is not None and len(sections) != n_npm + n_eig:
        errors.append(f"section.ext={len(sections)} != {n_npm} npm-Pakete + {n_eig} Eigenbau")

    # 4) Quickref-Nummern lückenlos 1..N (N = Anzahl Sektionen)
    nums = [int(m) for m in re.findall(r'<tr><td>(\d+)</td><td class="nm">', src)]
    if nums != list(range(1, len(sections) + 1)):
        errors.append(f"Quickref-Nummern nicht lückenlos 1..{len(sections)}: {nums}")

    print(f"Sektionen: {len(sections)} | npm: {n_npm} + Eigenbau: {n_eig} | Anker-Links: {len(hrefs)} | Quickref: {nums}")
    if errors:
        print("FEHLER:")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    print("✔ Struktur ok")


if __name__ == "__main__":
    main()
