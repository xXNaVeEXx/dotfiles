# Selbstaktualisierende Statusseite (Vorlage `scripts/status-page.py`)

## Wann
- Der Nutzer fragt „wie ist der Stand / was ist erledigt / was fehlt genau“ – oder ein mehrtägiger autonomer Lauf
  startet: dann die Seite gleich beim Start einrichten, er fragt sonst später danach.
- Die Seite muss den ganzen Weg zeigen: Gesamtplan (Phasen erledigt / jetzt / offen), genaue Restarbeit je Phase,
  Engpass (meist Kontingent oder RAM), Zeitrahmen und Ressourcen. Nur die Queue reicht nicht, weil sie nur die
  laufende Phase kennt – alles danach bleibt sonst unsichtbar.

## Abschnitte und Quellen
| Abschnitt | Quelle | env |
|---|---|---|
| Übersicht (von Hand) | Markdown mit `##`/`###`, Listen `[ ]/[~]/[x]`, Tabellen; Zahlen und Paketlisten als Live-Platzhalter (siehe Pflege) | `STATUS_OVERVIEW_MD`, Marke `<!-- STEPS -->` |
| Gesamtplan n von m | Checkliste unter `## Steps` im Plan, erster offener Schritt = „jetzt“ | `STATUS_STEPS_MD`, `STATUS_STEPS_HEAD` |
| Laufende Arbeit | Queue-Tabellen in `<STATUS_DIR>/PLAN.md`, je Queue `## <Name>`, Zeilen je ID-Gruppe | `STATUS_PKG_RE` oder `STATUS_PKG_PREFIX`, `STATUS_GROUPS='PRÄFIX=Label;…'` |
| Ressourcen und Kontingent | MemAvailable/Swap + letzte Zeilen von Tor-Befehlen (auch bei Exit ≠ 0) | `STATUS_CMDS='[["Label","Befehl"],…]'` |
| Aufträge + Live-Spalte | runId aus der Statuszelle, sonst aus dem Journal. UUID (Worker per `subagent({async:true})`) → `<STATUS_SUBAGENT_DIR>/<runId>/status.json`; `del_…` (ältere Delegate-Läufe) → `<STATUS_ACP_DIR>/<runId>.*` | `STATUS_SUBAGENT_DIR` (z. B. `/tmp/pi-subagents-uid-<uid>/async-subagent-runs`), `STATUS_ACP_DIR`, `STATUS_RUN_ID_RE` |
| Pull Requests | `gh pr list` offen + gemergt seit Startzeit, auf Wunsch nur die Branches dieses Laufs | `STATUS_GH_REPO`, `STATUS_SINCE`, `STATUS_PR_HEAD_RE` (z. B. `'^<lauf-präfix>'`) |
| Commits | je Worktree `<STATUS_BASE>..HEAD`, „nur lokal“ markiert | `STATUS_REPOS='[["Label","/pfad"],…]'`, `STATUS_BASE` (Standard `origin/main`) |
| Kontrolle (Loop) | letzte Watchdog-Zeile, laufende bg_run-Wachen der Sitzung | `STATUS_WATCHDOG_LOG`, `STATUS_SID`, `STATUS_TASKS` |
| Bleibt bei dir / Ohne dich entschieden / Erledigt / Journal | `NUTZER.md`, Plan-Abschnitt `## Ohne dich entschieden`, `ERLEDIGT.md`, `JOURNAL.md` | `STATUS_DIR` |

Status-Wörter der Queue: `gemergt` → gemergt · `committet`/`fertig` → fertig · `fehler` → Fehler ·
`Abnahme`/`Prüf…`/`integrieren` → Abnahme · `läuft`/`wartet`/`nacharbeit`/`resume` → in Arbeit · sonst offen.

