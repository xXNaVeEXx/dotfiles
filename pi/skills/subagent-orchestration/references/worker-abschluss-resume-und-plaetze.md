# Worker-Abschluss per Resume, Platzzählung und Betriebsfallen (Spur mit Queue-Werkzeug)

## Worker endet vor dem Abschluss
- Zeitlimit mit uncommitteter Arbeit: `abnahme` nennt die Mängel (Änderungen nicht committet, keine Commits, Bericht fehlt). Zuerst Stand sichern: `git add <Pfade>` + `git commit -m "chore(<scope>): <Paket> Zwischenstand vor Resume"`. Der Commit-Hook lehnt Betreffs ohne Conventional-Commits-Typ ab (`wip(…)` wird geblockt); bei Fehlschlag steht die Änderung weiter ungestaged, also `git log -1` prüfen.
- Dann `subagent({action:"resume", id:<alte Run-Id>, message, options:{timeoutMs}})`. Die Nachricht enthält nur nummerierte Restpunkte (Tests/Clippy einmal gezielt mit Ausgabe in Datei, Handbuch/Tour, Status-YAML einzeilig, Bericht mit `ERGEBNIS: fertig – …`, `abnahme` OK, Commit), „kein Neuanfang“, „keine neuen Prüfläufe, den Endlauf macht der Orchestrator“ und eine harte Frist (20–40 min). Ein zweiter Resume mit Frist ist normal; Worker mit langer Tool-Kette erreichen sonst wieder das Limit.
- Meldet `status.json` eines Laufs `state: complete`, obwohl Bericht und Abnahme offen sind (häufig nach einem `steer` mitten im Bauen; die „Fertig“-Benachrichtigung enthält dann nur den Lernpass-Text): Bericht-Endzeile auf Platzhalter (`ERGEBNIS: @@ERGEBNIS@@`, `ERGEBNIS_PLATZHALTER`) und `git log feat..` prüfen, dann wie oben resumen, nicht neu starten.
- Nach dem Resume-Start Wächtermeldungen „tool bash open for 240s“ mit wenigen Turns sind normaler Bau/`rb.sh`; nicht eingreifen.
- Hält ein Brief „Handbuch: keine“, gilt das (Worker meldet es im Bericht unter Abweichungen); bei Handbuch-Pflicht fehlt nach dem Bau oft `node tools/manual-gen.mjs` – der Endlauf-Schritt `ui` wird sonst rot (Drift).

## Plätze zählen
- Obergrenzen gelten über beide Spuren: Claude-Läufe (Worker + Prüfer) und Endläufe (`check` UND `integ` mit Neu-Endlauf, auch die der Fremdspur). Vor jedem Start `pgrep -af 'wpq.py (check|integ)'` und die Stand-Ausgabe der Nachbarspur lesen; ein zu viel gestarteter Endlauf wird wieder beendet und der Status auf „wartet auf Endlauf-Platz“ gesetzt, Journalzeile dazu.
- Endlauf beenden: `pgrep -f '<muster>'` im selben Befehl mit `pkill -f '<muster>'` trifft die eigene Shell-Kommandozeile (Exit 143, restlicher Block läuft nicht). Stattdessen erst PIDs listen, dann `kill <pid>` oder Muster mit Klammertrick (`'wpq.py [c]heck …'`).
- Zweiter Herzschlag versehentlich gestartet: sofort den neuen per `bg_kill`; beim Starten vorher `pgrep -af 'warte.sh <Spur>'` ansehen (der alte läuft bis zu 25 min).
- Modell eines Pakets gewechselt (z. B. Plan „glm“, Anbieter gesperrt → sonnet): die Zeile `Dein Modell: …` in der Briefdatei per `sed` anpassen, Modell im `subagent`-Aufruf setzen, Queue-Zelle `läuft <runId> <modell>`, Journal. `vorgaben/<WP>.pfade` nur anlegen, wenn sie fehlt (`[ -e … ] || cp …`); `cp` ohne Prüfung überschreibt bestehende Freigaben.

## Endlauf-Abbruch 255 beim Bau
- Fehlt im Log jede `RB_OOM`-Zeile, aber der Test-Schritt endet direkt nach `Compiling …` mit `RB_EXIT=255`, war es ein Kernel-OOM im Scope des Slots, den `rb.sh` nicht erkannte. Auf dem Build-Host Kernel-Journal (`journalctl -k --since …`) lesen. Wiederholung mit `CLAW_MEM=7G LUMI_REMOTE_JOBS=2` (größerer Deckel passt bei zwei parallelen Endläufen nicht in den RAM des Hosts), nicht den Worker nacharbeiten lassen.
