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
| Übersicht (von Hand) | Markdown mit `##`/`###`, Listen `[ ]/[~]/[x]`, Tabellen; Zahlen als Live-Platzhalter (siehe Pflege) | `STATUS_OVERVIEW_MD`, Marke `<!-- STEPS -->` |
| Gesamtplan n von m | Checkliste unter `## Steps` im Plan, erster offener Schritt = „jetzt“ | `STATUS_STEPS_MD`, `STATUS_STEPS_HEAD` |
| Laufende Arbeit | Queue-Tabellen in `<STATUS_DIR>/PLAN.md`, je Queue `## <Name>`, Zeilen je ID-Gruppe | `STATUS_PKG_RE` oder `STATUS_PKG_PREFIX`, `STATUS_GROUPS='PRÄFIX=Label;…'` |
| Ressourcen und Kontingent | MemAvailable/Swap + letzte Zeilen von Tor-Befehlen (auch bei Exit ≠ 0) | `STATUS_CMDS='[["Label","Befehl"],…]'` |
| Aufträge + Live-Spalte | runId aus der Statuszelle, sonst aus dem Journal; Aktivität aus `/tmp/acp-delegate/<runId>.*` | `STATUS_ACP_DIR` |
| Pull Requests | `gh pr list` offen + gemergt seit Startzeit | `STATUS_GH_REPO`, `STATUS_SINCE` |
| Commits | je Worktree `origin/main..HEAD`, „nur lokal“ markiert | `STATUS_REPOS='[["Label","/pfad"],…]'` |
| Kontrolle (Loop) | letzte Watchdog-Zeile, laufende bg_run-Wachen der Sitzung | `STATUS_WATCHDOG_LOG`, `STATUS_SID`, `STATUS_TASKS` |
| Bleibt bei dir / Ohne dich entschieden / Erledigt / Journal | `NUTZER.md`, Plan-Abschnitt `## Ohne dich entschieden`, `ERLEDIGT.md`, `JOURNAL.md` | `STATUS_DIR` |

Status-Wörter der Queue: `gemergt` → gemergt · `committet`/`fertig` → fertig · `fehler` → Fehler ·
`Abnahme`/`Prüf…`/`integrieren` → Abnahme · `läuft`/`wartet`/`nacharbeit`/`resume` → in Arbeit · sonst offen.

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
- Statuszelle bei jedem Wechsel sofort setzen, mit runId und Modell (`läuft del_… <modell>`): die Live-Spalte liest
  die runId zuerst dort, das Journal ist nur Rückfall.
- Bei jedem Abschluss eines Planschritts (z. B. `plannotator_mark_done`) auch das `[x]` in der Steps-Checkliste des
  Plans setzen, `[~]` für teilweise – der Zähler „Gesamtplan“ liest nur die Datei.
- Zahlen im Übersichtstext nie von Hand schreiben, sondern als Platzhalter `{{queue:<Sektion>}}` bzw.
  `{{queue:<Sektion>:<ID-Regex>}}` (Regex ohne `}`) → „n von m fertig, k in Arbeit, … offen“ aus derselben Queue wie
  die Tabelle; Kopf als „Stand in Kürze (Text vom <Datum> – Zahlen live)“. Grund: Von Hand eingetragene Zahlen
  veralten mit dem nächsten Abschluss und widersprechen dann der Tabelle auf derselben Seite. Fehlt das der Vorlage
  noch, beim Einrichten ergänzen und in `render()` `read(OVERVIEW_MD)` durch `fill_placeholders(read(OVERVIEW_MD), work)`
  ersetzen:
  ```python
  def queue_text(rows, sec, id_re=""):
      try:
          sel = [p for p in rows if p.get("sec") == sec and (not id_re or re.search(id_re, p["id"]))]
      except re.error:
          return f"(ungültiger Platzhalter-Regex {id_re})"
      if not sel:
          return "keine Aufträge"
      c = tally(sel)
      parts = [f"{c['merged'] + c['done']} von {len(sel)} fertig"]
      for k, w in (("run", "in Arbeit"), ("check", "in Abnahme"), ("fail", "mit Fehler"), ("open", "offen")):
          if c[k]:
              parts.append(f"{c[k]} {w}")
      return ", ".join(parts)

  def fill_placeholders(md, rows):
      return re.sub(r"\{\{queue:([^:}]+)(?::([^}]+))?\}\}",
                    lambda m: queue_text(rows, m.group(1), m.group(2) or ""), md)
  ```
- Beginnt eine Spur eine neue Phase mit eigener Queue-Datei, diese als eigene Sektion einhängen, so wie der Wrapper
  Queues findet (z. B. Alias-Ordner `spuren/<Spur>-<Phase>/` mit Symlink `QUEUE.md` auf die neue Datei), und im Text
  `{{queue:<Spur>-<Phase>}}` verwenden. Die abgeschlossene Phase im selben Schritt abhaken („fertig <Datum>,
  <Uhrzeit>“). Grund: Der Platzhalter der alten Sektion zählt die neue Phase sonst gar nicht oder mischt sie mit der
  fertigen.
