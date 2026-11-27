---
name: lumi-claw-wp-review
description: "Zweitprüfung eines Lumi-Claw-Arbeitspakets (Worker hat gebaut, Prüfer liest nur) — Verdrahtung über die Verteilertabellen statt Erzeugerfunktionen nachweisen, Status-Vokabular umgesetzt|ersatz gegen echte Erreichbarkeit prüfen, deutscher Seitentitel, Mock-Tests einordnen; dazu Orchestrator-Seite: Prüfer-Wahl, URTEIL aus session.jsonl ziehen, Fremdpfad-Check. Use when a claw work package must be second-checked or its status yaml, report, handbook fragment or wiring is reviewed."
---

# lumi-claw-wp-review

# lumi-claw-wp-review

Arbeitspaket (Katalog-IDs, Status-YAML, Bericht, Handbuch-Fragment) wurde von einem Worker gebaut; der Prüfer liest nur und urteilt `URTEIL: ok|nacharbeit` mit Funden P1/P2/Hinweis als Datei:Zeile. Orchestrator-Seite: Skill subagent-orchestration.

## Orchestrator: Prüfer starten und Befund holen
1. Prüfer-Wahl nach Weisung der Leitstelle: von glm gebaute Pakete brauchen einen Claude-Prüfer (sonnet reicht); von Claude gebaute Pakete darf glm prüfen. Bei geschlossenem Claude-Tor: abnehmen + Endlauf, Zelle „wartet auf Claude-Prüfung“, nicht einbauen.
2. Vorher selbst: `wpq.py abnahme <WP>` OK, Endlauf grün, Fremdpfad-Check `git diff $(git merge-base HEAD feat/lumi-claw) --stat` (nur Modulordner, Status, Bericht, freigegebene Pfade). Prüfer ohne Shell können das nicht.
3. Die Benachrichtigung des Prüfers enthält oft nur den Lernpass-Text. Das echte URTEIL steht in `<session>/<runId>/run-0/session.jsonl`: letzte assistant-Textstelle mit „URTEIL“ (ohne „skill_manage“) per Python extrahieren und wörtlich in `spuren/<Spur>/nacharbeit/<WP>.md` ablegen, darunter den verbindlichen Auftrag des Orchestrators.
4. Fehlt für ein P1 eine Hotspot-Datei in den Pfaden (z. B. `cmd/claw/mod.rs`): eine Zeile freigeben (vorgaben/<WP>.pfade + ENTSCHEIDUNGEN.md), dann Worker resumen.

## Prüfer: Ablauf
1. **Stand statt Bericht:** Status-YAML und Bericht lesen, jede Aussage im Code belegen.
2. **Verdrahtung über die Konsumenten-Tabelle, nicht den Erzeuger:** `gruppe()` mit `generate_handler!` ist keine Verdrahtung. Tauri → Eintrag in `cmd/claw/mod.rs::gruppen()` (sonst „Command not found“); Terminal → Registry in `claw/cli/mod.rs`, nicht nur ein `registry_mit_*`-Helfer; UI-Seite → Glob in `ui/src/claw/area.ts` plus Befehlsaufrufer der Karte; Handy → `lib/claw/registry.g.dart` ist ein eingecheckter leerer Stub (kein Defekt). `basis/mod.rs` nutzt Build-Scan: Unterordner werden ohne `pub mod` kompiliert.
3. **Erreichbarkeit je Funktion:** `#![allow(dead_code, unused_imports)]` oder „nur der Test kennt die Einstiege“ = P1; jede `pub fn` ohne Aufrufer außerhalb Modul+Tests auflisten.
4. **Status-Vokabular:** nur `umgesetzt|ersatz|nutzer|offen` (`tools/claw-catalog-check.mjs`); „teilweise“ gibt es nicht. Logik+Tests fertig ohne Betriebsaufrufer = `ersatz` mit Notiz; `umgesetzt` ohne Laufzeitpfad = P1.
5. **Seitentitel:** `titel: "<schlüssel>"` in `page.ts` braucht `i18n/desktop/claw-<bereich>-<gruppe>.de.json`, sonst erscheint der rohe Schlüssel; ohne Datei deutscher Klartext. `.en/.ru.json` allein genügt nicht (Deutsch ist Hauptsprache).
6. **Tests:** Mock-Tests (UI `overrideMock`, Handy-Fake-Gateway) bestehen auch ohne echten Backend-Befehl → jede mockierte Befehlsnummer in der Verteilertabelle gegenprüfen. Handbuch-Sätze „gibt es im Terminal/am Handy“ brauchen einen „Stand:“-Satz, wenn der Anschluss fehlt. Katalog-Testverweise auf Existenz UND Inhalt prüfen.
7. **Geheimnisse:** tmp-Datei mit Rechten beim Anlegen (`OpenOptions` + `mode(0o600)`), fsync, eindeutiger Name — nachträgliches `set_permissions` lässt ein Umask-Fenster. Maskierung case-insensitiv (apiKey, password, …Token). Schreibende Klartext-Befehle: Plan mit `<redacted>`, erst nach „yes“, Antwort ohne Wert.
9. **Nachprüfung nach Nacharbeit:** jeden Altbefund an der Fix-Stelle belegen UND einen rot-zuerst-Test dafür finden (Tauri: `route()` je Name aus `BEFEHLE`; Rechte: Mode-Test). Danach alte Aussagesätze greppen (`nicht verdrahtet`, `Hotspot`, `alle umgesetzt`, `gibt es im Terminal/am Handy`, `gelten beim nächsten Start`) in Modul-Doc-Kommentar, Berichtskopf, UI-Untertitel (de+en+ru) und Handbuch-Fragment — die Nacharbeit ändert Fix-Stelle und Status-YAML, lässt aber alte Sätze stehen. Solange Status/Handbuch ehrlich sind: P2, `URTEIL: ok` mit Liste. Geändertes Handbuch-Fragment: neuen Satz in `handbuch.html` greppen (Regeneration). Eindeutiger tmp-Name → `create(true)` statt `create_new(true)` (PID-Wiederverwendung nach Absturz = dauerhaft „File exists“).
8. **Urteil:** `nacharbeit` bei jedem P1. Hotspot-Dateien nicht selbst ändern, sondern „eine Zeile, Freigabe nötig“ empfehlen.
