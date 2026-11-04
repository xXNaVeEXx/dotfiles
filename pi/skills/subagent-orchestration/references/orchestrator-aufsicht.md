# Fremden Orchestrator beaufsichtigen und ihm Arbeit einplanen

Gilt, wenn ein ANDERER autonomer Orchestrator (eigene pi-Sitzung in einem eigenen herdr-Pane, eigener Watchdog) einen
Plan abarbeitet und diese Sitzung ihm Pakete einplanen und/oder aufpassen soll, dass er weiterarbeitet und nicht hängt.
Grundregel: Seinen Arbeitsbaum, seine Worker, seine Commits und sein Pane nie übernehmen. Gesteuert wird nur über seine
gitignorten Steuerdateien und über Nachrichten. Grund: Zwei Schreiber im selben Baum zerstören sich gegenseitig die
Mid-Flight-Arbeit, und schon ein `git switch` bricht an seinen uncommitteten Dateien ab.

## 1. Lesewerkzeuge
- Status: `herdr agent get <pane> | jq -r '.result.agent.agent_status'` → `idle` | `working` | `done` | `blocked`.
  `.result.agent.agent_session.value` ist der Pfad seiner Sitzungs-JSONL. Die SID ist der Dateiname ohne `.jsonl` ab
  dem ersten `_`, das cwd steht in der ersten Zeile (`{"type":"session",…,"cwd":…}`).
- Prozesse: `herdr pane process-info --pane <pane>` → `.result.process_info.foreground_processes[] {name,pid}`. Der
  Orchestrator-pi und seine acp_delegate-Worker-pi liegen in derselben Vordergrundgruppe. Worker erkennt man an
  `PI_ACP_DELEGATE_DEPTH=1` in `/proc/<pid>/environ`. Nicht global `pgrep -x pi` zählen, denn das zählt die Worker
  anderer Sitzungen mit.
- Seine bg_run-Tasks: `<cwd seiner Sitzung>/.pi/tasks/<SID>-<PID>/*.json` (name, status, pid, startTime/endTime in ms,
  exitCode), daneben `*.output`. `running` zählt nur, wenn `kill -0 <pid>` gelingt, weil die Einträge nach einem
  Absturz auf running stehen bleiben.
- Worker-Läufe: `/tmp/acp-delegate/<runId>.{session.jsonl,out,activity}`, Aktivität = mtime von `.activity`. Nur die
  runIds aus SEINER Sitzungsdatei zählen (`grep -oE 'del_[a-z0-9]+_[a-z0-9]+'`), nicht alle Dateien in
  `/tmp/acp-delegate/`. Grund: Aktive Läufe anderer Sitzungen verdecken sonst einen stillen Worker.
  Worker-pid → runId über die Startzeit: Lauf-Start = `.timestamp` der ersten Zeile von `<runId>.session.jsonl`,
  Worker-Start = jetzt − `ps -o etimes= -p <pid>`. Der Lauf mit dem kleinsten Abstand (≤ 5 min) gehört zum Worker.
  Worker aus derselben Minute trennt diese Zuordnung nicht sicher. Einen hängenden Lauf darum je runId suchen
  (§4 Punkt 5), nicht über die Worker-Liste.
- Bildschirm: `herdr pane read <pane>`, nur wenn Status und Dateien nicht reichen.
- Zeit aus Epoch-Werten: `date -d @<sek>` und `startTime/1000`.

## 2. Arbeit einplanen
1. Seine Steuerdateien lesen: Plan (Statuszeilen + Log), Auftragsdatei mit der Queue und die jüngsten Briefe nach mtime
   (`ls -t <briefordner> | head`). Die Briefe zeigen, was er als Nächstes starten will, auch wenn der Plan es noch
   nicht sagt.
2. Dateibesitz der laufenden Worker prüfen (`git --no-optional-locks status --short`, `git diff --stat`, Pfadgrenzen in
   deren Briefen).
3. Nur gitignorte Steuerdateien ändern:
   - Queue-Eintrag + Log-Zeile im Plan (Herkunft, Inhalt, Startbedingung).
   - Dieselbe Queue in der Auftragsdatei. Grund: Ein vom Watchdog neu gestarteter Orchestrator liest den Auftrag, nicht
     den alten Kontext.
   - Brief im Format seiner anderen Briefe: Startbedingung (z. B. „erst nach Commit von <PKG>“), Pfade parallel laufender
     Pakete als tabu, Teile, die nur über fremde Dateien gehen, als „entfällt“ oder „zurückstellen, falls fremd
     geändert“ markieren. Dazu die Pflicht, jeden Anker vor Beginn per `git grep -n <symbol> HEAD` neu zu bestimmen,
     weil die laufenden Pakete die Zeilen verschieben.
