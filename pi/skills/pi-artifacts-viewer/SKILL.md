---
name: pi-artifacts-viewer
description: Warten und Erweitern der Pi-Artefakt-Extension in ~/.pi/agent/extensions/artifacts/ (Auto-Diffs, /artifact-Viewer, Undo, Checks) — Architektur, Agent-Konventionen und bekannte Stolperfallen. Use when the user mentions artifacts, /artifact, diff viewer, artefact extension errors, or wants new viewer features.
---

# pi-artifacts-viewer

# pi-artifacts-viewer — Warten & Erweitern der Artefakt-Extension

Gilt für `~/.pi/agent/extensions/artifacts/` (index.ts + 6 Module). Die Extension läuft in
JEDER Pi-Session automatisch (auto-Diff-Artefakte bei jeder edit/write-Änderung des Agents,
Viewer via `/artifact <id|pfad>` als Overlay-Side-Sheet rechts).

## Architektur (Stand: V9+Sub-Agent-Features)

- `index.ts` — Registry (Map), `artifact`-Tool (params: path?, title?, note? — note-ohne-path
  hängt 💬-Kommentar ans jüngste Diff-Artefakt), `/artifact`+`/artifacts`-Commands
  (Zahl→id, Pfad→on-the-fly, sonst Fuzzy), ArtifactViewer-Komponente (TUI-Overlay,
  ctx.ui.custom mit overlayOptions anchor top-right, width "62%"|"100%").
- Module (relative Imports — jiti frisst sie NICHT, verifiziert; aber: keine Build-Step nötig,
  jiti lädt TS direkt): `undo.ts` (Snapshots ~/.cache/pi-artifacts/undo/, Housekeeping 100),
  `session.ts` (sessionDiff + commitProposal), `actions.ts` (yank/stage/openEditor),
  `worddiff.ts` (⟦⟧-Wortmarker), `shotdiff.ts` (Brave-Headless-VORHER/NACHHER-Bilder),
  `checkhook.ts` (Blitz-Syntaxcheck: node --check / python3 ast / json.tool).
- Wichtige Muster: `PI_ARTIFACTS_SELFTEST=1 pi -p --extension …/index.ts "OK"` = Load+Selftest;
  Hook feuert VOR Tool-Ausführung (Queue mit 500ms setTimeout für Quick-Check); Undo ist
  ARTEFAKT-SPEZIFISCH (artifactPre-Map id→Vorher-Inhalt, NICHT der globale Snapshot-Stapel);
  mtime-Watcher (1200ms) macht externe nvim-Änderungen live sichtbar, Banner nicht überschreiben.
- Tasten: 1/2/3=Quelle/Vorschau/Git, tab, n/p=Hunk (Wrap+Zähler, aktiver Hunk orange ▶),
  f=Vollbild (zustandserhaltend), v=w3m-tmux-Split, o=xdg-open, u=Undo(arm/confirm),
  y=yank, s=stage, c=Commit-Vorschlag, ⏎=nvim an Zeile, r=reload, Esc/q.

## Konventionen für den Agent-Betrieb

- Nach JEDER edit/write-Änderung: `artifact`-Tool OHNE path mit `note` (1–2 Sätze: wozu/Ziel/
  Bedeutung) aufrufen — erscheint als 💬 im Diff-Artefakt. Die Notiz hängt sich an das zur Ausführungszeit jüngste
  Diff-Artefakt: nie im selben parallelen Batch mit einer weiteren edit/write aufrufen, sonst landet sie am falschen Diff.
- Registry ist PRO RUNTIME: nach `/reload` ist sie leer → Demo-Material neu registrieren,
  bevor der User testen kann ("bin bereit zum testen" = Reload passiert).
- Testmaterial: `~/demo-repo/rechner.js` (Git-Repo, Demo-Funktionen absichtlich ungenutzt =
  Diff-Material), `~/artifact-demo/` (md/json/csv/png für Typ-Renderer).
- KI-Anwort beim Registrieren nennt dem User die Artefakt-Nummer + Testanleitung.

## Bekannte Stolperfallen

- pi-lens meldet bei jedem Edit der Extension "cannot find module @earendil-works/…" +
  Cascade — DAUER-FEHLALARM (Datei nicht im Review-Graph; Module resolven erst via jiti).
  Gegenbeweis ist der Load-Test oben. Meldungen zu ~/demo-repo ebenfalls ignorable.
- Direkter `node --experimental-strip-types`-Import scheitert an Parameter-Properties —
  irrelevant, jiti kann sie.
- th.bold() ist ein No-Op (emittiert keine Codes) — für Hervorhebung th.fg("warning", …).
- OSC-8/Screenshots: Brave headless braucht --headless=new + virtual-time-budget; chafa auf
  TERM=tmux-256color IMMER --format symbols (Sixel filtert tmux), Größe via TMUX_PANE.
- Umfeld: tmux mouse=on → User-Klicks brauchen Shift; guard-git blockt direkte main-Pushes
  (sanctioned: GIT_BIGPOWERS_LAND=1 …/bigpowers/scripts/land-branch.sh).
