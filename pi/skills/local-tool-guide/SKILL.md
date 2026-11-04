---
name: local-tool-guide
description: Deutschsprachige Anleitungen (Funktion + Keybindings) für lokal installierte CLI-Tools schreiben, die dem Live-Stand dieser Maschine entsprechen — Existenz-Check statt Tippfehler-Raten, --help/--default-config/lokale Config als Override-Merge, Upstream-Doku nur als Ergänzung, Abweichungen markieren. Use when the user asks how an installed terminal tool works or wants its keybindings or cheat sheet.
---

# local-tool-guide

# Local-Tool-Guide (Anleitungen aus dem Live-Stand der Maschine)

Klasse: Der Nutzer fragt „wie funktioniert Tool X / welche Keybindings hat X" für ein lokal installiertes CLI-Tool. Ziel: eine deutsche Anleitung (Markdown-Datei + Artifact), die dem **Live-Zustand dieser Maschine** entspricht — nicht den Upstream-Defaults.

## Verfahren (in dieser Reihenfolge)

1. **Existenz prüfen statt Tippfehler raten.** Auch verstümmelte Tool-Namen sind oft echte lokale Programme: `which <name>` (auch mehrere Kandidaten), `file $(which …)`, `pacman -Qi <name>` / `pacman -Qo <pfad>`. Erst wenn nichts existiert, nachfragen oder bekanntes Tool vermuten. Niemals einen „Tippfehler" ungeprüft in ein fremdes Tool (z. B. herdr ≠ hyprland/hermes) umdeuten.
2. **Live-Wahrheit ernten:** `<tool> --help` (komplette CLI-Oberfläche; nennt Config-/Log-Pfade am Ende), Man-Page, und Defaults-Dumper wie `--default-config` / `--print-defaults` / `-DD` — der Help-Text verrät meist, welcher Flag existiert.
3. **Lokale Config als Override-Merge lesen** (Pfad stammt aus Schritt 2, meist `~/.config/<tool>/`). Live-Stand = Defaults ⊕ lokale Overrides; **nicht lokal gesetzte Keys behalten die Defaults** — diese Mischung in die Anleitung übernehmen und jede Abweichung vom Default markieren (Spalte „Upstream-Default" o. ä.).
4. **Agent-facing Ressourcen des Tools nutzen**, wenn der Help sie anbietet (`llms.txt`, `agent-guide.md`, `--skill`-Flag, docs-Basis-URL) — sie sind genau für diese Aufgabe geschrieben. Docs-Seiten per fetch_content ziehen, statt zu raten.
5. **Anleitung schreiben:** `~/<tool>-anleitung.md`, deutsch, kurz + tabellarisch. Struktur: Was ist es (1 Absatz) → Konzeptmodell → Keybindings (Live-Merge, gruppiert, Abweichungen markiert) → CLI-Spickzettel → Konfiguration → Troubleshooting. Footer: erzeugende Quellen + Version. Danach per `artifact` registrieren und im Chat nur Top-5-Bindings + größte Abweichung zusammenfassen.
6. **Wahrheits-Verweis einbauen:** falls das Tool einen Live-Viewer hat (z. B. herdr `prefix+?`), prominently nennen — der schlägt jede statische Tabelle, sobald die Config wechselt.

## Fallstricke

- **Upstream-Doku allein lehrt falsche Keys**, weil lokale Config-Overrides Defaults still ersetzen (Mechanismus: Override-Semantik in `[keys]`-Sektionen) — Web-Doku nur als Ergänzung, nie als Quelle der Bindings auf dieser Maschine.
- **Multi-Binding-Syntax nicht kürzen:** Configs binden Aktionen oft als Arrays oder Ranges (`["prefix+c", "alt+c"]`, `1..9`) — beide Bindings in die Tabelle übernehmen, direkte Chords (ohne Prefix) separat hervorheben.
- **Selbst-Update-Kanal beachten:** Tools mit eingebautem Updater (`<tool> update`) driften von Paketmanager-Versionen; Versionszeile im Footer hält die Anleitung überprüfbar.

## Instanz-Referenzen

- `references/herdr.md` — herdr (Terminal-Workspace-Manager für AI-Agenten): Live-Binding-Berechnung, Maschinen-Spezifika, Remote-Machines + Agent-Notifications (`machine add`/`--remote`/`agent wait`), agent-facing Ressourcen.
- `references/interactive-trainer-page.md` — Muster für interaktive Trainings-HTML (`~/<tool>-schulung.html`): Tab-Aufbau, Chord-Auflösung, Tastatur-Capture, lokaler Chat-Agent, Fallstricke (innerHTML-STOP, node --check).