Der Renderer sucht diese Wörter als Teilwort in der GANZEN Statuszelle, in der Reihenfolge oben. Die Zelle deshalb
mit dem Status-Wort beginnen und den Freitext dahinter ohne andere Status-Wörter schreiben: bei einer offenen Zeile
kein „startet, sobald … fertig ist“, kein „Prüfer“, kein „wartet auf …“ (stattdessen z. B. „offen – startet nach
dem zweiten Gesamtbericht“). Nach jeder Änderung einer Statuszelle die Summenzeile der Queue lesen („n von m fertig,
k offen“) und gegen die eigene Zählung halten. Grund: Eine offene Zeile mit „fertig“ im Freitext zählt still als
fertig, eine mit „Prüfer“ als Abnahme – die Seite meldet dann „alles fertig“, obwohl ein Paket noch gar nicht
gestartet ist.

Vor dem Einrichten die env an den Lauf anpassen und nicht die Standardwerte übernehmen: `STATUS_BASE` = Ziel-Branch
der PRs, `STATUS_PR_HEAD_RE` = Branch-Präfix des Laufs, `STATUS_SUBAGENT_DIR` bzw. `STATUS_ACP_DIR` = der Ordner, in
dem die Worker dieses Laufs wirklich ihren Zustand schreiben. Grund: Mit falschem Vergleichs-Branch zählt die Seite
fremde Commits, ohne Branch-Filter zeigt sie alle PRs des Repos, und mit falschem Lauf-Ordner bleibt die Live-Spalte
still leer.

## Ein Lauf, ein Worktree (kleiner Wrapper)
1. Statusordner im Worktree anlegen (`.tmp/<lauf>/status/`), die Vorlage dorthin kopieren und dort `PLAN.md` (Queue
   der Seite, getrennt vom fachlichen Plan), `STEPS.md`, `UEBERSICHT.md`, `NUTZER.md`, `ERLEDIGT.md`, `JOURNAL.md`
   pflegen.
2. Wrapper `status.sh`: `PATH` mit dem Ordner von `gh`, dann `export STATUS_…` (Repo, Ordner, SID, Tasks-Ordner,
   GH-Repo, Branch-Filter, Vergleichs-Branch, Startzeit, Zeilen-Regex, Steps, Übersicht, Lauf-Ordner der Worker),
   am Ende `exec /usr/bin/python3 "$STATUS_DIR/status-page.py"`.
3. Timer und Probe wie in Schritt 8 des nächsten Abschnitts, danach die Prüfungen aus „Prüfen nach Änderungen“.

## Wrapper bei mehreren Spuren (Muster)
1. Alle Queue-Dateien der Spuren in `<STATUS_DIR>/PLAN.md` sammeln: je Datei `## <Spur>` (bei Neben-Queues mit
   Dateinamen), Inhalt ohne eigene `## `-Zeilen; ans Ende `## Ohne dich entschieden` mit den letzten Bullets der
   Entscheidungsdatei. Schreiben per tmp + `mv -f`, damit der Renderer nie eine halbe Datei liest.
2. Journale aller Spuren zusammenführen und zeitlich sortieren (bei `- TT.MM HH:MM [SPUR] …` reicht `sort -k2,3`).
3. `NUTZER.md` und `ERLEDIGT.md` kopieren; `STATUS_REPOS` dynamisch aus allen Worktrees bauen
   (`for d in <wtroot>/*/; do [ -e "$d.git" ] && …`), `STATUS_CMDS` mit den `-v`-Varianten der Tor-Skripte.
4. `PATH` um den Ordner mit `gh` ergänzen und `GH_TOKEN` aus Datei bzw. Keyring laden. Grund: transiente
   systemd-User-Units haben nur einen Minimal-PATH – ohne `gh` bleiben die PR-Spalten still leer, ohne Fehler.
5. Sicherungs-Push: nur Branches mit dem Lauf-Präfix, die Commits haben, die nicht auf origin liegen; höchstens alle
   30 min (Stempeldatei), je Push `timeout 40`, Ergebnis ins Log. Grund: lange Analyse-/Plan-Branches liegen sonst
   tagelang nur lokal und gehen bei einem Maschinenabsturz verloren. Vorher prüfen, ob reine Doku-Pushes CI auslösen
   (paths-Filter der Workflows).
