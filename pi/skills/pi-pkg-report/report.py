#!/usr/bin/env python3
"""pi-pkg-report: Live-Inventur der installierten Pi-Erweiterungen.

Vergleicht ~/.pi/agent/settings.json (Feld `packages`) mit dem HTML-Guide
~/pi-extensions-guide.html und druckt Diff + ANSI-Übersichtstabelle.

Nutzung: report.py [--dl] [--json]
  --dl    zusätzlich npm-Downloadstatistiken abrufen (online, langsamer)
  --json  maschinenlesbare Ausgabe statt ANSI
"""
import json
import os
import re
import sys
import urllib.request

HOME = os.path.expanduser("~")
SETTINGS = os.path.join(HOME, ".pi/agent/settings.json")
HTML_PATH = os.path.join(HOME, "pi-extensions-guide.html")
NPM_ROOT = os.path.join(HOME, ".pi/agent/npm/node_modules")

# npm-Paketname -> Sektions-ID im HTML, wenn sie abweichen
SECTION_ALIAS = {
    "@plannotator/pi-extension": "plannotator",
    "@narumitw/pi-usage": "pi-usage",
}

# ANSI
B, DIM, R = "\033[1m", "\033[2m", "\033[0m"
CY, G, Y, RED, MAG = "\033[36m", "\033[32m", "\033[33m", "\033[31m", "\033[35m"


def installed_packages():
    """Liefert {npm-name: version} + Liste lokaler Pfad-Pakete. Robust gegen Lesefehler."""
    pkgs, local = {}, []
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            entries = json.load(f).get("packages", [])
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"Fehler beim Lesen von {SETTINGS}: {e}")
    for p in entries:
        if isinstance(p, str) and p.startswith("npm:"):
            name = p[4:]
            pj = os.path.join(NPM_ROOT, name, "package.json")
            ver = "?"
            try:
                with open(pj, encoding="utf-8") as f:
                    ver = json.load(f).get("version", "?")
            except (OSError, json.JSONDecodeError):
                ver = "?"
            pkgs[name] = ver
        elif isinstance(p, str):
            local.append(p)
    return pkgs, local


def html_state():
    """Extrahiert Sektionen, Versionen, Kurzbeschreiber und Quickref aus dem Guide."""
    try:
        with open(HTML_PATH, encoding="utf-8") as f:
            html = f.read()
    except OSError as e:
        sys.exit(f"Fehler beim Lesen von {HTML_PATH}: {e}")
    secs = {}
    for m in re.finditer(r'<section class="ext" id="([^"]+)"[^>]*data-name="([^"]*)"[^>]*>(.*?)</section>', html, re.S):
        sid, _dn, body = m.group(1), m.group(2), m.group(3)
        ver = re.search(r'<span class="chip ver">v([\d.]+)</span>', body)
        lead = re.search(r'<p class="lead">(.*?)</p>', body, re.S)
        short = ""
        if lead:
            short = re.sub(r"<[^>]+>", "", lead.group(1))
            short = re.sub(r"\s+", " ", short).strip()
            short = re.sub(r"^[^:]{0,60}:\s*", "", short)  # fettgedruckten Aufhänger abschneiden
        secs[sid] = {"ver": ver.group(1) if ver else None, "lead": short[:90]}
    quickref_nrs = re.findall(r"<tr><td>(\d+)</td>", html)
    hero = re.search(r'<div class="stat"><b>(\d+)</b><span>Erweiterungen</span>', html)
    return secs, quickref_nrs, (hero.group(1) if hero else None)


def npm_downloads(name):
    try:
        with urllib.request.urlopen(
            f"https://api.npmjs.org/downloads/point/last-month/{name}", timeout=8
        ) as r:
            return json.load(r).get("downloads")
    except Exception:
        return None


def fmt_dl(n):
    if n is None:
        return "?"
    return f"~{n/1e6:.1f} Mio" if n >= 1e6 else f"~{n/1e3:.0f} Tsd"


