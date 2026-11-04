"""Selbstaktualisierende Statusseite für mehrere Spuren (Leitstand → Spur-Orchestratoren → Worker).

Liest eine Konfiguration (JSON, siehe unten) und je Spur das Steuerverzeichnis <orch>/<id>/: PLAN.md mit Zeilen
`- Paket X<n>: [ ]/[~]/[x] …` und Log-Zeilen `- HH:MM …`, BERICHT.md, STOP-WD, PANE und NACHBESSERUNG-<n>.md
(erledigt, sobald BERICHT.md einen Abschnitt `## Nachtrag <n>` hat). Dazu PRs je Spur über den Titel-Präfix
`<mag>:` bzw. die Präfixe in `mag_weitere` (Folgeaufträge mit eigener Nummer) per gh, die letzte Zustandszeile der
Aufsicht (<log_dir>/aufsicht-<id>.log), laufende bg_run-Aufsichten der Leitstand-Sitzung, Kontingente (Usage-JSON)
und RAM. Ein Leitstand-Markdown (## / ###, Listen mit [ ]/[x], Tabellen) erscheint als Textteil. Schreibt
<orch>/status.html atomar (tmp + replace).

Konfiguration (Pfad in STATUS_CONFIG, Standard ./status-spuren.json; Verzeichnis der Datei = <orch>):
  {"titel": "…", "gh_repo": "org/repo", "pr_seit": "2026-10-31T00:00:00Z", "log_dir": "…", "tasks_dir": "…",
   "sid": "<pi-SID der Leitstand-Sitzung>", "leitstand_md": "status-leitstand.md", "nutzung": ["…/zai.json"],
   "spuren": [{"id": "a", "mag": "MAG-1546", "mag_weitere": ["MAG-1552"], "titel": "…", "ziel": "…",
               "wichtig": true}, …]}

Timer (alle 2 min; PATH muss gh enthalten, z. B. mise-Shims, sonst bleiben die PR-Spalten still leer):
  systemd-run --user --unit=<name>-status --on-calendar='*:0/2' --setenv=STATUS_CONFIG=<pfad> \
    --setenv=GH_TOKEN_FILE=<pfad> --setenv=PATH=<…/mise/shims>:/usr/local/bin:/usr/bin:/bin /usr/bin/python3 <skript>
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

CONFIG = Path(os.environ.get("STATUS_CONFIG", "status-spuren.json")).resolve()
ORCH = CONFIG.parent
OUT = ORCH / "status.html"
PAKET_RE = re.compile(r"^- Paket ([A-Z]\d+[a-z]?):\s*\[( |~|x)\]\s*(.*)$")
LOG_RE = re.compile(r"^- \[?(\d\d:\d\d)\]?\s+(.*)$")
NB_RE = re.compile(r"^NACHBESSERUNG-(\d+)\.md$")
ZUSTAND_RE = re.compile(
    r"^(\d\d:\d\d):\d\d pane=(\S+).*? worker=(\d+).*? bg=(\d+).*? prog=(\d+)m"
)


def _quiet(err: BaseException) -> None:
    """Bewusst still: Teilquellen dürfen fehlen, die Seite entsteht trotzdem."""
    del err


def run(cmd: list[str], timeout: int = 30, env: dict[str, str] | None = None) -> str:
    try:
        res = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False, env=env
        )
    except (OSError, subprocess.SubprocessError) as e:
        _quiet(e)
        return ""
    return res.stdout if res.returncode == 0 else ""


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        _quiet(e)
        return ""


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def inline_md(text: str) -> str:
    out = esc(text)
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", out)


def md_to_html(md: str) -> str:
    """Kleiner Markdown-Renderer: ## / ###, Listen (mit [ ]/[x]), Tabellen, Absätze."""
    out: list[str] = []
    in_list = False
    table: list[list[str]] = []

    def flush_table() -> None:
        if not table:
            return
        head, *body = table
        rows = "".join(
            "<tr>" + "".join(f"<td>{inline_md(c)}</td>" for c in r) + "</tr>"
            for r in body
        )
        out.append(
            "<table><tr>"
            + "".join(f"<th>{inline_md(c)}</th>" for c in head)
            + "</tr>"
            + rows
            + "</table>"
        )
        table.clear()

    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                table.append(cells)
            continue
        flush_table()
        if line.lstrip().startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            item = line.lstrip()[2:]
            box = ""
            if item.startswith("[ ] "):
                box, item = '<span class="box open">☐</span> ', item[4:]
            elif item.startswith("[x] "):
                box, item = '<span class="box done">☑</span> ', item[4:]
            out.append(f"<li>{box}{inline_md(item)}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if line.startswith("### "):
            out.append(f"<h3>{inline_md(line[4:])}</h3>")
        elif line.startswith("## "):
            out.append(f"<h2>{inline_md(line[3:])}</h2>")
        elif line.strip():
            out.append(f"<p>{inline_md(line)}</p>")
    flush_table()
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


@dataclass
class PullRequest:
    number: int
    title: str
    state: str
    url: str
    merged_at: str
    checks: str


@dataclass
class Spur:
    sid: str
    mag: str
    titel: str
    ziel: str
    wichtig: bool
    pakete: list[tuple[str, str, str]] = field(default_factory=list)
    log: list[tuple[str, str]] = field(default_factory=list)
    nachbesserungen: list[tuple[int, str, bool]] = field(default_factory=list)
    prs: list[PullRequest] = field(default_factory=list)
    bericht: bool = False
    stop: bool = False
    gestartet: bool = False
    aufsicht_aktiv: bool = False
    zustand: str = ""


def checks_summary(rollup: list[dict[str, object]]) -> str:
    ok = fail = pend = skip = 0
    for c in rollup:
        if str(c.get("status", "COMPLETED")) != "COMPLETED":
            pend += 1
            continue
        concl = str(c.get("conclusion") or "").upper()
        if concl == "SUCCESS":
            ok += 1
        elif concl in {"SKIPPED", "NEUTRAL"}:
            skip += 1
        else:
            fail += 1
    parts = []
    if pend:
        parts.append(f'<span class="live">{pend} laufen</span>')
    if fail:
        parts.append(f'<span class="bad">{fail} rot</span>')
    parts.append(f'<span class="ok">{ok} grün</span>')
    if skip:
        parts.append(f"{skip} übersprungen")
    return " · ".join(parts)


def gh_env() -> dict[str, str]:
    env = dict(os.environ)
    tok_file = env.get("GH_TOKEN_FILE", "")
    if not env.get("GH_TOKEN") and tok_file:
        env["GH_TOKEN"] = read(Path(tok_file)).strip()
    return env


def lade_prs(cfg: dict[str, object]) -> list[dict[str, object]] | None:
    repo = str(cfg.get("gh_repo", ""))
    if not repo:
        return None
    felder = "number,title,state,url,mergedAt,createdAt,statusCheckRollup"
    roh = run(
        ["gh", "pr", "list", "--repo", repo, "--state", "all", "--limit", "60", "--json", felder],
        env=gh_env(),
    )
    if not roh:
        return None
    try:
        daten = json.loads(roh)
    except ValueError as e:
        _quiet(e)
        return None
    seit = str(cfg.get("pr_seit", "1970"))
    return [
        p for p in daten if isinstance(p, dict) and str(p.get("createdAt", "")) >= seit
    ]


def lese_spur(
    eintrag: dict[str, object], prs: list[dict[str, object]] | None, log_dir: Path
) -> Spur:
    sp = Spur(
        sid=str(eintrag["id"]),
        mag=str(eintrag.get("mag", "")),
        titel=str(eintrag.get("titel", "")),
        ziel=str(eintrag.get("ziel", "")),
        wichtig=bool(eintrag.get("wichtig", False)),
    )
    d = ORCH / sp.sid
    plan = read(d / "PLAN.md")
    sp.gestartet = bool(plan) or (d / "PANE").exists()
    for line in plan.splitlines():
        m = PAKET_RE.match(line.strip())
        if m:
            sp.pakete.append((m.group(1), m.group(2), m.group(3)))
            continue
        lm = LOG_RE.match(line.strip())
        if lm:
            sp.log.append((lm.group(1), lm.group(2)))
    bericht = read(d / "BERICHT.md")
    sp.bericht = bool(bericht)
    sp.stop = (d / "STOP-WD").exists()
    if d.is_dir():
        for f in sorted(d.iterdir()):
            nm = NB_RE.match(f.name)
            if not nm:
                continue
            n = int(nm.group(1))
            kopf = next(
                (z.lstrip("# ").strip() for z in read(f).splitlines() if z.startswith("# ")),
                f.name,
            )
            erledigt = re.search(rf"^## Nachtrag {n}\b", bericht, re.MULTILINE) is not None
            sp.nachbesserungen.append((n, kopf, erledigt))
    weitere = eintrag.get("mag_weitere", [])
    praefixe = [sp.mag, *(str(x) for x in weitere)] if isinstance(weitere, list) else [sp.mag]
    for p in prs or []:
        titel = str(p.get("title", ""))
        if any(m and titel.startswith(f"{m}:") for m in praefixe):
            rollup = p.get("statusCheckRollup")
            sp.prs.append(
                PullRequest(
                    number=int(str(p.get("number", 0))),
                    title=titel,
                    state=str(p.get("state", "")),
                    url=str(p.get("url", "")),
                    merged_at=str(p.get("mergedAt") or ""),
                    checks=checks_summary(rollup if isinstance(rollup, list) else []),
                )
            )
    sp.prs.sort(key=lambda pr: pr.number)
    zeilen = [z for z in read(log_dir / f"aufsicht-{sp.sid}.log").splitlines() if " pane=" in z]
    if zeilen:
        zm = ZUSTAND_RE.match(zeilen[-1])
        if zm:
            sp.zustand = (
                f"{zm.group(1)}: Pane {zm.group(2)}, Worker {zm.group(3)}, bg {zm.group(4)}, "
                f"Fortschritt vor {zm.group(5)} min"
            )
    return sp


def laufende_aufsichten(tasks_dir: Path, sid: str) -> set[str]:
    aktiv: set[str] = set()
    if not sid:
        return aktiv
    for meta in tasks_dir.glob(f"{sid}-*/*.json"):
        try:
            d = json.loads(read(meta) or "{}")
        except ValueError as e:
            _quiet(e)
            continue
        name = str(d.get("name", ""))
        if d.get("status") != "running" or not name.startswith("Aufsicht Spur "):
            continue
        try:
            os.kill(int(d.get("pid", 0)), 0)
        except (OSError, ValueError, TypeError) as e:
            _quiet(e)
            continue
        aktiv.add(name.removeprefix("Aufsicht Spur ").strip().lower())
    return aktiv


def zustand(sp: Spur) -> tuple[str, str]:
    if not sp.gestartet:
        return "open", "nicht gestartet"
    offen_nb = [n for n, _, fertig in sp.nachbesserungen if not fertig]
    offen_pr = [pr for pr in sp.prs if pr.state == "OPEN"]
    gemergt = [pr for pr in sp.prs if pr.state == "MERGED"]
    pr_text = ", ".join(f"PR #{pr.number} offen" for pr in offen_pr)
    if offen_nb:
        return "check", f"Nachbesserung {offen_nb[-1]} läuft" + (f" · {pr_text}" if pr_text else "")
    if offen_pr:
        return "run", pr_text
    if gemergt and sp.stop:
        return "merged", "fertig, gemergt"
    return "run", "in Arbeit"


def fortschritt(sp: Spur) -> tuple[float, str]:
    if not sp.pakete:
        return 0.0, "–"
    punkte = sum(1.0 if m == "x" else 0.5 if m == "~" else 0.0 for _, m, _ in sp.pakete)
    fertig = sum(1 for _, m, _ in sp.pakete if m == "x")
    if zustand(sp)[0] == "merged" and sp.bericht:
        # Abgeschlossen (gemergt + Bericht + Stop-Marker): Plan-Häkchen werden beim Abarbeiten oft nicht
        # nachgepflegt — ehrlich als veraltet ausweisen statt halbe Balken zu zeigen.
        rest = (
            ""
            if fertig == len(sp.pakete)
            else f" <small class=muted>(Plan-Häkchen {fertig}/{len(sp.pakete)}, veraltet)</small>"
        )
        return 1.0, f"abgeschlossen{rest}"
    return punkte / len(sp.pakete), f"{fertig}/{len(sp.pakete)}"


def nutzung(pfade: list[str]) -> list[str]:
    zeilen = []
    for pfad in pfade:
        try:
            d = json.loads(read(Path(pfad)) or "{}")
        except ValueError as e:
            _quiet(e)
            continue
        teile = []
        for lim in d.get("limits", []) if isinstance(d, dict) else []:
            if not isinstance(lim, dict) or lim.get("percent") is None:
                continue
            label = str(lim.get("title") or lim.get("label") or "").split(" (")[0]
            label = {"Session": "5 h", "Weekly": "Woche", "Monthly": "Monat"}.get(label, label)
            teile.append(f"{label} {round(float(lim['percent']) * 100)} %")
        if teile:
            zeilen.append(f"{esc(str(d.get('name', Path(pfad).stem)))}: {esc(', '.join(teile[:2]))}")
    return zeilen


def mem_available_gb() -> str:
    for line in read(Path("/proc/meminfo")).splitlines():
        if line.startswith("MemAvailable:"):
            return f"{int(line.split()[1]) / 1048576:.1f} GB"
    return "?"


CSS = """
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}
main{max-width:1240px;margin:0 auto;padding:24px}
h1{font-size:1.6em;margin:0 0 4px} h2{font-size:1.15em;margin:28px 0 8px;border-bottom:1px solid #2a2f3a;padding-bottom:4px}
h3{font-size:1em;margin:18px 0 6px;color:#c9d3e3}
small,.muted{color:#9aa3b2} a{color:#7ab7ff} p{margin:6px 0}
table{border-collapse:collapse;width:100%;font-size:.93em;margin:6px 0} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #222733;vertical-align:top}
th{color:#9aa3b2;font-weight:600}
code{background:#1c2130;padding:1px 4px;border-radius:4px;font-size:.92em}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.85em;white-space:nowrap}
.badge.merged{background:#1f4d2e;color:#9ff0b5}.badge.check{background:#5a4211;color:#ffd77a}
.badge.run{background:#173a5e;color:#9ccdff}.badge.open{background:#33373f;color:#c9ced8}
.ok{color:#8fe3a3}.bad{color:#ff8a8a}.warn{color:#ffcc66}.live{color:#9ccdff}
.bar{height:10px;background:#262b36;border-radius:6px;overflow:hidden;min-width:90px;margin-top:4px}
.bar span{display:block;height:100%;background:#3d8bd9}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.card{background:#171b24;border:1px solid #232938;border-radius:10px;padding:10px 14px;min-width:150px}
.card b{font-size:1.4em;display:block} .card small{display:block}
.box.open{color:#ffcc66}.box.done{color:#8fe3a3}
details{background:#141821;border:1px solid #222938;border-radius:8px;padding:8px 12px;margin:8px 0}
summary{cursor:pointer;font-weight:600} ul{padding-left:20px} li{margin:4px 0}
.star{color:#ffcc66}
"""


def spur_zeile(sp: Spur) -> str:
    k, label = zustand(sp)
    anteil, zahl = fortschritt(sp)
    prs = (
        " ".join(
            f'<a href="{esc(pr.url)}">#{pr.number}</a>{"✓" if pr.state == "MERGED" else ""}'
            for pr in sp.prs
        )
        or "–"
    )
    letzte = (
        f"<small>{esc(sp.log[-1][0])}</small> {esc(sp.log[-1][1][:170])}" if sp.log else "<small>–</small>"
    )
    if sp.aufsicht_aktiv:
        aufsicht = '<span class="ok">läuft</span>'
    elif sp.stop or not sp.gestartet:
        aufsicht = '<span class="muted">beendet</span>'
    else:
        aufsicht = '<span class="bad">fehlt</span>'
    stern = ' <span class="star" title="wichtigste Spur">★</span>' if sp.wichtig else ""
    return (
        f"<tr><td><b>{esc(sp.sid.upper())}</b>{stern}</td><td><b>{esc(sp.titel)}</b><br><small>{esc(sp.mag)} · "
        f'{esc(sp.ziel)}</small></td><td><span class="badge {k}">{esc(label)}</span></td>'
        f'<td>{zahl}<div class="bar"><span style="width:{anteil * 100:.0f}%"></span></div></td>'
        f"<td>{prs}</td><td>{aufsicht}<br><small>{esc(sp.zustand)}</small></td><td>{letzte}</td></tr>"
    )


def spur_details(sp: Spur) -> str:
    marke = {
        "x": '<span class="box done">☑</span>',
        "~": '<span class="box open">◐</span>',
        " ": '<span class="box open">☐</span>',
    }
    pakete = "".join(f"<li>{marke[m]} <b>{esc(pid)}</b> {esc(text[:220])}</li>" for pid, m, text in sp.pakete)
    nb = "".join(
        f"<li>{marke['x' if fertig else '~']} Nachbesserung {n}: {esc(kopf)}</li>"
        for n, kopf, fertig in sp.nachbesserungen
    )
    prs = "".join(
        f'<li><a href="{esc(pr.url)}">#{pr.number}</a> {esc(pr.title)} — '
        f"{'gemergt ' + esc(pr.merged_at[:16].replace('T', ' ')) + ' UTC' if pr.state == 'MERGED' else esc(pr.state.lower())}"
        f" · {pr.checks}</li>"
        for pr in sp.prs
    )
    log = "".join(f"<li><small>{esc(t)}</small> {esc(x[:260])}</li>" for t, x in sp.log[-6:])
    teile = [f"<h3>Pakete</h3><ul>{pakete or '<li>noch kein Plan</li>'}</ul>"]
    if nb:
        teile.append(f"<h3>Nachbesserungen (Leitstand-Selbsttest)</h3><ul>{nb}</ul>")
    if prs:
        teile.append(f"<h3>Pull Requests</h3><ul>{prs}</ul>")
    if log:
        teile.append(f"<h3>Letzte Meldungen</h3><ul>{log}</ul>")
    return f"<details><summary>Spur {esc(sp.sid.upper())} — {esc(sp.titel)}</summary>{''.join(teile)}</details>"


def render() -> str:
    cfg = json.loads(read(CONFIG) or "{}")
    log_dir = Path(str(cfg.get("log_dir", ORCH)))
    prs = lade_prs(cfg)
    aktiv = laufende_aufsichten(Path(str(cfg.get("tasks_dir", ""))), str(cfg.get("sid", "")))
    spuren = [lese_spur(e, prs, log_dir) for e in cfg.get("spuren", [])]
    for sp in spuren:
        sp.aufsicht_aktiv = sp.sid in aktiv
    fertig = sum(1 for sp in spuren if zustand(sp)[0] == "merged")
    alle_prs = [pr for sp in spuren for pr in sp.prs]
    gemergt = sum(1 for pr in alle_prs if pr.state == "MERGED")
    offen = sum(1 for pr in alle_prs if pr.state == "OPEN")
    nb_offen = sum(1 for sp in spuren for _, _, ok in sp.nachbesserungen if not ok)
    karten = [
        f"<div class=card><small>Spuren fertig</small><b>{fertig}/{len(spuren)}</b></div>",
        f"<div class=card><small>PRs gemergt</small><b>{gemergt}</b></div>",
        f"<div class=card><small>PRs offen</small><b>{offen}</b></div>",
        f"<div class=card><small>Nachbesserungen offen</small><b>{nb_offen}</b></div>",
        f"<div class=card><small>RAM frei</small><b>{mem_available_gb()}</b></div>",
    ]
    karten += [
        f"<div class=card><small>Kontingent</small>{z}</div>"
        for z in nutzung([str(p) for p in cfg.get("nutzung", [])])
    ]
    gh_hinweis = "" if prs is not None else "<p class=warn>GitHub gerade nicht erreichbar – PR-Spalten leer.</p>"
    leit = md_to_html(read(ORCH / str(cfg.get("leitstand_md", "status-leitstand.md"))))
    zeilen = "".join(spur_zeile(sp) for sp in spuren)
    details = "".join(spur_details(sp) for sp in spuren)
    jetzt = time.strftime("%d.%m.%Y %H:%M:%S")
    titel = str(cfg.get("titel", "Projektstand"))
    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="60"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(titel)}</title><style>{CSS}</style></head><body><main>
<h1>{esc(titel)}</h1><small>Stand {jetzt} · aktualisiert sich alle 2 min (Seite lädt jede Minute neu)</small>
<div class="cards">{"".join(karten)}</div>{gh_hinweis}
<h2>Spuren</h2>
<table><tr><th>Spur</th><th>Feature</th><th>Zustand</th><th>Pakete</th><th>PRs</th><th>Aufsicht</th><th>Letzte Meldung</th></tr>{zeilen}</table>
{leit}
<h2>Spuren im Detail</h2>{details}
</main></body></html>"""


def main() -> None:
    inhalt = render()
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(inhalt, encoding="utf-8")
    tmp.replace(OUT)


if __name__ == "__main__":
    main()