6. `STATUS_SID` bei jedem Lauf aus dem Watchdog-Zustand des Orchestrators lesen, nie fest eintragen:
   `sid=$(sed -n 's/^sfile=".*_\([0-9a-f-]*\)\.jsonl"$/\1/p' <wd-state>)`, Rückfall = zuletzt bekannte SID.
   Grund: Nach einem Neustart (z. B. Kontext-Überlauf) hat der Orchestrator eine neue SID, und „Kontrolle (Loop)“
   zeigt seine Wachen sonst still nicht mehr.
7. Am Ende `exec env STATUS_…=… /usr/bin/python3 <renderer>`.
8. Timer: `systemd-run --user --unit=<lauf>-status --on-calendar='*:0/3' /bin/bash <wrapper>`.
   Probe vorher wie im Unit: `env -i HOME=$HOME PATH=/usr/local/bin:/usr/bin:/bin /bin/bash <wrapper>`.

## Pflege – sonst zeigt die Seite einen falschen Stand
- Statuszelle bei jedem Wechsel sofort setzen, mit runId (`läuft <runId>`, UUID oder `del_…`), das Modell in der
  Spalte „Modell“: die Live-Spalte liest die runId zuerst dort, das Journal ist nur Rückfall. Eine UUID blendet der
  Renderer im Abzeichen aus und zeigt sie gekürzt in der Live-Spalte.
- Bei jedem Abschluss eines Planschritts (z. B. `plannotator_mark_done`) auch das `[x]` in der Steps-Checkliste des
  Plans setzen, `[~]` für teilweise – der Zähler „Gesamtplan“ liest nur die Datei.
- Kommt nach einer Prüfung ein Nacharbeits-Paket dazu, es im selben Zug an drei Stellen eintragen: neue Queue-Zeile
  (Status „offen“), neuer Schritt in der Steps-Checkliste und der Engpass-Satz der Übersicht. Grund: Sonst springt
  „n von m“ beim Start der Nacharbeit rückwärts oder die Seite zeigt „Bau fertig“, während noch ein Paket aussteht.
