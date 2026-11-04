#!/usr/bin/env python3
"""Selbstaktualisierende Statusseite für autonome Orchestrator-Läufe (Vorlage).

Liest die Queue-Tabelle im Plan (`| <ID> | Inhalt | Modell | Status |`, Zeilen mit STATUS_PKG_PREFIX oder `PLAN`),
das Journal (`- <zeit> …`-Zeilen), NUTZER.md/ERLEDIGT.md (Aufzählungen), Git (Commits vor main, gepusht/lokal),
offene und seit STATUS_SINCE gemergte PRs mit CI-Stand, Worker-Aktivität (/tmp/acp-delegate/<runId>.*; runId =
letzte `del_…`-ID, die im Journal im selben Satz hinter der Paket-ID steht), laufende bg_run-Wachen der Sitzung und
die letzte Watchdog-Zeile. Schreibt <STATUS_DIR>/status.html atomar (tmp + replace).

Start (Beispiel):
  systemd-run --user --unit=<name>-status --on-calendar='*:0/2' \
    --setenv=STATUS_REPO=/pfad/repo --setenv=STATUS_DIR=/pfad/repo/.tmp/n4 --setenv=STATUS_SID=<pi-SID> \
    --setenv=STATUS_GH_REPO=<org>/<repo> --setenv=STATUS_SINCE=<ISO-UTC> --setenv=STATUS_TITLE='Projekt – Stand' \
    --setenv=STATUS_PKG_PREFIX=P15 --setenv=STATUS_WATCHDOG_LOG=/pfad/watchdog.log /usr/bin/python3 <dieses Skript>
Status-Wörter der Queue: gemergt | committet/fertig | fehler | Abnahme/Prüf…/integrieren | läuft/wartet/nacharbeit/
resume | sonst offen. Mehrere Queues in einer Datei: je Queue eine Überschrift `## <Name>`; die Spalte „Modell“ wird
über die Kopfzeile der Tabelle gefunden (sonst Spalte 3), Status = letzte Spalte.
Optionale env:
  STATUS_PKG_RE       Regex für Queue-Zeilen statt STATUS_PKG_PREFIX, z. B. '^\\| (LC-|KONSOL-|PLAN)'
  STATUS_STEPS_MD     Markdown mit Checkliste unter STATUS_STEPS_HEAD (Standard `## Steps`, Zeilen `- [ ]/[~]/[x] …`)
                      → „Gesamtplan: n von m Schritten“, der erste offene Schritt ist „jetzt“
  STATUS_OVERVIEW_MD  von Hand gepflegte Übersicht (## / ###, Listen mit [ ]/[~]/[x], Tabellen); an der Marke
                      `<!-- STEPS -->` wird die Checkliste eingefügt, sonst darunter
  STATUS_GROUPS       'PRÄFIX=Label;…' → Zeilen je ID-Gruppe in der Queue-Tabelle
  STATUS_CMDS         JSON [["Label","Befehl"],…] → letzte Ausgabezeilen unter „Ressourcen“ (auch bei Exit ≠ 0)
  STATUS_REPOS        JSON [["Label","/pfad/worktree"],…] → Commits je Worktree (Standard: STATUS_REPO)
Abschnitt „## Ohne dich entschieden“ im Plan wird mit angezeigt.
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import time
from pathlib import Path

REPO = Path(os.environ.get("STATUS_REPO", "."))
PLAN_DIR = Path(os.environ.get("STATUS_DIR", str(REPO / ".tmp")))
OUT = PLAN_DIR / "status.html"
ACP = Path(os.environ.get("STATUS_ACP_DIR", "/tmp/acp-delegate"))
TASKS = Path(os.environ.get("STATUS_TASKS", str(Path.home() / "projects" / ".pi" / "tasks")))
WATCHDOG_LOG = Path(os.environ.get("STATUS_WATCHDOG_LOG", "/nonexistent"))
SID = os.environ.get("STATUS_SID", "")
GH_REPO = os.environ.get("STATUS_GH_REPO", "")
SINCE = os.environ.get("STATUS_SINCE", "1970-01-01T00:00:00Z")
TITLE = os.environ.get("STATUS_TITLE", "Projektstand")
PKG_PREFIX = os.environ.get("STATUS_PKG_PREFIX", "P")
# STATUS_PKG_RE: Queue-Zeilen per Regex erkennen (mehrere ID-Präfixe aus mehreren Queues), sonst STATUS_PKG_PREFIX
PKG_RE = re.compile(os.environ["STATUS_PKG_RE"]) if os.environ.get("STATUS_PKG_RE") else None
STEPS_MD = Path(os.environ.get("STATUS_STEPS_MD", "/nonexistent"))
STEPS_HEAD = os.environ.get("STATUS_STEPS_HEAD", "## Steps")
OVERVIEW_MD = Path(os.environ.get("STATUS_OVERVIEW_MD", "/nonexistent"))
GROUPS = [g.split("=", 1) for g in os.environ.get("STATUS_GROUPS", "").split(";") if "=" in g]
STEP_RE = re.compile(r"^- \[( |x|~)\] (.*)$")
RUN_ID = r"del_[a-z0-9]+_[a-z0-9]+"
STILL_MIN = 15

KIND_LABEL = {
    "merged": "gemergt",
    "done": "fertig (committet)",
    "check": "Abnahme",
    "run": "in Arbeit",
    "fail": "Fehler",
    "open": "offen",
}
COLORS = {
    "merged": "#2f8f4e",
    "done": "#58b673",
    "check": "#d9a531",
    "run": "#3d8bd9",
    "fail": "#c94a4a",
    "open": "#4a4f5a",
}
ORDER = ("merged", "done", "check", "run", "fail", "open")


def _quiet(err: BaseException) -> None:
    """Bewusst still: Teilquellen dürfen fehlen, die Seite entsteht trotzdem."""
    del err


def run(cmd: list[str], timeout: int = 20, env: dict[str, str] | None = None) -> str:
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False, env=env)
    except (OSError, subprocess.SubprocessError) as e:
        _quiet(e)
        return ""
    return res.stdout if res.returncode == 0 else ""


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as e:
        _quiet(e)
        return ""


def esc(text: str) -> str:
    out = html.escape(text)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", out)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", out)


def kind(status: str) -> str:
    s = status.lower()
    if "gemergt" in s:
        return "merged"
    if "committet" in s or "fertig" in s:
        return "done"
    if "fehler" in s:
        return "fail"
    if "abnahme" in s or "prüf" in s or "integrier" in s:
        return "check"
    if any(w in s for w in ("läuft", "wartet", "nacharbeit", "resume")):
        return "run"
    return "open"


def packages() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    sec, hdr = "", []
    for line in read(PLAN_DIR / "PLAN.md").splitlines():
        if line.startswith("## "):
            sec, hdr = line[3:].strip(), []
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        is_pkg = PKG_RE.match(line) if PKG_RE else (line.startswith("| " + PKG_PREFIX) or line.startswith("| PLAN"))
        if not is_pkg:
            if line.startswith("| "):
                hdr = [c.lower() for c in cells]
            continue
        if len(cells) < 4:
            continue
        mi = hdr.index("modell") if "modell" in hdr and hdr.index("modell") < len(cells) else 2
        rows.append({"id": cells[0], "inhalt": cells[1], "modell": cells[mi], "status": cells[-1], "sec": sec})
    return rows


def latest_run(pkg: str, journal: str) -> str:
    found = ""
    pattern = re.compile(re.escape(pkg) + r"\b[^.;]*?(" + RUN_ID + ")")
    for line in journal.splitlines():
        for m in pattern.finditer(line):
            found = m.group(1)
    return found


def run_state(run_id: str) -> str:
    act = ACP / f"{run_id}.activity"
    try:
        age = (time.time() - act.stat().st_mtime) / 60
    except OSError as e:
        _quiet(e)
        return ""
    last_tool = ""
    for line in reversed(read(act).splitlines()[-60:]):
        if line.startswith("[tool]"):
            last_tool = line[7:100]
            break
    ended = False
    lines = read(ACP / f"{run_id}.session.jsonl").splitlines()
    if lines:
        try:
            msg = json.loads(lines[-1]).get("message", {})
        except ValueError as e:
            _quiet(e)
            msg = {}
        ended = isinstance(msg, dict) and msg.get("role") == "assistant" and msg.get("stopReason") != "toolUse"
    if ended:
        return f'<span class="ok">Lauf beendet</span> <small>({run_id})</small>'
    cls = "warn" if age >= STILL_MIN else "live"
    txt = f"aktiv, letzte Aktivität vor {age:.0f} min" if age < STILL_MIN else f"still seit {age:.0f} min"
    tool = f"<br><small>{esc(last_tool)}</small>" if last_tool else ""
    return f'<span class="{cls}">{txt}</span> <small>({run_id})</small>{tool}'


def gh_env() -> dict[str, str]:
    env = dict(os.environ)
    if not env.get("GH_TOKEN"):
        tok = run(["secret-tool", "lookup", "service", "gh:github.com"], timeout=10).strip()
        if tok:
            env["GH_TOKEN"] = tok
    return env


def checks_summary(rollup: list[dict]) -> str:
    ok = fail = pend = skip = 0
    for c in rollup:
        if c.get("status", "COMPLETED") != "COMPLETED":
            pend += 1
            continue
        concl = (c.get("conclusion") or "").upper()
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


def pull_requests() -> str:
    if not GH_REPO:
        return "<p><small>STATUS_GH_REPO nicht gesetzt.</small></p>"
    env = gh_env()
    opened = run(
        ["gh", "pr", "list", "--repo", GH_REPO, "--state", "open", "--json", "number,title,url,statusCheckRollup"],
        timeout=30,
        env=env,
    )
    merged = run(
        ["gh", "pr", "list", "--repo", GH_REPO, "--state", "merged", "--limit", "8", "--json", "number,title,url,mergedAt"],
        timeout=30,
        env=env,
    )
    rows = []
    try:
        for pr in json.loads(opened or "[]"):
            rows.append(
                f'<tr><td><a href="{esc(pr["url"])}">#{pr["number"]}</a></td><td>{esc(pr["title"])}</td>'
                f'<td><span class="badge run">offen</span></td><td>{checks_summary(pr.get("statusCheckRollup") or [])}</td></tr>'
            )
        for pr in json.loads(merged or "[]"):
            if (pr.get("mergedAt") or "") < SINCE:
                continue
            rows.append(
                f'<tr><td><a href="{esc(pr["url"])}">#{pr["number"]}</a></td><td>{esc(pr["title"])}</td>'
                f'<td><span class="badge merged">gemergt</span></td><td>{esc(pr["mergedAt"][:16].replace("T", " "))} UTC</td></tr>'
            )
    except (ValueError, KeyError, TypeError) as e:
        _quiet(e)
    if not opened and not merged:
        return "<p><small>GitHub gerade nicht erreichbar – nächster Versuch beim nächsten Lauf.</small></p>"
    if not rows:
        return "<p>Keine offenen PRs, im Zeitraum noch nichts gemergt.</p>"
    return "<table><tr><th>PR</th><th>Titel</th><th>Zustand</th><th>CI</th></tr>" + "".join(rows) + "</table>"


def commits() -> str:
    repos = [r for r in _json_env("STATUS_REPOS") if isinstance(r, list) and len(r) == 2] or [["", str(REPO)]]
    parts = []
    for label, path in repos:
        git = ["git", "-C", str(path)]
        log = run([*git, "log", "--format=%h\t%cd\t%s", "--date=format:%d.%m %H:%M", "origin/main..HEAD"])
        unpushed = set(run([*git, "log", "--format=%h", "@{u}..HEAD"]).split())
        branch = run([*git, "branch", "--show-current"]).strip()
        lines = log.splitlines()
        rows = []
        for line in lines[:12]:
            sha, _, rest = line.partition("\t")
            when, _, subject = rest.partition("\t")
            tag = '<span class="badge open">nur lokal</span>' if sha in unpushed else '<span class="badge done">gepusht</span>'
            rows.append(
                f"<tr><td><code>{esc(sha)}</code></td><td><small>{esc(when)}</small></td><td>{esc(subject)}</td><td>{tag}</td></tr>"
            )
        name = f"<b>{esc(str(label))}</b> · " if label else ""
        local = (f", davon {len(unpushed)} nur lokal" if unpushed else ", alle gepusht") if lines else ""
        parts.append(f"<p>{name}Branch <code>{esc(branch)}</code> – {len(lines)} Commit(s) noch nicht auf <code>main</code>{local}.</p>")
        if rows:
            more = f"<p><small>… und {len(lines) - 12} ältere</small></p>" if len(lines) > 12 else ""
            parts.append("<table><tr><th>Commit</th><th>Zeit</th><th>Betreff</th><th></th></tr>" + "".join(rows) + "</table>" + more)
    return "".join(parts)


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def background_tasks() -> list[str]:
    names: list[str] = []
    if not SID:
        return names
    for d in TASKS.glob(f"{SID}-*"):
        for f in sorted(d.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                _quiet(e)
                continue
            pid = data.get("pid")
            if data.get("status") == "running" and isinstance(pid, int) and pid_alive(pid):
                names.append(str(data.get("name") or f.stem))
    return names


def run_out(cmd: list[str], timeout: int = 20) -> str:
    """Wie run(), liefert die Ausgabe aber auch bei Exit ≠ 0 (Tor-Skripte melden „NEIN“ mit Exit 1)."""
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as e:
        _quiet(e)
        return ""
    return (res.stdout or res.stderr or "").strip()


def _json_env(name: str) -> list:
    try:
        val = json.loads(os.environ.get(name, "") or "[]")
    except ValueError as e:
        _quiet(e)
        return []
    return val if isinstance(val, list) else []


def md_to_html(md: str) -> str:
    """Kleiner Markdown-Renderer: ## / ###, Listen (mit [ ]/[~]/[x], eingerückt = Unterpunkt), Tabellen, Absätze."""
    out: list[str] = []
    in_list = False
    table: list[list[str]] = []
    boxes = {"[ ] ": ("open", "☐"), "[~] ": ("cur", "◐"), "[x] ": ("done", "☑")}

    def flush_table() -> None:
        if not table:
            return
        head, *body = table
        out.append(
            "<table><tr>"
            + "".join(f"<th>{esc(c)}</th>" for c in head)
            + "</tr>"
            + "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in body)
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
            for pre, (cls, mark) in boxes.items():
                if item.startswith(pre):
                    box, item = f'<span class="box {cls}">{mark}</span> ', item[len(pre) :]
                    break
            sub = ' class="sub"' if raw.startswith(("  ", "\t")) else ""
            out.append(f"<li{sub}>{box}{esc(item)}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if line.startswith("### "):
            out.append(f"<h3>{esc(line[4:])}</h3>")
        elif line.startswith("## "):
            out.append(f"<h2>{esc(line[3:])}</h2>")
        elif line.strip() and not line.startswith(("# ", "<!--")):
            out.append(f"<p>{esc(line)}</p>")
    flush_table()
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def steps() -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    inside = False
    for line in read(STEPS_MD).splitlines():
        if line.strip() == STEPS_HEAD:
            inside = True
        elif inside and line.startswith("## "):
            break
        elif inside and (m := STEP_RE.match(line.strip())):
            found.append((m.group(1), m.group(2)))
    return found


def steps_html() -> str:
    st = steps()
    if not st:
        return ""
    done = sum(1 for s, _ in st if s == "x")
    cur = next((i for i, (s, _) in enumerate(st) if s != "x"), -1)
    items = []
    for i, (s, txt) in enumerate(st):
        if s == "x":
            cls, mark, tag = "done", "☑", ""
        elif i == cur or s == "~":
            cls, mark, tag = "cur", "▶", ' <span class="badge run">jetzt</span>'
        else:
            cls, mark, tag = "open", "☐", ""
        items.append(f'<li class="{cls}"><span class="box {cls}">{mark}</span> {esc(txt)}{tag}</li>')
    pct = 100 * done / len(st)
    return (
        f"<h2>Gesamtplan: {done} von {len(st)} Schritten erledigt</h2>"
        f'<div class="bar"><span style="width:{pct:.1f}%;background:{COLORS["done"]}"></span></div>'
        f"<ul class='steps'>{''.join(items)}</ul>"
    )


def tally(rows: list[dict[str, str]]) -> dict[str, int]:
    c = dict.fromkeys(KIND_LABEL, 0)
    for p in rows:
        c[kind(p["status"])] += 1
    return c


def bar_html(c: dict[str, int]) -> str:
    total = max(sum(c.values()), 1)
    spans = "".join(
        f'<span style="width:{100 * c[k] / total:.1f}%;background:{COLORS[k]}" title="{KIND_LABEL[k]}: {c[k]}"></span>'
        for k in ORDER
    )
    return f'<div class="bar">{spans}</div>'


def queues_html(work: list[dict[str, str]]) -> str:
    secs: dict[str, list[dict[str, str]]] = {}
    for p in work:
        secs.setdefault(p.get("sec", ""), []).append(p)
    rows = []
    for sec, ps in secs.items():
        lines = [(f"<b>{esc(sec or 'Queue')}</b>", ps)]
        lines += [(f"&nbsp;&nbsp;{esc(label)}", [p for p in ps if p["id"].startswith(pre)]) for pre, label in GROUPS]
        for name, gp in lines:
            if not gp:
                continue
            c = tally(gp)
            rows.append(
                f"<tr><td>{name}</td><td><b>{c['merged'] + c['done']}</b> / {len(gp)}</td><td>{c['run']}</td>"
                f"<td>{c['check']}</td><td>{c['fail']}</td><td>{c['open']}</td><td style='width:34%'>{bar_html(c)}</td></tr>"
            )
    if not rows:
        return "<p>Keine Queue-Zeilen gefunden.</p>"
    return (
        "<table><tr><th>Queue / Gruppe</th><th>fertig</th><th>in Arbeit</th><th>Abnahme</th><th>Fehler</th>"
        "<th>offen</th><th>Fortschritt</th></tr>" + "".join(rows) + "</table>"
    )


def resources_html() -> str:
    mem: dict[str, int] = {}
    for line in read(Path("/proc/meminfo")).splitlines():
        key, _, val = line.partition(":")
        if val.split():
            mem[key] = int(val.split()[0])
    st, sf = mem.get("SwapTotal", 0), mem.get("SwapFree", 0)
    swap = f"{100 * (st - sf) / st:.0f} %" if st else "–"
    items = [f"<li>Freier Speicher <b>{mem.get('MemAvailable', 0) / 1048576:.1f} GB</b> · Swap belegt <b>{swap}</b></li>"]
    for entry in _json_env("STATUS_CMDS"):
        if isinstance(entry, list) and len(entry) == 2:
            out = run_out(["/bin/bash", "-c", str(entry[1])]).splitlines()[-3:]
            items.append(f"<li>{esc(str(entry[0]))}: <code>{esc(' · '.join(out) or 'keine Ausgabe')}</code></li>")
    return "<ul>" + "".join(items) + "</ul>"


def md_list_text(text: str) -> str:
    items: list[str] = []
    for line in text.splitlines():
        if line.startswith("- "):
            items.append(f"<li>{esc(line[2:])}</li>")
        elif line.startswith("  ") and items:
            items[-1] = items[-1][:-5] + " " + esc(line.strip()) + "</li>"
    return "<ul>" + "".join(items) + "</ul>"


def decisions() -> str:
    part = read(PLAN_DIR / "PLAN.md").split("## Ohne dich entschieden", 1)
    return md_list_text(part[1]) if len(part) == 2 else ""


def journal_html(journal: str, n: int = 16) -> str:
    lines = [ln[2:] for ln in journal.splitlines() if ln.startswith("- ")]
    return "<ul class='journal'>" + "".join(f"<li>{esc(ln)}</li>" for ln in reversed(lines[-n:])) + "</ul>"


CSS = """
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}
main{max-width:1180px;margin:0 auto;padding:24px}
h1{font-size:1.6em;margin:0 0 4px} h2{font-size:1.15em;margin:28px 0 8px;border-bottom:1px solid #2a2f3a;padding-bottom:4px}
small,.muted{color:#9aa3b2} a{color:#7ab7ff}
table{border-collapse:collapse;width:100%;font-size:.93em} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #222733;vertical-align:top}
th{color:#9aa3b2;font-weight:600}
code{background:#1c2130;padding:1px 4px;border-radius:4px;font-size:.92em}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.85em;white-space:nowrap}
.badge.merged{background:#1f4d2e;color:#9ff0b5}.badge.done{background:#24452f;color:#b9f5c8}
.badge.check{background:#5a4211;color:#ffd77a}.badge.run{background:#173a5e;color:#9ccdff}.badge.open{background:#33373f;color:#c9ced8}
.ok{color:#8fe3a3}.bad{color:#ff8a8a}.warn{color:#ffcc66}.live{color:#9ccdff}
.bar{height:16px;background:#262b36;border-radius:8px;overflow:hidden;display:flex}
.bar span{display:block;height:100%}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
.card{background:#171b24;border:1px solid #232938;border-radius:10px;padding:10px 14px;min-width:150px}
.card b{font-size:1.4em;display:block}
ul{padding-left:20px} li{margin:4px 0} ul.journal li{font-size:.88em;color:#c7cdd8}
h3{font-size:1.02em;margin:18px 0 6px;color:#cfd6e4}
.badge.fail{background:#5a1f1f;color:#ffb3b3}
.box{font-weight:700}.box.done{color:#8fe3a3}.box.open{color:#6b7280}.box.cur{color:#9ccdff}
ul.steps{list-style:none;padding-left:4px} ul.steps li.done{color:#9aa3b2} ul.steps li.cur{color:#fff;font-weight:600}
li.sub{margin-left:18px;font-size:.95em}
section.overview{background:#141822;border:1px solid #232938;border-radius:10px;padding:4px 18px 12px;margin-top:14px}
details summary{cursor:pointer;color:#9aa3b2;margin:12px 0}
"""


def render() -> str:
    pk = packages()
    journal = read(PLAN_DIR / "JOURNAL.md")
    work = [p for p in pk if p["id"] != "PLAN"]
    counts = tally(work)
    active: list[str] = []
    finished: list[str] = []
    for p in pk:
        k = kind(p["status"])
        live = ""
        if k in {"run", "check"}:
            m = re.search(RUN_ID, p["status"])  # runId steht meist in der Statuszelle, sonst im Journal
            rid = m.group(0) if m else latest_run(p["id"], journal)
            live = run_state(rid) if rid else ""
        row = (
            f"<tr><td><b>{esc(p['id'])}</b></td><td>{esc(p['inhalt'])}</td><td><small>{esc(p['modell'])}</small></td>"
            f'<td><span class="badge {k}">{esc(p["status"])}</span></td><td>{live}</td></tr>'
        )
        (finished if k in {"merged", "done"} else active).append(row)
    head = "<tr><th>Auftrag</th><th>Inhalt</th><th>Modell</th><th>Status</th><th>Live</th></tr>"
    done = counts["merged"] + counts["done"]
    cards = "".join(f'<div class="card"><b>{counts[k]}</b>{KIND_LABEL[k]}</div>' for k in ORDER)
    ov_top, _, ov_rest = read(OVERVIEW_MD).partition("<!-- STEPS -->")
    nutzer = md_list_text(read(PLAN_DIR / "NUTZER.md"))
    if "<li>" not in nutzer:
        nutzer = "<p>Gerade nichts – alles läuft ohne dich weiter.</p>"
    wd = read(WATCHDOG_LOG).strip().splitlines()
    wd_last = wd[-1] if wd else "kein Eintrag"
    tasks_html = "".join(f"<li>{esc(t)}</li>" for t in background_tasks()) or "<li>keine</li>"
    now = time.strftime("%d.%m.%Y %H:%M:%S")
    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="60"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(TITLE)}</title><style>{CSS}</style></head><body><main>
<h1>{esc(TITLE)}</h1>
<p class="muted">Aktualisiert {now} · erneuert sich per Timer, die Seite lädt jede Minute neu.</p>
<section class="overview">{md_to_html(ov_top)}{steps_html()}{md_to_html(ov_rest)}</section>
<h2>Laufende Arbeit: {done} von {len(work)} Aufträgen in den Queues fertig</h2>
{queues_html(work)}<div class="cards">{cards}</div>
<h2>Ressourcen und Kontingent</h2>{resources_html()}
<h2>Aufträge in Arbeit oder offen ({len(active)})</h2>
<table>{head}{"".join(active)}</table>
<details><summary>Fertige Aufträge anzeigen ({len(finished)})</summary><table>{head}{"".join(finished)}</table></details>
<h2>Pull Requests</h2>{pull_requests()}
<h2>Commits auf den Arbeits-Branches</h2>{commits()}
<h2>Kontrolle (Loop)</h2>
<p>Watchdog: <code>{esc(wd_last)}</code></p>
<p>Laufende Wachen/Hintergrundaufgaben des Orchestrators:</p><ul>{tasks_html}</ul>
<h2>Bleibt bei dir</h2>{nutzer}
<h2>Ohne dich entschieden</h2>{decisions()}
<h2>Bisher erledigt</h2>{md_list_text(read(PLAN_DIR / "ERLEDIGT.md"))}
<h2>Journal (neueste zuerst)</h2>{journal_html(journal)}
</main></body></html>
"""


def main() -> None:
    page = render()
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(page, encoding="utf-8")
    tmp.replace(OUT)


if __name__ == "__main__":
    main()