4. Kurze Nachricht: `herdr agent prompt <pane> "<Text>"`, zugeschnitten auf seine jüngsten Briefe (was statt was,
   welcher Brief anzupassen ist). Grund: Er hat die alte Queue im Kontext und liest die Datei nicht unbedingt neu.
   Bei `blocked` wird die Nachricht abgelehnt, bei `working` eingereiht und nach dem aktuellen Schritt zugestellt.
5. Bestätigung prüfen (Plan-Log, Status, notfalls `pane read`).

## 3. Aufsichts-Loop
- Vorlage: `scripts/orchestrator-aufsicht.sh`. Pflicht ist `AUF_PANE`, der Rest wird über `AUF_*` gesetzt (Projekt, Plan,
  Fortschritts-Globs, Worker-Logs, Schlussbericht, Watchdog-Timer/-Log, Schwellen). Das Skript pollt, ENDET bei einem
  Ereignis und schreibt einen Endblock. Dieses Ende weckt die Sitzung, also kein eigenes Polling und kein sleep.
- Plan-Form einstellen: Standard ist ein Plan mit `[x]`/`[~]`/`[ ] <PKG>`-Statuszeilen (`AUF_PLAN_RE`) und Log-Zeilen
  im selben Plan. Führt der Orchestrator eine Queue-Tabelle (`| ID | … | Status |`) und ein eigenes Journal:
  `AUF_DONE_RE` auf die erledigten Zeilen (z. B. `'\| fertig \|$'`, ID = erste Spalte), `AUF_PLAN_RE` auf die aktiven
  (z. B. `'\| (läuft|nacharbeit|fehler)'`), `AUF_PLANLOG_FILE` + `AUF_PLANLOG_RE` auf das Journal. Grund: Sonst meldet
  die Aufsicht keine abgehakten Einträge als Meilensteine, und der Endblock zeigt kein Log. Bei mehreren Spuren je Spur
  einen Wrapper (`auf.sh <SPUR> [BEAT_MIN]`), der Pane und cwd aus der Sitzungsdatei der Spur liest und die Pfade
  ableitet, damit jeder Neustart nach einer Meldung mit demselben kurzen Befehl läuft.
- Ereignisse: STEHT (idle/done ohne Worker und bg-Task), STILLSTAND (kein Fortschrittssignal), BLOCKIERT, KEIN-PI,
  WORKER-STILL (je Lauf), RAM, PLATTE, WATCHDOG (Timer aus ohne Stop-Marker / Watchdog hat aufgegeben), HERDR,
  HERZSCHLAG, FERTIG, GESTOPPT (Stop-Datei).
- FERTIG erst, wenn der Schlussbericht vorliegt UND ein Abschluss-Signal da ist: Stop-Marker seines Watchdogs
  (`AUF_WDSTOP`) oder `AUF_TIMER` inaktiv. Grund: Orchestratoren lassen den Bericht oft vorab von einem Worker
  entwerfen, vor dem letzten Prüflauf und PR. Hat er keinen Watchdog, endet die Loop mit STEHT samt Hinweis auf den
  Bericht.
- Schwellen gegen seinen Watchdog setzen:
  - STEHT kürzer als dessen Anstoß-Schwelle, damit es vor dem Watchdog auffällt.
  - KEIN-PI länger als dessen Neustart-Intervall, damit der Neustart beim Watchdog bleibt.
  - Laufende bg-Tasks als Arbeit zählen. Grund: Wartet der Orchestrator auf eine CI-Wache, ist er idle ohne Worker,
    hängt aber nicht.
- Kein `git status` im Loop: Es frischt den Index auf und nimmt dafür `index.lock`, und ein gleichzeitiger Commit des
  Orchestrators bricht ab. Refs per `rev-parse`/`symbolic-ref` lesen, sonst `git --no-optional-locks status`.
- Eigenes Log/State nicht in Pfade legen, die sein Watchdog als Fortschritt zählt, sonst verdeckt die Aufsicht einen Hänger.
- Vor dem Start `bash -n` und eine Probe mit `AUF_BEAT_MIN=0 AUF_POLL=1 timeout 60` und Test-Log/-State. Sie muss
  HERZSCHLAG mit rc 0 und plausible Werte liefern: Worker als runIds statt `pid…:?`, Worker- und bg-Zahl gegen
  `process-info`/Task-JSONs halten, unter „PLAN-Log“ die letzten Journal-Zeilen. Eine zweite Probe mit
  `AUF_WORKER_MIN=0 AUF_WLOGS=/nonexistent` muss WORKER-STILL für jeden laufenden Lauf melden.
- Start als bg_run (isAgent false, timeoutSeconds > Herzschlag, sonst endet der Lauf als Timeout statt mit Bericht).
  Der erste Herzschlag kurz (~45 min) als Funktionsnachweis, danach 90 min. Daneben ein gitignortes Journal mit einer
  Zeile je Ereignis und Eingriff.

