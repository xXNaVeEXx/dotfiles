#!/usr/bin/env python3
"""Kosten je pi-Sitzung seit einem Zeitpunkt – wer hat den Kontingent-Zuwachs verbraucht?

Aufruf: verbrauch-je-sitzung.py <provider> "<JJJJ-MM-TT HH:MM>" [sitzungsordner]
Summiert usage.cost.total und Tokens aller Assistant-Antworten des Anbieters ab dem Zeitpunkt (Ortszeit) je
Sitzungsdatei (Standard ~/.pi/agent/sessions) und gibt sie absteigend mit Anteil, cwd, Sitzungs-Endung, Modellen und
letzter Antwort aus. Die Kosten sind Listenpreise: beim Abo nur als Anteil am Zuwachs der Usage-Prozente brauchbar.
"""

import glob
import json
import os
import sys
from datetime import datetime

TOKENS = ("input", "output", "cacheRead", "cacheWrite")


def sitzung(pfad: str, anbieter: str, ab: datetime):
    """(kosten, antworten, tokens, letzte, cwd, modelle) einer Sitzungsdatei ab dem Zeitpunkt."""
    cwd, n, kosten, tok, letzte, modelle = "?", 0, 0.0, 0, ab, set()
    with open(pfad, encoding="utf-8", errors="replace") as fh:
        for i, zeile in enumerate(fh):
            try:
                e = json.loads(zeile)
            except ValueError:
                continue  # halb geschriebene Zeile einer laufenden Sitzung
            if i == 0:
                cwd = e.get("cwd", "?")
            m = e.get("message") or {}
            if e.get("type") != "message" or m.get("role") != "assistant" or m.get("provider") != anbieter:
                continue
            try:
                t = datetime.fromisoformat(str(e.get("timestamp", "")).replace("Z", "+00:00"))
            except ValueError:
                continue
            if t.tzinfo is None:
                t = t.astimezone()
            if t < ab:
                continue
            u = m.get("usage") or {}
            n += 1
            tok += sum(int(u.get(k) or 0) for k in TOKENS)
            kosten += float((u.get("cost") or {}).get("total") or 0)
            letzte = max(letzte, t)
            modelle.add(str(m.get("model", "?")))
    return kosten, n, tok, letzte, cwd, modelle


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    anbieter = sys.argv[1]
    ab = datetime.strptime(sys.argv[2], "%Y-%m-%d %H:%M").astimezone()
    wurzel = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/.pi/agent/sessions")
    zeilen = []
    for pfad in glob.glob(os.path.join(wurzel, "**", "*.jsonl"), recursive=True):
        if os.path.getmtime(pfad) < ab.timestamp():
            continue
        kosten, n, tok, letzte, cwd, modelle = sitzung(pfad, anbieter, ab)
        if n:
            zeilen.append((kosten, n, tok, letzte, cwd, os.path.basename(pfad)[-14:-6], modelle))
    summe = sum(z[0] for z in zeilen)
    for kosten, n, tok, letzte, cwd, kennung, modelle in sorted(zeilen, key=lambda z: z[0], reverse=True):
        anteil = 100 * kosten / summe if summe else 0.0
        print(
            f"{kosten:8.2f} $ {anteil:5.1f} % {n:5d} Antw. {tok / 1e6:6.1f}M tok bis {letzte.astimezone():%d.%m %H:%M}"
            f"  {cwd}  …{kennung}  {','.join(sorted(modelle))}"
        )
    print(f"{summe:8.2f} $ gesamt ({len(zeilen)} Sitzungen, {anbieter} ab {ab:%d.%m %H:%M})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