- Zahlen und Paketlisten im Übersichtstext nie von Hand schreiben, sondern als Live-Platzhalter, die der Renderer bei
  jedem Lauf füllt. In der Vorlage eingebaut:
  - `{{queue:<Sektion>}}` bzw. `{{queue:<Sektion>:<ID-Regex>}}` (Regex ohne `}`) → „n von m fertig, k in Arbeit, …
    offen“ aus derselben Queue wie die Tabelle.
  - `{{fertig:<Sektion>}}` / `{{arbeit:<Sektion>}}` → die Titel der fertigen (fertig/gemergt) bzw. laufenden Pakete
    (in Arbeit, Abnahme, Fehler), ohne ID, „keine“ bei leerer Auswahl. Damit nennt der Text immer die richtigen
    Pakete, in Worten statt Kürzeln. Wechselt die Phase (z. B. vom Bau zur Prüfung), den Platzhalter „Gerade in
    Arbeit“ auf die neue Sektion umstellen, sonst steht dort „keine“.

  Nur bei Läufen mit Kontingent-Toren bzw. langen Teilketten nachzurüsten (Code unten):
  - `{{quota:<Name>}}` → „<Name> W % der Woche, 5-Stunden-Fenster K %“, bei Sperre mit „(neue Läufe gesperrt bis …)“,
    aus der letzten Zeile des `STATUS_CMDS`-Eintrags „Kontingent <Name>“ (`kurz=K%` … `woche=W%`, bei Sperre
    `NEIN … frei ab <Zeit>`).
  - `{{ketten:<Sektion>}}` → die vier Bereiche mit den meisten offenen Teilen (IDs `…<KÜRZEL>-T<n>`), mit Klarnamen
    aus `STATUS_NAMES='KÜRZEL=Name;…'`. Damit steht die längste Restkette immer aktuell im Text.

  Kopf als „Stand in Kürze (Text vom <Datum> – Zahlen live)“. Grund: Von Hand eingetragene Zahlen und Paketlisten
  veralten mit dem nächsten Abschluss, Kontingent-Werte schon nach Minuten, und widersprechen dann der Tabelle auf
  derselben Seite; Kürzel versteht der Nutzer nicht. Jeden Befehl je Lauf nur einmal ausführen (Cache, auch im
  Ressourcen-Abschnitt), damit Text und Ressourcen dieselbe Ablesung zeigen. Nachrüsten von `quota` und `ketten`:
  die Funktionen ergänzen und `fill_placeholders` der Vorlage um die beiden Arten erweitern:
  ```python
  CMDS = _json_env("STATUS_CMDS")
  NAMES = dict(x.split("=", 1) for x in os.environ.get("STATUS_NAMES", "").split(";") if "=" in x)
  _CMD_CACHE = {}

  def cmd_out(cmd):  # je Render-Lauf jeder Befehl nur einmal
      if cmd not in _CMD_CACHE:
          try:
              r = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=60)
              _CMD_CACHE[cmd] = (r.stdout + r.stderr).strip()
          except (OSError, subprocess.SubprocessError) as e:
              _CMD_CACHE[cmd] = f"({e})"
      return _CMD_CACHE[cmd]

  def quota_text(name):
      cmd = dict(CMDS).get(f"Kontingent {name}")
      last = (cmd_out(cmd).splitlines() or [""])[-1] if cmd else ""
      m = re.search(r"kurz=(\d+)%.*?woche=(\d+)%", last)
      if not m:
          return f"{name}: keine Ablesung"
      t = f"{name} {m.group(2)} % der Woche, 5-Stunden-Fenster {m.group(1)} %"
      if "NEIN" in last:
          f = re.search(r"frei ab ([^)]+)", last)
          t += f" (neue Läufe gesperrt bis {f.group(1).strip()})" if f else " (neue Läufe gesperrt)"
      return t

  def chains_text(rows, sec, top=4):
      cnt = {}
      for p in rows:
          m = re.search(r"([A-Z0-9]+)-T\d+$", p["id"])
          if m and p.get("sec") == sec and kind(p["status"]) not in ("merged", "done"):
              cnt[m.group(1)] = cnt.get(m.group(1), 0) + 1
      best = sorted(cnt.items(), key=lambda kv: -kv[1])[:top]
      return ", ".join(f"„{NAMES.get(k, k)}“ ({n})" for k, n in best) or "keine offenen Teile"

  def fill_placeholders(md, rows):
      def sub(m):
          what, arg, extra = m.group(1), m.group(2), m.group(3) or ""
          if what == "quota":
              return quota_text(arg)
          if what == "ketten":
              return chains_text(rows, arg)
          if what in ("fertig", "arbeit"):
              return names_text(rows, arg, what)
          return queue_text(rows, arg, extra)
      return re.sub(r"\{\{(queue|quota|ketten|fertig|arbeit):([^:}]+)(?::([^}]+))?\}\}", sub, md)
  ```
- Beginnt eine Spur eine neue Phase mit eigener Queue-Datei, diese als eigene Sektion einhängen, so wie der Wrapper
  Queues findet (z. B. Alias-Ordner `spuren/<Spur>-<Phase>/` mit Symlink `QUEUE.md` auf die neue Datei), und im Text
  `{{queue:<Spur>-<Phase>}}` verwenden. Die abgeschlossene Phase im selben Schritt abhaken („fertig <Datum>,
  <Uhrzeit>“). Grund: Der Platzhalter der alten Sektion zählt die neue Phase sonst gar nicht oder mischt sie mit der
  fertigen.
- Nach jeder Textänderung die Seite sofort neu erzeugen und erst prüfen, wenn sie wirklich neu geschrieben ist:
  `touch <stempel>; systemctl --user start <lauf>-status.service; timeout 30 bash -c 'until [ <seite>.html -nt
  <stempel> ]; do sleep 1; done'`. Grund: Die Unit aus `systemd-run` ist vom Typ simple, `start` kehrt vor dem
  Rendern zurück, und eine sofortige Prüfung liest noch die alte Seite. Dann prüfen, dass kein `{{` übrig ist
  (`grep -c '{{' <seite>.html` ergibt 0), jeder Platzhalter Zahlen statt „keine Aufträge“ bzw. „keine Ablesung“ zeigt
  und die neuen Sätze da sind (`grep -c '<Schlüsselsatz>'`). Grund: Ein falscher Sektions- oder Kontingent-Name ergibt
  still einen Leertext, ein kaputter Platzhalter bleibt als Rohtext stehen, und beides sieht sonst erst der Nutzer.
