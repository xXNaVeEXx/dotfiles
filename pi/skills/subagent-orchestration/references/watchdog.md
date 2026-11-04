# Watchdog je Sitzung (Spur und Leitstand)

Gilt für jede autonome pi-Sitzung, die ein Timer-Watchdog bewacht: Spur-Orchestratoren und die eigene
Leitstand-Sitzung. Orchestriere ich selbst, zeigt die `watchdog.env` auf mein eigenes Pane und meine SID.
Timer-Aufbau, Prozess- und Status-Prüfungen und Grund-Schwellen: references/mehrebenen-worktrees.md §Überwachung.
Hier steht, woran der Watchdog eine stehende oder falsch wartende Sitzung erkennt und was er dann tut.

## 1. Fortschritt statt Lebenszeichen
- Fortschritt = jüngster Commit, Plan- und Berichtsdateien und die `.activity` der eigenen Worker (runIds aus der
  Sitzungsdatei, fremde Sitzungen zählen nicht). Bleibt alles ≥ 90 min still, höchstens 1×/h anstoßen. Grund: Eine
  Sitzung, die in einer Schleife hängt, schreibt weiter in ihre Sitzungsdatei und sieht für eine reine Stille-Prüfung
  lebendig aus.
- Laufende bg_run-Tasks der Sitzung zählen als Warten mit Weckruf und verlängern die Idle-Frist (≈ 150 min statt 55):
  `<cwd>/.pi/tasks/<SID>-<PID>/*.json` mit status running und lebender pid (`kill -0`). `<cwd>` ist der Startordner
  der pi-Sitzung, nicht zwingend das Repo. Grund: Wartet der Orchestrator auf eine CI-Wache, ist er idle ohne Worker,
  und ein Anstoß unterbricht ihn nur.
- Steht eine Sitzung trotz eines solchen Tasks lange idle, das Ausgabe-Ende des Tasks lesen (`<task>.output`). Steht
  dort schon ein Ergebnis (`ERGEBNIS`, `rc=`, „fertig“) und danach nur noch `[hb]`, hängt der Task an einem nicht
  beendeten Herzschlag. Dann die Sitzung anweisen, ihn per `bg_kill` zu beenden und mit dem Ergebnis weiterzumachen.
  Grund: Der laufende Task verdeckt den Stillstand bis zum Ende der langen Frist.

## 2. Abgebrochener letzter Turn (stopReason)
- Den stopReason des letzten Assistant-Eintrags der Sitzungs-JSONL prüfen. Bei error oder length (z. B. abgelehnter
  compress, „unsupported stop reason“) wiederholt pi nicht von selbst, und eingereihte acp-Abschlussmeldungen bleiben
  als Steering liegen, bis ein neuer Prompt kommt.
- Dann anstoßen, auch während einer Kontingent-Pause: frühestens 3 min nach dem Abbruch, mit ≥ 10 min Abstand,
  höchstens 4× in 2 h, danach ALARM.

## 3. Kontext-Überlauf
- Erkennen an `prompt is too long`, `context length`, `too many tokens` (Muster als Variable im Skript). Die
  Fehlermeldung dafür nicht unter ~600 Zeichen kürzen, weil die Ursache hinten im JSON steht und die gekürzte Meldung
  wie ein gewöhnlicher Fehler aussieht.
- Anstoßen und `--session` helfen nie, weil jede Anfrage wieder die volle Historie schickt. pi beenden, eine frische
  Sitzung mit Start-Prompt und Hinweis auf die alte Sitzungsdatei starten und die alte im Zustand merken (`fresh=`),
  damit spätere Neustarts sie nicht fortsetzen. Höchstens 3 solche Neustarts in 6 h, danach ALARM.
- Vorbeugen: Die Stand-Datei an jedem Phasenübergang vollständig nachziehen, damit der frische Start nichts verliert.
  Wechselnde Kennungen (Aufsicht-Task, runIds) dort nur in der Zeile zum aktuellen Stand ändern und den Wechsel als
  neue Zeile anhängen, nie per `sed -i 's/<alt>/<neu>/g'` über die ganze Datei, weil das auch die Verlaufszeilen
  umschreibt.

## 4. Herzschlag und Wartezeiten der Spur
- Den Herzschlag der Spur (bg_run) nie als festes `sleep` bauen, sondern mit `scripts/warte.sh <spur> --max 1500`
  (in den Steuerordner kopieren). In einer Kontingent-Pause `--max <s> --quota <a1>,<a2>`; es endet dann auch, sobald
  ein Tor frei ist. Das gilt für jede Wartezeit der Spur, auch selbst gewählte (auf RAM, auf das Ende einer Hochlast).
- warte.sh endet, sobald eine Queue-Zeile `läuft|nacharbeit <runId>` zu einem Lauf gehört, dessen Sitzung mit einer
  Assistant-Nachricht mit stopReason stop/length/aborted/error endet und seit 3 min ruht. Den stopReason prüfen, nicht
  eine Schlusszeile der `.out`, weil Worker sie oft nicht am Zeilenanfang schreiben.