- Nach jeder Textänderung die Seite sofort neu erzeugen (`systemctl --user start <lauf>-status.service`) und im HTML
  prüfen, dass kein `{{` übrig ist (`grep -c '{{' <seite>.html` ergibt 0) und jeder Platzhalter Zahlen statt
  „keine Aufträge“ zeigt. Grund: Ein falscher Sektionsname ergibt still „keine Aufträge“, ein kaputter Platzhalter
  bleibt als Rohtext stehen, und beides sieht sonst erst der Nutzer.
- Übersicht, `ERLEDIGT.md` und `NUTZER.md` bei jedem Meilenstein und bei jedem Wecken mit neuem Stand nachziehen: je
  Phase „erledigt / fehlt genau / nächster Schritt“, Engpass, Zeitrahmen. Hat der Nutzer die Seite gewünscht, bleibt
  das eine Daueraufgabe bis zum Abschluss. Veraltete Übersicht ist schlimmer als keine.
- Zeitrahmen und Sperrzeitpunkte nur aus Messwerten schreiben (references/kontingent.md §9). Laufen die Teile einer
  Gruppe nacheinander, endet die Queue frühestens nach max(längste Restkette × Minuten je Teil, alle offenen Teile ×
  Minuten je Teil ÷ Plätze); Minuten je Teil aus den letzten Abschlüssen. Die längste Kette in der Übersicht nennen
  und beim Wecken prüfen, dass die Spur ihr einen frei werdenden Platz zuerst gibt. Grund: Sonst läuft diese Kette am
  Ende allein, und die übrigen Plätze stehen leer.
- Bleibt dem Nutzer eine Aufgabe (z. B. ein angekündigtes Zurücksetzen eines Kontingents), steht sie als erster
  Punkt der Übersicht und in `NUTZER.md`: woran er den Zeitpunkt erkennt (etwa eine Desktop-Benachrichtigung), was er
  tut und was danach von selbst passiert. Ein „Du musst nichts tun“ an dieser Stelle ersetzen. Grund: Zwischen vielen
  Statuszeilen geht eine einzelne Bitte sonst unter.
- Uhrzeiten für den Kopf („Text vom …“) und für Journal-, Stand- und Entscheidungszeilen vor dem Schreiben per
  `date '+%d.%m %H:%M'` holen, nie aus dem Verlauf hochrechnen. Grund: Geschätzte Uhrzeiten liegen leicht 5–10 min
  daneben, und das zusammengeführte Journal wird nach Zeit sortiert, steht dann also in falscher Reihenfolge.

## Lagefrage des Nutzers („hängt etwas? geht es voran?“)
1. In einem parallelen Block lesen: Pane-Status aller Spuren (`herdr pane list`), die letzten Journalzeilen je Spur,
   Queue-Zeilen außer fertig/offen, letzter Commit je Spur-Branch, Worker-Aktivität (Alter der
   `/tmp/acp-delegate/<runId>.activity`, `ERGEBNIS`-Zeile in `.out`), Ende von Watchdog- und Aufsicht-Log,
   Tor-Skripte (`-v`-Varianten für RAM und Kontingent).
2. Urteilen: Eine idle Spur ohne Worker hängt nicht, wenn ihre letzte Journalzeile einen Wartegrund nennt (Tor NEIN,
   Pause bis …) und ein Weck-Task läuft. Sie hängt erst, wenn alle Tore frei sind und nach ihrem nächsten
   Weckzeitpunkt keine neue Aktion kommt. Steht der Weckzeitpunkt kurz bevor, abwarten und erneut lesen (Wartebefehl
   mit Tool-Parameter `timeout`, das bash-Tool bricht sonst nach 60 s ab). Grund: Ein Anstoß während eines geplanten
   Wartens unterbricht nur, und ein voreiliges „hängt“ beunruhigt den Nutzer grundlos.
3. Antworten: erster Satz das Urteil, dann „Was gerade passiert“ (letzte Abschlüsse, neu gestartete Worker, kurze
   Pausen mit Grund), „Fortschritt“ (n von m, Tempo je Stunde, grobe Restzeit, was danach automatisch folgt), „Was
   bremst“ (Tor mit Zahlen und Freigabezeit), „Überwachung“ (welche Wächter laufen).

## Prüfen nach Änderungen am Renderer oder Wrapper
- Änderungen in `.new`-Kopien schreiben und den Renderer erst gegen eine Kopie des Statusordners laufen lassen
  (`STATUS_DIR=<tmp-kopie>`, Test-Übersicht mit gültigem, gefiltertem, unbekanntem und kaputtem Platzhalter), dann per
  `mv` einsetzen. Grund: Der Timer liest sonst halbe Skripte oder überschreibt die Live-Seite mit Testinhalt.
- Wrapper einmal per Hand laufen lassen; das HTML mit `html.parser` auf unbalancierte Tags prüfen (Start-/End-Tag-
  Stapel, void-Elemente wie `meta`, `br` ausnehmen).
- Schlüsselstrings prüfen: „Gesamtplan: n von m“, Queue-Summen je Gruppe, Ressourcenzeile mit Tor-Ausgaben, eine
  Live-Zelle je laufendem Auftrag, die eigenen Wachen unter „Kontrolle (Loop)“.
- Als Artefakt registrieren, den file://-Pfad nennen; im Chat kurz: Gesamtplan n/m, aktuelle Phase, was genau fehlt,
  Engpass und grober Zeitrahmen.