- Übersicht, `ERLEDIGT.md` und `NUTZER.md` bei jedem Meilenstein und bei jedem Wecken mit neuem Stand nachziehen: je
  Phase „erledigt / fehlt genau / nächster Schritt“, Engpass, Zeitrahmen. Hat der Nutzer die Seite gewünscht, bleibt
  das eine Daueraufgabe bis zum Abschluss, auch für jede Nachfolge-Sitzung nach Überlauf oder `/new`. Veraltete
  Übersicht ist schlimmer als keine. Prüffrage bei jedem Wecken, bevor die Meldung an den Nutzer geht: Steht jede
  abgeschlossene Phase auf `[x]`, die laufende auf `[~]` mit ihrem Live-Platzhalter, und stimmt der Kopf („Text vom
  …“)? Grund: Bei Phasenwechseln (Gate grün, Merge, neue Spur) bleibt der Text sonst eine Phase zurück, während die
  Live-Zahlen weiterlaufen – die Seite wirkt aktuell und zeigt doch die falsche Phase.
- Endet die Spur-Phase und arbeitet der Leitstand Folgeaufträge selbst ab (eigene Worker, Releases, Datenarbeiten),
  dafür sofort eine eigene Zeile anlegen: Steuerordner mit `PLAN.md` (eine Paketzeile je Auftrag mit Issue-Nummer und
  PRs, eine Logzeile je Meilenstein) und alle neuen Issue-Nummern in der Konfiguration zuordnen (z. B. `mag_weitere`),
  dazu Titel und Nutzer-To-dos umschreiben. Abgeschlossenen Spuren den Stop-Marker setzen. Grund: Der Zeitstempel
  im Kopf erneuert sich mit jedem Timerlauf und täuscht Aktualität vor, während Text, Spuren und PR-Zuordnung beim
  Phasenwechsel stehen bleiben; der Nutzer liest dann einen Stand von vor Tagen als „jetzt“.
- Die PR-Abfrage des Renderers muss alle PRs seit Laufbeginn umfassen (`gh pr list --limit` größer als die Zahl der
  PRs seit Start, Zählprobe `gh pr list --state all --limit 500 --json createdAt` gegen `pr_seit`). Grund: Mit zu
  kleinem Limit fallen die ältesten PRs still heraus, und früh fertige Spuren springen auf „in Arbeit“ zurück, weil
  ihnen die gemergten PRs fehlen. Das gilt auch mit Branch-Filter: er greift erst nach dem Abruf, in einem Repo mit
  vielen fremden PRs muss das Limit also die PRs aller Läufe abdecken.
- Zeitrahmen und Sperrzeitpunkte nur aus Messwerten schreiben (references/kontingent.md §9). Laufen die Teile einer
  Gruppe nacheinander, endet die Queue frühestens nach max(längste Restkette × Minuten je Teil, alle offenen Teile ×
  Minuten je Teil ÷ Plätze); Minuten je Teil getrennt je Modell aus den letzten Abschlüssen. Die längsten Restketten
  live per `{{ketten:<Sektion>}}` in der Übersicht nennen. Sind die Modelle verschieden schnell, die Plätze des
  schnellen Modells fest den längsten Restketten zuordnen (Platz 1 = längste, Platz 2 = zweitlängste, dazu eine
  Nachfolgeliste, danach die Kette mit den meisten offenen Teilen ohne laufenden Teil) und einen solchen Platz
  freihalten, solange der laufende Teil seiner Kette noch auf dem langsamen Modell läuft. Beim Wecken prüfen, dass die
  Spur das einhält. Grund: Eine Regel „die längste Kette zuerst“ allein reicht nicht, denn die Spur füllt einen frei
  werdenden Platz mit dem nächsten bereiten Teil, oft aus einer kurzen Kette; die lange Kette läuft dann auf dem
  langsamen Modell und am Ende allein.