- Die Ende-Zeile (`WARTE-ENDE fertig|frei|herzschlag`) und was die Spur darauf tut, gehört in ihre Startdatei und in
  Vorlagen, die Startdateien erzeugen.
- Grund: Eine acp-Abschlussmeldung, die während eines automatischen Turns ohne Arbeitsauftrag eintrifft (Review- oder
  Lernpass, Kontext-Hinweis des Proxys), bleibt liegen, und eine idle Spur weckt sie nicht zuverlässig. Bei der
  Leerlauf-Prüfung zählen gerade fertig gewordene Worker noch als aktive Kinder, die Frist steigt auf 150 min, und die
  Spur steht mit freien Worker-Plätzen über eine Stunde, während ein anderer, noch laufender Worker der Aufsicht
  Fortschritt vortäuscht. Ein bg_run-Ende weckt die Spur dagegen sicher, genau beim Fertigwerden und ohne Token-Kosten.

## 5. Rückfall auf `sleep` im Watchdog erkennen
- Eine laufende Spur ahmt Muster aus ihrem eigenen Verlauf nach und fällt auch nach Prompt und Bestätigung wieder auf
  `sleep` zurück, oft Stunden später. Je größer die Sitzung, desto stärker wirken frühe Beispiele. Darum die Prüfung
  nicht dem nächsten Wecken des Leitstands überlassen, sondern in den Watchdog legen. Grund: Der Leitstand wird oft
  erst nach Stunden geweckt, und so lange bleiben fertige Worker liegen.
- Bei jedem Lauf (nach der Statuszeile) jede `${WD_TASKS:-<cwd>/.pi/tasks}/<SID>-*/*.json` prüfen:
  `jq -e '.status == "running" and ((.command // "") | test("^ *sleep +[0-9]{3,} *$"))' <json>`.
  Bei einem Treffer genau einen Anstoß je Task-ID senden (gesehene IDs im Zustand, die letzten 20) und danach die
  Leerlauf-Uhr auf 0 setzen, damit im selben Lauf kein zweiter Anstoß folgt.
- Den Anstoßtext als printf-Vorlage in die Watchdog-env legen (`WD_SLEEP`, zweimal `%s` = Task-ID). Er nennt den
  Grund, `bg_kill <tid>` und den vollständigen warte.sh-Befehl samt Pausen-Variante. Das Skript, das die Watchdog-env
  neuer Spuren schreibt, setzt die Vorlage mit, damit jede neue Spur den Schutz von Anfang an hat.
- Von Hand beim Wecken, z. B. direkt nach einer Regeländerung: `jq -c '{name,command,status}'
  <cwd>/.pi/tasks/<SID>-<PID>/*.json`. Steht dort `sleep`, die Spur anweisen.

## 6. Bei jedem Wecken des Leitstands
- Jede Queue-Zeile `läuft <runId>` gegen das Fertig-Signal halten und auf Stillstand prüfen, auch auf einen
  Worker-pi, der den Abbruch überlebt (references/orchestrator-aufsicht.md §4 Punkt 5). Dann die Spur mit runId,
  Fertigzeit und Prüfergebnis anstoßen.
- Queue-Zeilen nur im Tabellenkörper zählen, nicht per `grep -c` über die ganze Datei. Grund: Eine Kopf- oder
  Legendenzeile, die alle Statuswörter nennt, zählt sonst bei jedem Status einmal mit.

## 7. Watchdog- und Steuer-Skripte ändern
- Änderungen in eine Kopie schreiben (Shell-Skripte: `<skript>.new` daneben; Python: siehe unten), mit `DRY=1` und
  Test-STATE/-LOG proben und per `mv` atomar einsetzen. Grund: Ein laufender Timer liest sonst halb geschriebene
  Skripte.
- Das Testskript nimmt den Pfad des geprüften Skripts aus einer env-Variable (`bash "${WD_SCRIPT:-<pfad>}"`,
  `Q=${WPQ_PY:-<pfad>}`). Den neuen Testfall zuerst gegen die alte Fassung laufen lassen (er muss rot sein), dann gegen
  die Kopie (alles grün), erst dann `mv`. Grund: Nur ein Test, der die alte Fassung rot zeigt, belegt, dass er den
  Fehler wirklich fängt.
- Python-Steuerskripte (Queue, Phasen, Plan-Prüfer) als Testkopie unter GLEICHEM Dateinamen in einen eigenen Ordner
  legen (`test-<skript>/neu/<skript>.py`), nicht als `<skript>_new.py` oder `<skript>.py.new`. Grund: Skripte, die
  ihren eigenen Namen in `/proc/<pid>/cmdline` suchen (Lebend-Prüfung laufender Instanzen), scheitern unter anderem
  Namen, und der Test zeigt Fehler, die nur an der Kopie liegen; `importlib.util.spec_from_file_location` lädt eine
  Datei mit Endung `.new` gar nicht als Modul.
- Eine neue Pflicht für alle Pakete gehört in jedes Prüfskript, das ein Paket durchläuft: references/querschnitt-pflichten.md §2.