def main():
    use_dl = "--dl" in sys.argv
    as_json = "--json" in sys.argv
    use_links = "--links" in sys.argv

    if not os.path.isfile(SETTINGS):
        sys.exit(f"settings.json nicht gefunden: {SETTINGS}")
    pkgs, local = installed_packages()
    if not os.path.isfile(HTML_PATH):
        print(f"{RED}HTML-Guide fehlt: {HTML_PATH}{R}")
        secs, qn, hero = {}, [], None
    else:
        secs, qn, hero = html_state()

    rows, problems = [], []
    for i, (name, ver) in enumerate(sorted(pkgs.items()), 1):
        sid = SECTION_ALIAS.get(name, name)
        s = secs.get(sid)
        if s is None:
            status = "NEU"
            problems.append(f"NEU: {name} hat keine Sektion im HTML")
        elif s["ver"] and s["ver"] != ver:
            status = f"v{s['ver']}→v{ver}"
            problems.append(f"VERSION: {name} HTML v{s['ver']} != installiert v{ver}")
        else:
            status = "✓"
        rows.append({"nr": i, "pkg": name, "ver": ver, "sid": sid, "status": status, "lead": s["lead"] if s else ""})

    pkg_sids = {SECTION_ALIAS.get(n, n) for n in pkgs}
    for sid in secs:
        if sid not in pkg_sids:
            problems.append(f"ENTFERNT: Sektion '{sid}' ohne installiertes Paket")

    n_secs = len(secs)
    if hero and hero != str(n_secs):
        problems.append(f"HERO: stat sagt {hero} Erweiterungen, HTML hat {n_secs} Sektionen")
    expect = [str(i) for i in range(1, len(rows) + 1)]
    if qn and qn != expect:
        problems.append(f"QUICKREF: Nummern {qn} != 1..{len(rows)}")

    if use_dl:
        for r in rows:
            r["dl"] = fmt_dl(npm_downloads(r["pkg"]))

    if as_json:
        print(json.dumps({"packages": rows, "local": local, "problems": problems}, ensure_ascii=False, indent=2))
        return

    # ----- ANSI-Ausgabe -----
    print(f"\n{B}{CY}Pi-Erweiterungen — Live-Stand ({len(pkgs)} npm-Pakete){R}")
    if local:
        print(f"{DIM}Lokale Pfad-Pakete: {', '.join(local)}{R}")
    hdr = f"  {B}#  {'Paket':<34}{'Version':<10}{'Status':<10}{'DL/Mon':<9}Kurzbeschreibung{R}" if use_dl else \
          f"  {B}#  {'Paket':<34}{'Version':<10}{'Status':<10}Kurzbeschreibung{R}"
    print(hdr)
    for r in rows:
        st = r["status"]
        st_c = G if st == "✓" else (Y if "→" in st else RED)
        name = r["pkg"] if len(r["pkg"]) <= 34 else r["pkg"][:33] + "…"
        base = f"  {DIM}{r['nr']:>2}.{R} {name:<34}{r['ver']:<10}{st_c}{st:<9}{R}"
        if use_dl:
            base += f"{r.get('dl','?'):<9}"
        base += r["lead"]
        print(base)

    print()
    if problems:
        print(f"{Y}⚠ Diff gegen HTML-Guide:{R}")
        for p in problems:
            print(f"  {Y}•{R} {p}")
        print(f"{DIM}→ HTML aktualisieren (SKILL.md Schritt 3){R}")
    else:
        print(f"{G}✓ HTML-Guide ist aktuell — {n_secs} Sektionen, Quickref 1..{len(rows)} stimmig{R}")
    guide = HTML_PATH
    if use_links:
        guide = f"\x1b]8;;file://{HTML_PATH}\x1b\\{HTML_PATH}\x1b]8;;\x1b\\"
    print(f"{DIM}Guide: {guide}{R}\n")


if __name__ == "__main__":
    main()