- Für die Gesamt-Restzeit eines mehrwöchigen Plans die Kosten je Paket aus der Kontingent-Differenz über mehrere
  Abschlüsse messen (samt Spur-Steuerung, Prüfern und Leitstand) und mit den normalen Wochengrenzen hochrechnen, nicht
  mit einer befristet erhöhten. Bietet man dem Nutzer „zuerst die wichtigen Funktionen“ an, die Paketzahl als Hülle
  über alle transitiven Abhängigkeiten der Pakete mit hoher Priorität zählen (Tiefensuche über die
  Abhängigkeitsfelder des Plans), nicht nur die Pakete selbst. Grund: Wichtige Funktionen bauen auf weniger wichtigen
  auf; die bloße Zahl der Pakete mit hoher Priorität unterschätzt den Umfang leicht um die Hälfte.
- Bleibt dem Nutzer eine Aufgabe oder Entscheidung (z. B. ein angekündigtes Zurücksetzen eines Kontingents oder eine
  höhere Grenze freigeben), steht sie als erster Punkt der Übersicht und in `NUTZER.md`: woran er den Zeitpunkt
  erkennt (etwa eine Desktop-Benachrichtigung), was er tut, was danach von selbst passiert und was ohne Antwort gilt.
  Ein „Du musst nichts tun“ an dieser Stelle ersetzen. Grund: Zwischen vielen Statuszeilen geht eine einzelne Bitte
  sonst unter.
- Uhrzeiten für den Kopf („Text vom …“) und für Journal-, Stand- und Entscheidungszeilen vor dem Schreiben per
  `date '+%d.%m %H:%M'` holen, nie aus dem Verlauf hochrechnen. Grund: Geschätzte Uhrzeiten liegen leicht 5–10 min
  daneben, und das zusammengeführte Journal wird nach Zeit sortiert, steht dann also in falscher Reihenfolge.
- Zeilen mit Backticks, `$` oder `$(…)` nur mit gequotetem Heredoc anhängen, die Uhrzeit davor per printf:
  `{ printf -- '- %s [L0] ' "$T"; cat <<'EOF'` … `EOF` `} >> <datei>`. Danach `tail -n 2 <datei>` lesen. Grund: Ein
  ungequotetes `<<EOF` führt Backticks und `$(…)` als Befehle aus; der Text landet dann verstümmelt oder gar nicht in
  der Datei, und nur eine „command not found“-Zeile verrät es.

## Lagefrage des Nutzers („hängt etwas? geht es voran?“)
1. In einem parallelen Block lesen: Pane-Status aller Spuren (`herdr pane list`), die letzten Journalzeilen je Spur,
   Queue-Zeilen außer fertig/offen, letzter Commit je Spur-Branch, Worker-Aktivität (bei `subagent`-Läufen
   `status.json` und Änderungszeit der `events.jsonl` im Lauf-Ordner des Kindes, bei älteren Läufen Alter der
   `<runId>.activity` und `ERGEBNIS`-Zeile in `.out`), Ende von Watchdog- und Aufsicht-Log, Tor-Skripte
   (`-v`-Varianten für RAM und Kontingent).
2. Urteilen: Eine idle Spur ohne Worker hängt nicht, wenn ihre letzte Journalzeile einen Wartegrund nennt (Tor NEIN,
   Pause bis …) und ein Weck-Task läuft. Sie hängt erst, wenn alle Tore frei sind und nach ihrem nächsten
   Weckzeitpunkt keine neue Aktion kommt. Steht der Weckzeitpunkt kurz bevor, abwarten und erneut lesen (Wartebefehl
   mit Tool-Parameter `timeout`, das bash-Tool bricht sonst nach 60 s ab). Grund: Ein Anstoß während eines geplanten
   Wartens unterbricht nur, und ein voreiliges „hängt“ beunruhigt den Nutzer grundlos.
   Meldet die Laufzeitumgebung bei einem Worker „keine Aktivität seit N s“ oder „Befehl seit N s offen“, vor jedem
   Anstoß zwei Dinge lesen: die Prozessliste (läuft sein Befehl, oder wartet er hinter einer Bau-Sperre auf andere
   schwere Läufe?) und den Zeitstempel seines Lauf-Logs bzw. seiner `events.jsonl`. Wächst eines davon oder steht er
   in einer Warteschlange, ist es kein Hänger. Grund: Ein Worker, der länger am Stück denkt oder auf die Sperre
   wartet, meldet nichts; ein Anstoß bricht dann nur einen gesunden Lauf ab. Die Schwelle der Statusseite ist
   deshalb bei laufendem Befehl hoch (`LONG_TOOL_MIN`), ohne Befehl niedrig (`STILL_MIN`).
