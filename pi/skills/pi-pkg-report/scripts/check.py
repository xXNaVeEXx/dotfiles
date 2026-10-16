#!/usr/bin/env python3
"""Kollisions-Check: prüft installierte Pi-Erweiterungen auf Konflikte und Dopplungen.

Zwei Ebenen:
1. HARTE Kollisionen (deterministisch aus dem Paket-Code gescannt):
   - identische Slash-Command-Namen in 2+ Quellen
   - identische Tool-Namen in 2+ Quellen
   - identische Skill-Namen in 2+ Quellen (Paket-Skills + User-Skills)
   Quellen: npm-Pakete aus settings.json UND Eigenbau-Extensions aus
   ~/.pi/agent/extensions/ (Labels "eigenbau:<name>").
2. WEICHE Überlappungen (kuratierte Rollen-Matrix unten): Erweiterungen, die sich
   funktional überschneiden — mit Bewertung, ob das OK (ergänzend) oder
   kritisch (echte Dopplung) ist. Bei neuen Erweiterungen: Rollen ergänzen und
   Verdict formulieren, sonst fällt "manuell prüfen".
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HOME = Path.home()
NM = HOME / ".pi/agent" / "npm" / "node_modules"
SETTINGS = HOME / ".pi/agent" / "settings.json"
USER_SKILLS = HOME / ".pi/agent" / "skills"
EXT_DIR = HOME / ".pi/agent" / "extensions"
EXT_EXCLUDE = {"node_modules", "tsconfig.json"}
AS_JSON = "--json" in sys.argv

# ---------------------------------------------------------------- Regexen --
RE_CMD_LIT = re.compile(r"registerCommand\s*\(\s*[\"']([/A-Za-z0-9_.:-]+)[\"']")
RE_CMD_ID = re.compile(r"registerCommand\s*\(\s*([A-Z][A-Z0-9_]*)\s*[,)]")
RE_TOOL_LIT = re.compile(r"registerTool\s*\(\s*[\"']([A-Za-z0-9_.-]+)[\"']")
RE_TOOL_OBJ = re.compile(r"registerTool\s*\(\s*\{\s*name\s*:\s*[\"']([A-Za-z0-9_.-]+)[\"']")
RE_DEF = r"(?:const|let|var|export const)\s+%s\s*=\s*[\"']([^\"']+)[\"']"
RE_SKILL_NAME = re.compile(r"^name:\s*(\S+)\s*$", re.MULTILINE)

# ----------------------------------------------------- kuratierte Rollen --
# Erweiterung -> Menge funktionaler Rollen. Schnittmengen = weiche Überlappung.
# Eigenbau-Extensions tragen das Präfix "eigenbau:".
ROLES: dict[str, set[str]] = {
    "pi-mcp-adapter": {"mcp"},
    "billion-context": {"context-kompression"},
    "pi-web-access": {"web-zugriff"},
    "openwiki": {"wiki"},
    "pi-subagents": {"delegation", "code-review"},
    "pi-background-tasks": {"delegation", "hintergrund-jobs"},
    "pi-goal-x": {"zielverfolgung"},
    "@plannotator/pi-extension": {"plan-review"},
    "pi-simplify": {"code-review"},
    "pi-powerline-footer": {"terminal-ui"},
    "pi-lens": {"diagnostics"},
    "@narumitw/pi-usage": {"api-statistik"},
    "pi-antigravity": {"provider", "web-zugriff"},
    "bigpowers": {"methodik", "delegation", "code-review", "wiki", "plan", "zielverfolgung"},
    "eigenbau:artifacts": {"diff-viewer"},
    "eigenbau:error-hub": {"diagnostics"},
    "eigenbau:hermes-mind": {"self-improvement"},
    "eigenbau:kompakt": {"terminal-ui"},
}

# Bewertung bekannter Überlappungspaare (Sortierung egal, Key = frozenset).
VERDICTS = {
    frozenset({"pi-antigravity", "pi-web-access"}):
        "OK — antigravity.search läuft über die Google-Quota des Provider-Accounts, pi-web-access über Exa MCP zero-config (alternativ nutzbar, kein Konflikt)",
    frozenset({"bigpowers", "pi-subagents"}):
        "OK — bigpowers liefert Methodik-Skills, pi-subagents die Laufzeit-Agenten (ergänzend)",
    frozenset({"bigpowers", "pi-background-tasks"}):
        "OK — bigpowers delegate-task/dispatch-agents (Agenten-Orchestrierung) vs. bg_run/bg_delegate (dauerhafte Shell-Jobs + Fusion), ergänzend",
    frozenset({"bigpowers", "pi-simplify"}):
        "OK — bigpowers audit-code ist Agent-Checkliste, /simplify gezielter Diff-Review",
    frozenset({"bigpowers", "openwiki"}):
        "OK — bigpowers integriert OpenWiki (maintain-wiki), keine Dopplung",
    frozenset({"bigpowers", "pi-goal-x"}):
        "OK — Methodik-Skills vs. persistentes Ziel-Daemon, unterschiedliche Ebenen",
    frozenset({"bigpowers", "@plannotator/pi-extension"}):
        "OK — Plan-Skills (find-way/plan-work) vs. visueller Browser-Review",
    frozenset({"pi-subagents", "pi-background-tasks"}):
        "OK — interaktive Review-Delegation vs. dauerhafte Shell-Jobs/Fusion",
    frozenset({"pi-subagents", "pi-simplify"}):
        "OK — Review-Kind-Agent (voller Context) vs. /simplify (nur geänderte Zeilen)",
    frozenset({"pi-lens", "eigenbau:error-hub"}):
        "OK — pi-lens erzeugt die Diagnosen, error-hub aggregiert und zeigt sie an (ergänzend)",
    frozenset({"pi-powerline-footer", "eigenbau:kompakt"}):
        "OK — kompakt rendert den Tool-Output, powerline die Statuszeile (ergänzend)",
}

B, Y, G, D, R = "\033[1m", "\033[33m", "\033[32m", "\033[2m", "\033[31m"
X = "\033[0m"


def scan_package(pkg_dir: Path) -> tuple[set[str], set[str]]:
    """Liest alle .js/.ts-Dateien einer Erweiterung und extrahiert Command-/Tool-Namen."""
    cmds: set[str] = set()
    tools: set[str] = set()
    texts: dict[Path, str] = {}
    files = [pkg_dir] if pkg_dir.is_file() else pkg_dir.rglob("*")
    for f in files:
        if not f.is_file() or f.suffix not in (".js", ".ts") or f.name.endswith(".d.ts"):
            continue
        try:
            texts[f] = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
    for t in texts.values():
        cmds.update(RE_CMD_LIT.findall(t))
        tools.update(RE_TOOL_LIT.findall(t))
        tools.update(RE_TOOL_OBJ.findall(t))
        for ident in set(RE_CMD_ID.findall(t)):
            m = re.search(RE_DEF % re.escape(ident), t)
            if m:
                cmds.add(m.group(1))
    return cmds, tools


def scan_skills(pkg: str, root: Path) -> dict[str, str]:
    """Skill-Name -> Quelle für alle SKILL.md unter root."""
    out: dict[str, str] = {}
    for f in root.rglob("SKILL.md"):
        try:
            head = f.read_text(encoding="utf-8", errors="replace")[:800]
        except OSError:
            continue
        m = RE_SKILL_NAME.search(head)
        if m:
            out.setdefault(m.group(1), f"{pkg}:{f.parent.name}")
    return out


def installed_packages() -> list[str]:
    """Nur die echten Pi-Pakete aus settings.json — NICHT die Transitiv-Deps."""
    try:
        entries = json.loads(SETTINGS.read_text(encoding="utf-8")).get("packages", [])
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"Fehler beim Lesen von {SETTINGS}: {e}")
    names = [p[4:] for p in entries if isinstance(p, str) and p.startswith("npm:")]
    return [n for n in names if (NM / n).is_dir()]


def local_extensions() -> dict[str, Path]:
    """Eigenbau-Extensions: {label: pfad} — *.ts direkt + Unterverzeichnisse mit .ts."""
    eig: dict[str, Path] = {}
    if not EXT_DIR.is_dir():
        return eig
    for entry in sorted(EXT_DIR.iterdir()):
        if entry.name in EXT_EXCLUDE:
            continue
        if entry.is_file() and entry.suffix == ".ts":
            eig[f"eigenbau:{entry.stem}"] = entry
        elif entry.is_dir() and any(f.suffix == ".ts" for f in entry.iterdir()):
            eig[f"eigenbau:{entry.name}"] = entry
    return eig


def main() -> int:
    if not NM.is_dir():
        print("Kein node_modules-Verzeichnis gefunden.", file=sys.stderr)
        return 2
    pkgs = installed_packages()
    eig = local_extensions()
    if not pkgs and not eig:
        print("Keine Erweiterungen installiert.", file=sys.stderr)
        return 2

    all_cmds: dict[str, set[str]] = {}
    all_tools: dict[str, set[str]] = {}
    all_skills: dict[str, dict[str, str]] = {}
    for p in pkgs:
        cmds, tools = scan_package(NM / p)
        all_cmds[p], all_tools[p] = cmds, tools
        all_skills[p] = scan_skills(p, NM / p)
    for label, path in eig.items():
        cmds, tools = scan_package(path)
        all_cmds[label], all_tools[label] = cmds, tools
    if USER_SKILLS.is_dir():
        all_skills["~user~"] = scan_skills("~user~", USER_SKILLS)

    def dup_sources(reg: dict[str, set[str]]) -> dict[str, list[str]]:
        seen: dict[str, list[str]] = {}
        for pkg, names in reg.items():
            if pkg == "~user~" or not names:
                continue
            for n in names:
                seen.setdefault(n, []).append(pkg)
        return {n: ps for n, ps in seen.items() if len(ps) > 1}

    cmd_dups = dup_sources(all_cmds)
    tool_dups = dup_sources(all_tools)
    skill_seen: dict[str, list[str]] = {}
    for pkg, skills in all_skills.items():
        for n in skills:
            skill_seen.setdefault(n, []).append(pkg)
    skill_dups = {n: ps for n, ps in skill_seen.items() if len(ps) > 1}

    everything = list(all_cmds)  # npm + eigenbau, stabiler Quellen-Satz
    known = set(ROLES)
    if unknown := {p for p in everything if p not in known}:
        for p in unknown:
            ROLES[p] = set()

    overlaps = []
    for i, a in enumerate(everything):
        for b in everything[i + 1:]:
            shared = ROLES.get(a, set()) & ROLES.get(b, set())
            if shared:
                overlaps.append((a, b, shared))

    if AS_JSON:
        print(json.dumps({
            "command_collisions": cmd_dups,
            "tool_collisions": tool_dups,
            "skill_collisions": skill_dups,
            "role_overlaps": [{"a": a, "b": b, "shared": sorted(s)} for a, b, s in overlaps],
            "unclassified": sorted(unknown),
        }, ensure_ascii=False, indent=2))
        return 0

    print(f"{B}Kollisions-Check — {len(pkgs)} npm + {len(eig)} Eigenbau-Erweiterungen{X}\n")
    print(f"{B}1) Harte Kollisionen (Code-Scan){X}")
    if not (cmd_dups or tool_dups or skill_dups):
        print(f"  {G}✓ keine — keine doppelten Commands, Tools oder Skill-Namen{X}")
    for n, ps in sorted(cmd_dups.items()):
        print(f"  {R}✗ Command /{n.lstrip('/')} in {len(ps)} Quellen: {', '.join(sorted(ps))}{X}")
    for n, ps in sorted(tool_dups.items()):
        print(f"  {R}✗ Tool „{n}“ in {len(ps)} Quellen: {', '.join(sorted(ps))}{X}")
    for n, ps in sorted(skill_dups.items()):
        print(f"  {R}✗ Skill „{n}“ mehrfach: {', '.join(sorted(ps))}{X}")

    print(f"\n{B}2) Funktionale Überlappungen (Rollen-Matrix){X}")
    if not overlaps:
        print(f"  {G}✓ keine{X}")
    for a, b, shared in sorted(overlaps):
        v = VERDICTS.get(frozenset({a, b}), f"{Y}ÜBERLAPPUNG PRÜFEN{X} — kein Verdict hinterlegt")
        flag = "OK" if v.startswith("OK") else "?!"
        col = G if flag == "OK" else Y
        print(f"  [{col}{flag}{X}] {a} ↔ {b}: {', '.join(sorted(shared))}")
        print(f"         {D}{v}{X}")

    if unknown:
        print(f"\n{Y}⚠ Ohne Rollen-Classification (ROLES in check.py ergänzen):{X}")
        for p in sorted(unknown):
            print(f"  - {p}")

    hard = bool(cmd_dups or tool_dups or skill_dups)
    print(f"\n{'🔴' if hard else '🟢'} " + ("HARTE KOLLISION gefunden" if hard
          else "Sauber: keine Namens-Kollisionen, alle Überlappungen bewertet"
               if not unknown else "Sauber, aber Classification für neue Erweiterungen nötig"))
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
