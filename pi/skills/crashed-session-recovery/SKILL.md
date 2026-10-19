---
name: crashed-session-recovery
description: Nach abgestürzter/unbenutzbarer Vorher-Session den Projektstand rekonstruieren und als Orchestrator fortfahren — Stand aus Tracker-Docs, Git und .tmp-Logs aufbauen, tote Session nur gezielt befragen, Worker-Briefs gegen aktuelle Maschinenverfügbarkeit prüfen. Use when a previous session in a repo died or became unusable and its work must continue.
---

# crashed-session-recovery

# Abgestürzte/unbenutzbare Session im Projekt wieder aufnehmen

Use when a previous session in a repo died (crash, OOM, unusable) and work must continue from its state — especially long-running orchestrator projects with package trackers (Checkliste), per-package reports and worker logs.

## Verfahren (in dieser Reihenfolge)

1. **Repo-Dokumente zuerst lesen, nicht die tote Session.** Das Repo IST der Stand:
   - Tracker-Datei (z. B. `docs/CHECKLISTE.md`): Kopfzeile „Stand · Branch · letzter Commit“, Kurzübersicht, Paket-Marker (`[x]`/`🔄 läuft`).
   - Paket-Berichte (`docs/reports/*.md`): Abschnitte „3 Offen“ zeigen Reste und Fremd-Reste je Paket.
   - `docs/AGENT_BRIEF.md` o. ä.: Worker-Regeln (Build-Ort, Test-Befehle, Statuszeilen-Pflicht).
2. **Git-Dreiklang:** `git log --oneline` (was ist committet/gepusht), `git diff --stat` + `git status --short` (Mid-Flight-Arbeit; unversionierte Dateien = ganze neue Pakete), Remote-Differenz.
3. **`.tmp/*.log`-Zeitstempel** (`ls -lt .tmp/ | head`): welcher Schritt lief beim Tod? Log-Tail zeigen, nicht ganz lesen.
4. **Tote Session nur gezielt befragen:** `session_search` mit Paket-/Task-Schlüsselwörtern (FTS5, `sort:newest`), Snippets reichen. Nie eine Riesensession als Ganzes lesen (Context-Blowup). `{session_id}`-Read nur für klar eingegrenzte Bereiche.
5. **Stand dem Nutzer zusammenfassen, bevor weitergearbeitet wird** — Aufbau: gepusht / uncommittet fertig / beim Absturz laufend / danach offen / eigener Weiterfahrplan.
6. **Worker neu starten:** AGENT_BRIEF lesen, aber Maschinen-/Build-Ort-Regeln gegen die AKTUELLE Nutzer-Aussage prüfen. Wenn der Nutzer eine Maschine gesperrt/geändert hat: Abweichung explizit an den ANFANG der Aufgabe schreiben (stale Briefs leiten Builds sonst still auf tote Maschinen um). Bereits gestartete Worker sofort abbrechen und mit Override neu starten.
   - **Gestorbener Worker (SIGTERM/exit 143, Ausgabe-Wächter):** nicht neu vergeben, sondern `acp_delegate` mit `resumeFrom: <runId>` fortsetzen — stellt Session + Teilarbeit wieder her. Vorher Activity-Log-Ende und `git status` lesen, um die echte Restliste in die Fortsetzungs-Aufgabe zu schreiben.
   - **Beim Dispatch lange Builds ankündigen:** in die Aufgabe schreiben, dass Lange-Läufer als Hintergrundprozess mit Log gestartet und per Poll-Schleife (`sleep ≤120; tail`) begleitet werden, mit eigener Statuszeile nach jedem Schleifenschritt — sonst killt der Ausgabe-Wächter den Worker mitten im Build (Mechanismus: Stillstand ≠ Fortschritt, der Wächter sieht nur Ausgaben).
   - **Konsolidierung statt Split:** liegen mehrere fertige Pakete mit gemeinsam geänderten Dateien (Registrierungen, generierte Typen, Tracker) uncommittet herum, EIN Konsolidierungs-Commit je Konvention schreiben statt Hunk-Splitting — Zwischenstände ohne die gemeinsamen Dateien kompilieren nicht.
7. **Vor dem Commit verifizieren:** letzte grüne Testläufe aus `.tmp`-Logs bestätigen oder neu laufen lassen; mid-flight-Paket fertigstellen lassen; dann pro Paket einzeln committen in der Commit-Konvention des Repos (z. B. `feat(desktop): … (P8x)`), pushen, PR-Beschreibung auf Endstand bringen, Tracker-Doks aktualisieren.

## Stolperfallen

- Paket-Marker `🔄 läuft` sind beim Absturz STALE: Bericht vollständig + Tests grün heißt faktisch fertig — Berichte und Log-Zeitstempel schlagen Checkboxen.
- Uncommittet ≠ ungetestet: prüfe, ob die letzte Testrunde NACH der letzten Code-Änderung lief (Log-Timestamps vergleichen), sonst neu verifizieren.
- „Läuft gerade“-Pakete ohne Berichtsgerüst: Analyse-Stand steckt oft nur in `.tmp`-Logs und dem Bericht-Skeleton — beide lesen, bevor der Worker neu ansetzt.
- Cross-Paket-Notizen in Tracker-Doks („Besitzer bitte abhaken“, „fremd rot“) erst beim eigenen Doku-Pass auflösen, nicht vom Worker — sonst doppelte Bearbeitung derselben Dateien (Konflikt im Arbeitsbaum).