3. Antworten: erster Satz das Urteil, dann „Was gerade passiert“ (letzte Abschlüsse, neu gestartete Worker, kurze
   Pausen mit Grund), „Fortschritt“ (n von m, Tempo je Stunde, grobe Restzeit, was danach automatisch folgt), „Was
   bremst“ (Tor mit Zahlen und Freigabezeit), „Überwachung“ (welche Wächter laufen). Hat eine neue Ablesung eine
   frühere Prognose widerlegt, das offen sagen, mit Grund, und Übersicht sowie Entscheidungsfrage gleich anpassen.
- Fragt der Nutzer, ob die Statusseite aktuell ist, den Inhalt prüfen, nicht den Zeitstempel: Text der Seite ohne
  Tags auslesen (`re.sub` über Script/Style und Tags, Zeilen ausgeben) und gegen den tatsächlichen Stand halten
  (offene PRs, letzte Merges, offene Nutzer-Aufgaben, Änderungszeit der Quelldateien per `ls -la`). Veraltetes
  sofort korrigieren, neu erzeugen, prüfen und dann in einer Tabelle „vorher → jetzt“ antworten.
- Meldet sich der Nutzer nach einer Pause („mach weiter, was war der Stand“), zuerst die Wirklichkeit lesen, bevor
  irgendetwas gestartet wird: Ausgabe der zuletzt gestarteten Hintergrundläufe (deren Benachrichtigung kann während
  der Pause eingegangen sein, ohne dass ein Zug folgte), `git status`/HEAD des Worktrees, ob der Ziel-Branch
  inzwischen weiter ist (`git fetch` + `git rev-list --count HEAD..origin/<ziel>`), welche Worker-Prozesse wirklich
  zu diesem Lauf gehören (cwd aus `/proc/<pid>/cwd`, fremde Läufe anderer Projekte nicht mitzählen). Dann die
  wartenden nächsten Schritte sofort starten, die Seite nachziehen und offen sagen, seit wann nichts geschah. Grund:
  Eine Sitzung, die auf eine Benachrichtigung wartete, steht nach einer Pause still; die Seite zeigt dann noch
  „läuft“, obwohl das Paket längst geliefert hat.

## Prüfen nach Änderungen am Renderer oder Wrapper
- Änderungen in `.new`-Kopien schreiben und den Renderer erst gegen eine Kopie des Statusordners laufen lassen
  (`STATUS_DIR=<tmp-kopie>`, Test-Übersicht mit gültigem, gefiltertem, unbekanntem und kaputtem Platzhalter), dann per
  `mv` einsetzen. Grund: Der Timer liest sonst halbe Skripte oder überschreibt die Live-Seite mit Testinhalt.
- Die Kopie der Vorlage muss den Lint des Schreib-Werkzeugs bestehen, sonst wird sie nicht geschrieben: keine festen
  `/tmp`-Pfade als Standardwert (Ordner nur über env, Rückfall `/nonexistent`), kein ungeschütztes `json.loads` auf
  Modulebene (über `_json_env`), mehrere Präfixe in einem `startswith((…))`.
- Wrapper einmal per Hand laufen lassen; das HTML mit `html.parser` auf unbalancierte Tags prüfen (Start-/End-Tag-
  Stapel, void-Elemente wie `meta`, `br` ausnehmen).
- Schlüsselstrings prüfen: „Gesamtplan: n von m“, Queue-Summen je Gruppe, Ressourcenzeile mit Tor-Ausgaben, eine
  Live-Zelle je laufendem Auftrag, die eigenen Wachen unter „Kontrolle (Loop)“.
- Als Artefakt registrieren, den file://-Pfad nennen; im Chat kurz: Gesamtplan n/m, aktuelle Phase, was genau fehlt,
  Engpass und grober Zeitrahmen.
