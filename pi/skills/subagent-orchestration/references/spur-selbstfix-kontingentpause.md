# Geschlossenes Kontingent-Tor: Spur-Selbstfix, Herzschlag bis Pausenende, Wecker der Folgewoche

Ergänzt `spur-orchestrator-betrieb.md` und `kontingent.md`. Gilt, wenn der Leitstand ein Anbieter-Kontingent sperrt (keine neuen Starts, keine Nacharbeit-Worker), aber fertige Pakete weiter abgenommen und integriert werden sollen – oft über mehrere Tage bis zum Wochenwechsel.

## Spur (L1)

- Mechanische Abnahme-/Integrationsmängel selbst im Paket-Worktree beheben, jeweils mit Eintrag in der Entscheidungsdatei, `git add <Pfad>` + `git commit` und erneutem `abnahme`; kein Worker-Resume. Grund: Nacharbeit-Worker sind gesperrt, die Fixes sind klein und deterministisch.
  - Status-YAML: das Feld `test` muss EIN String `<pfad ab Repo-Wurzel>::<testname>` sein, keine Liste (sonst „Testdatei [...] fehlt“ für jede ID); weitere Tests als Text in `notiz`.
  - Berichtsschlusszeile: `ERGEBNIS: fertig – … bewusst offen (siehe „Nicht umgesetzt oder nur teilweise“)`, wenn nur ehrlich benannte Rest-Lücken ohne Umsetzbarkeit bleiben. Gleich beim ersten Abnehmen ändern: `integ` prüft strikt auf `fertig` und bricht sonst erst nach dem Start mit Exit 1 ab.
  - Ein Bestandstest im Hotspot, den die Pflicht-Migration/Registrierung des Pakets bricht (z. B. exakte Migrationsliste), tolerant machen (erster Eintrag + Präfixprüfung) und die Datei per `vorgaben/<WP>.pfade` freigeben.
- Ohne Reviewer (Kontingent) reicht eine Stichprobe: Testnamen aus der Status-Datei per `grep` in der Testdatei und Diff-Stichprobe; das im Journal vermerken. Ein so abgenommener Selbstfix bekommt nach der Pause als Erstes ein echtes Review (anderes Modell), bevor davon abhängige Pakete starten – den Merkposten ins Journal, nicht in die Queue-Statusspalte (Werkzeuge erkennen „fertig“ per Spaltenende).
- Schwere Läufe nacheinander: den Endlauf des zweiten Pakets erst starten, wenn die `integ` des ersten durch ist (RAM, geteilter Build-Cache).
- Herzschlag: bei einer mehrtägigen Pause EINEN `warte.sh <Spur> --quota <anbieter> --max <sek bis Pausenende + 300>` (bg_run, `timeoutSeconds` = max + 600) statt 6-h-Takten. Grund: Jeder Takt weckt die Spur mit kaltem Prompt-Cache; über 5 Tage sind das ≈ 20 teure Turns je Spur auf Kosten der Nutzer-Reserve. Alten Herzschlag per `bg_kill` beenden (dessen „killed“-Meldung ist erwartet), neuen starten, per `pgrep` genau einen bestätigen. Journal nur noch bei Meilensteinen.

## Leitstand (L0)

- Pausenbeginn als EIN wiederholbarer Befehl (Sparskript): PAUSE-Datei `<bis-epoch> <grund>` je aktiver Spur und für den Leitstand selbst (Watchdogs schweigen bis dahin), Leerlauf-Schwelle des Leitstand-Watchdogs hoch, transienter Aus-Timer kurz nach dem Wochenwechsel. Das Skript gibt je Spur den passenden Herzschlag-Befehl aus; die Spuren per Prompt anweisen (keine Starts/Nacharbeit, Herzschlag bis Pausenende).
- Laufende Aufsichten enden bei neuer PAUSE-Datei mit „PAUSE“ → einmal neu starten; in der Pause gestartet bleiben sie still bis zum Pausenende.
- Pakete im Endlauf zu Ende laufen lassen (ihre Kosten sind schon angefallen, ein Abbruch verschwendet sie); Nacharbeit auf dem teureren Modell erst nach dem Wochenwechsel.
- Der eigene Leitstand-Turn ist meist der teuerste (großer Kontext, kalter Cache): in der Pause keine Prüf-Wecker nur zur Bestätigung von Spur-Umstellungen – die Spur prüft per `pgrep` selbst.
- Den Wecker für die Grenze der Folgewoche gleich mit scharf schalten: Start erst kurz nach dem Wochenwechsel (`ab_epoch`), „Grenze erreicht“ erst zählen, nachdem ein Wert UNTER der Grenze gesehen wurde (Schutz vor dem Altwert der Vorwoche), sonst nach einer Frist „unklar“ melden.
- Selbsttests solcher Wecker: Ausgabe erst greppen, dann kürzen – `cut -c` zählt Bytes, ein „–“ (3 Bytes) verschiebt die Grenze und lässt den gesuchten Text wegfallen (falsches Rot).