## 4. Nach jeder Meldung
1. ZUERST den Loop mit demselben Befehl neu starten (`bash -n` davor), außer bei FERTIG/GESTOPPT, dann erst auswerten.
   Grund: Kommen mehrere Meldungen auf einmal oder bricht der Eingriff ab, bleibt sonst eine Spur unbewacht. Ein nach
   STEHT vergessener Neustart ließ eine Spur 45 min unbemerkt stehen. Bei mehreren Spuren je Runde abgleichen: Jede
   laufende Spur hat genau einen laufenden Aufsichts-Task.
2. Endblock lesen (Ereignis, Detail, Zustand, Meilensteine, Commits, Plan, Watchdog). `bg_logs` nur, wenn er nicht reicht.
3. Ist es erklärbar (Herzschlag, CI-Wache läuft, Prüflauf schreibt in die Worker-Logs), nichts tun.
4. Sonst stufenweise eingreifen:
   - Zuerst eine Nachricht mit konkretem Befund und erwartetem nächstem Schritt.
   - Esc oder Neustart nur bei belegtem Hänger (Sitzungsdatei steht, kein Worker, kein bg-Task) UND untätigem Watchdog.
     Grund: Sonst kämpfen Watchdog und Aufsicht um dasselbe Pane.
   - Ein Watchdog-Anstoß, während eine bg-Wache lief, ist ein Fehlalarm und braucht keinen Eingriff.
5. Nach dem Anstoß prüfen, ob er wirklich weiterarbeitet, nicht nur quittiert. „Ich warte auf Worker X“ gegen dessen
   Fertig-Signal halten: letzte Zeile von `/tmp/acp-delegate/<runId>.session.jsonl` mit `stopReason` ≠ `toolUse`,
   `.out` unverändert, kein Worker-Prozess. Grund: Abschlussmeldungen von acp_delegate gehen gelegentlich verloren
   (beobachtet nach `resumeFrom`). Dann wartet der Orchestrator endlos, und eine Quittung auf eine Rundnachricht sieht
   wie Arbeit aus. Abhilfe: In der Nachricht runId, Fertigzeit und Commit nennen und „`acp_delegate_wait({runId,
   timeout:10000})`, abnehmen, nächstes Paket starten“ verlangen. Zusätzlich in seine Regeln-Datei schreiben: Vor jedem
   Turn-Ende zum Warten und bei jedem Wecken prüft er alle laufenden Worker so.
   Umgekehrt der hängende Lauf: Queue-Zeile `läuft <runId>`, letzter stopReason `toolUse`, aber `.activity` und
   `.session.jsonl` ruhen länger als die Stille-Frist des acp-Wächters. Die Worker-Liste der Aufsicht zeigt ihn nicht
   sicher an (§1), und das Fortschrittssignal bleibt grün, solange ein anderer Worker schreibt. Darum je runId prüfen,
   nicht je pid. Eingreifen: Die Spur bricht den Lauf ab, danach prüfen, ob der Worker-pi wirklich weg ist. Ein pi,
   dessen Hauptthread dauerhaft ≈ 100 % CPU braucht (Zustand R, keine Schreibvorgänge), übersteht Abbruch und SIGTERM,
   vermutlich weil die blockierte Ereignisschleife den Signal-Handler nie ausführt. Er belegt weiter einen Kern,
   ≈ 1 GB RAM und einen Platz im RAM-Tor. Die runId steht weder in seiner Befehlszeile noch in offenen Dateien. Den
   pid per Ausschluss finden: Kinder des Spur-pi (`pgrep -P <spur-pid>`, `PI_ACP_DELEGATE_DEPTH=1` in
   `/proc/<pid>/environ`), Startzeit (`ps -o lstart= -p <pid>`) gegen den ersten Zeitstempel der Lauf-Sitzung, CPU per
   `top -b -n2 -d5 -p <pid>` (zweiter Block). Entscheidend ist die CPU, weil gleichzeitig gestartete Worker dieselbe
   Startzeit haben; ein gesunder Worker wartet mit wenigen Prozent auf Modell oder Werkzeug. Gegenprobe: Alle übrigen
   Kandidaten schreiben frische Aktivität, und das acp-Widget der Spur zeigt einen Lauf weniger. Dann genau diesen pid
   mit `kill -9` beenden, nie nach Namen. Die Restarbeit bekommt ein frischer Worker mit Restliste.
6. Journal-Zeile schreiben und dem Nutzer kurz berichten: Ereignis, Eingriff, Gesamtstand des Plans (abgehakt,
   laufende Worker, nächster Schritt).
7. Bei FERTIG oder GESTOPPT nicht neu starten. Den Schlussbericht des Orchestrators lesen und dem Nutzer zusammenfassen.
   Vorher gegen Plan-Log, `gh pr list` und die CI von main prüfen: Ein vorab entworfener Bericht hat oft noch
   „Entwurf“, Platzhalter oder „PR offen“, und Plan-Log-Zeilen tragen mitunter erfundene Uhrzeiten aus der Zukunft.
   Solche Stellen nach Ende des Orchestrators mit Vermerk korrigieren oder dem Nutzer nennen.
