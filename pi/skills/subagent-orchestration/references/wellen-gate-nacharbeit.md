# Wellenende: Gesamtlauf starten und Nacharbeit nach rotem Gate / roter CI

Der Leitstand fährt am Wellenende die Voll-Suite über den Integrationsstand und öffnet dann einen PR aus einem
Schnappschuss-Branch. Die ersten beiden Abschnitte gelten für den Leitstand (Start des Gesamtlaufs, Nacharbeit über
mehrere Spuren führen), die folgenden für die Spur-Orchestratoren (Nacharbeit; der Integrationsbranch ist dann frei).

## Start des Gesamtlaufs (Leitstand, sobald die letzte Spur fertig meldet)
1. Fertigmeldung belegen: Zähler der Queue, Fertig-Marker, Bericht der Spur, Integrationsbranch = Remote, kein Worker
   mehr im Lauf-Register, keine Prüf-/Einbau-Prozesse mehr.
2. Abschlussbericht JEDER Spur ganz lesen, bevor gestartet wird, und die Abschnitte „Offen“ und „Risiken“ in die
   Stand-Datei übernehmen (mit Dateipfad des Berichts). Grund: Dort steht, was gebaut, aber noch ohne Aufrufer ist; das
   ist der Auftrag der nächsten Welle und geht sonst mit dem Schließen der Spur-Sitzungen verloren.
3. Speichergrenzen des Laufs am Rechner bemessen, auf dem er tatsächlich baut, nicht am Rezept: Summe der Deckel aller
   gleichzeitig laufenden Bau-Slots unter dem verfügbaren Speicher dieses Rechners halten (Rezept-Werte gelten für den
   Haupt-Bauhost; auf dem Ersatzrechner laufen daneben Sitzungen und Dienste). Lieber kleinere Deckel je Slot und den
   eingebauten Neuversuch mit weniger Jobs nach OOM hinnehmen (kostet nur Zeit), als den Rechner in den Swap zu treiben
   (der Speicherwächter beendet dann die größte Sitzung). Abweichung vom Rezept in Stand-Datei und Bericht nennen.
4. Lauf als Hintergrundtask mit `set -o pipefail; … | tee <log>` starten (Exit-Code bleibt wahr), nach ~20 s die ersten
   Zeilen des Logs lesen: Queues fertig, Hauptzweig eingemischt, Push, Gate gestartet.
5. Daneben eine kleine Speicher-Wache als zweiten Hintergrundtask starten, die mit dem Lauf endet: Schleife im
   Minutentakt, Meldung und Ende bei Swap über ~80 % oder wenig verfügbarem Speicher. Den Prozess per `pgrep -f` mit
   Klammer-Trick suchen (`'phase[.]py …'`), damit die Schleife sich nicht selbst findet. Grund: Aufsicht und Watchdog
   der Spuren sind am Wellenende gestoppt; ohne eigene Wache meldet sich bis zum Lauf-Ende niemand.
6. Aufsichten fertiger Spuren nicht neu starten (ihr Watchdog-Timer stoppt beim Fertig-Marker von selbst).
7. Aufgeschobene Umstellungen jetzt nachholen, solange die Spuren ruhen (z. B. Sitzungen neu laden für ein neues
   Modell): Befehl senden, danach am Bildschirm der Sitzung die Bestätigung lesen. Als „aktiv“ gilt die Umstellung erst
   nach dem ersten belegten Start.
8. Bericht an den Nutzer: gebaut ≠ nutzbar. Ausdrücklich sagen, welche Teile schon im laufenden Programm angeschlossen
   sind und welche nur als getestete Bausteine vorliegen; teilweise behobene ernste Funde als „zum Teil behoben“ mit
   dem Rest nennen, nicht als erledigt.

## Nacharbeit nach rotem Gesamtlauf über mehrere Spuren führen (Leitstand)
1. Die roten Schritte nach Herkunft der Pakete auf die bestehenden Spur-Sitzungen verteilen, je Spur eine Auftragsdatei
   (rote Schritte mit Log-Pfad, „Ursache erst belegen, Prüfung nicht lockern“, eigener Worktree, höchstens ein Worker,
   Ergebnis-Marker OK/ROT erst nach Push). Grund: Die Spur kennt ihre Pakete; neue Pakete dafür kosten Planung und Kontext.
2. EINEN Warte-Task auf die Marker ALLER Spuren starten (ein Warte-Skript je Spur meldet schon bei der ersten). Er endet
   mit unterscheidbarem Exit-Code und einer Schlusszeile: alle OK = 0, eine Spur ROT = 3, Frist abgelaufen = 4 mit
   „WARTE-ENDE zeitablauf“. Grund: Ein Fristende mit Exit 0 kommt als „completed“ an und liest sich wie „fertig“.
3. Meldet die erste Spur fertig und ist eingebaut, der noch arbeitenden Spur sofort per Prompt sagen: den
   Integrationsstand vor dem letzten Beleglauf in ihren Nacharbeits-Worktree einmischen, und welche Stelle die andere
   Spur schon geändert hat (gemeinsame Lauf- und Smoke-Skripte bekommen von beiden denselben Fix; nur eine Fassung
   behalten). Grund: Der Beleglauf soll den Stand zeigen, den das Gate prüft, und der Einbau läuft ohne Konflikt.
4. Im Beleglauf einer Spur rot gebliebene Schritte, die der anderen Spur gehören und dort schon eingebaut sind, sind kein
   Befund; sie verschwinden mit dem Einmischen.
5. Läuft die Frist ab: Marker, Journal-Ende und laufende Prüfprozesse der Spur ansehen (arbeitet sie oder hängt sie?),
   dann einen neuen Warte-Task mit Frist bis zur erwarteten Fertigmeldung starten. Erst wenn alle Marker OK sind: Marker
   ins Log-Verzeichnis verschieben und den Gesamtlauf wie oben neu starten (neuer Log-Name je Lauf).
6. Fällt das Kontingent-Tor eines Anbieters mitten in der Nacharbeit zu: Die Pausen-Mechanik der Spuren (Pausen-Dateien,
   Sparstufe) passt hier nicht, weil die Spuren als fertig gelten und der Leitstand Marker und Gesamtlauf bedienen muss.
   Stattdessen der arbeitenden Spur ausdrücklich schreiben: keine neuen Worker oder Prüfer dieses Anbieters, die
   Restschritte (Belegläufe, Einbau, Marker) selbst und sparsam erledigen, Worker nur über den noch offenen Anbieter.
   Keine neue Kontingent-Wache bis zum Reset starten (sie würde sofort wieder auslösen). In die Nutzer-Liste als wichtigen
   Punkt: Stand des Kontingents, was trotzdem weiterläuft und warum, und das Angebot, bis zum Reset ganz zu ruhen.
   Die Grenze selbst ändert nur der Nutzer.
7. Trifft danach eine Hintergrund-Meldung ein, die schon verarbeitet ist (abgelaufener alter Warte-Task, Kontingent-Wache
   mit bereits bekanntem Auslöser): mit einem kurzen Blick bestätigen (Marker, letzte Journalzeile) und dem Nutzer in zwei,
   drei Sätzen sagen, welche Meldung das war, dass sich am Stand nichts geändert hat und wann die nächste echte Meldung
   kommt. Keine volle Runde und keine neue Statuspflege. Grund: Der Nutzer liest jede Meldung mit und hält eine stumme
   oder lange Reaktion für ein neues Ereignis.

## Ablauf (rotes Gate)
1. Ursache am Quelltext der roten Tests und am verantwortlichen Paket-Commit belegen (`git log -- <Datei>`, Dateigrößen,
   `git ls-files <Ordner> | grep …`); Aussagen im Auftrag des Leitstands gegen den Ist-Stand prüfen (z. B. eine „0 Byte“-Datei
   ist inzwischen gefüllt) statt sie zu übernehmen.
2. Die Tests unverändert lassen, wenn der Leitstand das verlangt: den Auslöser entfernen, nicht die Prüfung lockern.
3. Alle Konsumenten der betroffenen Dateien per `grep -rn` suchen (UI-Glob, Prüfskripte, Generatoren, Plan-/Architektur-Docs),
   bevor gelöscht wird: Ein Glob/`readdir` braucht die Dateien nicht, ein Generator könnte sie neu anlegen.
4. Arbeiten in einem eigenen Worktree von der Integrationsbranch (`git worktree add ../wt/<name> -b claw/<name> <branch>`):
   Das Remote-Bauwerkzeug (`rb.sh`) und die Queue-Werkzeuge verlangen einen Worktree unter dem Worktree-Wurzelordner; im
   Integrations-Checkout selbst nichts committen. Prüfläufe (Rust-Test des Konsumenten-Crates, Skript-Prüfungen, UI `tsc -b` +
   `vitest`) als ein Hintergrundskript über das Bauwerkzeug starten, danach unter der Integrations-Sperre mergen und pushen
   wie bei `integ`; Ergebnis-Datei für den Leitstand (`<SHA> <Kurzbeschreibung>` bzw. ROT mit Grund) erst nach Push schreiben.

## Ablauf (rote Wellen-CI, z. B. Workflow-Job nie auf GitHub gelaufen)
1. CI-Log lesen (Pfad im Auftrag), Ursache nur an der Fehlermeldung festmachen; Pakete/Werkzeuge des Runner-Images
   (`ubuntu-latest` wechselt die LTS) gegen die Paketindex-Seite der Distribution prüfen (`packages.ubuntu.com/search?keywords=<name>&searchon=names&suite=<codename>`,
   Dateiliste unter `/<codename>/<arch>/<paket>/filelist`), statt zu raten; Paketnamen per `apt-cache show` zur Laufzeit wählen,
   damit alte und neue Images laufen, und danach `command -v <Werkzeug>` im Job als Beleg.
2. ALLE noch nie gelaufenen Schritte des Jobs durchlesen und gegen das neue Image prüfen (Pakete, Pfade, Sandbox-Beschränkungen
   wie AppArmor-Sperre für Benutzer-Namensräume bei WebKit/Browsern), damit nicht jeder Fehler einen eigenen CI-Lauf kostet.
3. Der PR-Kopf ist der Schnappschuss-Branch (`claw/welle-<N>`), nicht der Integrationsbranch: Ein Fix nur auf dem
   Integrationsbranch erreicht die CI nicht. `gh pr view <nr> --json headRefName,headRefOid` prüfen und im Ergebnis dem Leitstand
   sagen, dass der Schnappschuss nachgezogen werden muss (Fast-Forward-Push); den Schnappschuss nicht selbst ändern, weil das
   Phasen-Skript ihn pusht und beim Merge `--match-head-commit` nutzt.
4. Ändert der Fix nur `.github/`, braucht es kein neues Gate; Ergebnis-Datei mit SHA und Dateiliste schreiben.

## Typische Ursachen eines roten Gesamttests (erst diese prüfen, dann tiefer graben)
- Test liest die Rechner-Konfiguration des Bauhosts (`~/.pi/agent/mcp.json`, Settings): Eine eingebaute MCP-Erweiterung
  verbindet dort konfigurierte Server, meldet „need attention“ vor der erwarteten Nachricht oder überschreibt per
  Hintergrund-Refresh die vom Test angehängten Werkzeuge. Erkennung: Test fällt fast jedes Mal, aber in 0,05 s und
  abwechselnd verschiedene Tests (Zustand, kein Zeit-Wettlauf); Beleg `LUMI_NO_MCP=1`/`HOME=<leerer Ordner>` grün. Fix im
  Test: MCP bzw. die eingebaute Erweiterung abschalten (`no_mcp = true`, `disabledBuiltinExtensions: ["mcp"]`), Erwartung
  unverändert. Vorher/nachher-Beleg fahren (ohne Fix muss genau der Test rot sein).
- Szenarien oder Skripte bauen im selben Ziel-Ordner neu (`cargo run`, GUI-Smoke mit `cargo build -p <app>`): Das Binary
  des Testlaufs verliert Feature/Testmodus, alle Folge-Szenarien melden „Gateway beendete sich ohne Meldung“ nach 0 s.
  Fix im Lauf-Skript: Test-Binary nach dem Bau in den Arbeitsordner kopieren und `LUMI_*_BIN` darauf zeigen lassen; in
  Szenarien nie `cargo run`, nur die Variable.
- Ein Szenario erwartet noch den Zustand vor einer späteren Verschärfung (z. B. „unbekannte Sitzung → Cursor“, jetzt
  Fehler -32004): Szenario an den heutigen Vertrag anpassen, die alte Abdeckung bleibt im Rust-Test.
- Tour-/GUI-Smoke-Fehler „Marke fehlt“: zuerst Screenshot und Seitentext der Fehlstelle ansehen (der Smoke sollte bei
  Fehlern die vorhandenen `data-tour`-Marken ausgeben), bevor Seiten umgebaut werden; Modal-Einrichtung, fehlende
  Sitzung/Bots im frischen Datenordner oder nicht abgeschlossener Ladezustand verdecken oft nur die Seite.
- Der GUI-Smoke startet das Gateway mit Datei-Geheimnisspeicher, aber ohne die dazugehörige Bestätigungs-Variable: Das
  Gateway startet nicht, und alle Schritte dahinter fallen. Beide Variablen gehören zusammen ins Smoke-Skript.
- Der Smoke nutzt ein veraltetes Oberflächen-Bündel (`ui/dist` von einem früheren Stand): neue Marken fehlen, obwohl der
  Quelltext sie hat. Das Skript baut das Bündel neu, wenn Quellen jünger sind als das Bündel.

## Lehren
- Massenhaft angelegte leere Platzhalter (Gerüst-Generator, ~300 Dateien) sind ein Risiko, wenn ein Build-Skript jede Datei
  im Ordner einbettet und Tests Nicht-Leere verlangen. Platzhalter nur anlegen, wenn kein Konsument sie als Eingabe liest;
  sonst legt das spätere Paket die Datei mit den ersten echten Inhalten an. Den Generator danach so ändern, dass er die
  Hülle nicht neu erzeugt (sonst kehrt der Fehler mit dem nächsten Lauf zurück).
- Der Paket-Endlauf wählt Schritte aus den geänderten Pfaden: reine JSON-/Doku-Änderungen lösen keinen Rust-Test aus, obwohl
  `build.rs` sie einbettet. Ein Paket, das viele Dateien in einem von `build.rs`/Tests gelesenen Ordner anlegt, muss den
  Test des einbettenden Crates im Endlauf haben (Queue-Werkzeug-Regel oder Zusatzschritt), sonst fällt es erst im Gate auf.
  Ebenso zeigen Pakete einzeln nie das Zusammenspiel (gemeinsamer Ziel-Ordner, Touren/Szenarien erstmals gemeinsam).
- Ein Hilfsskript und der `bg_run`, der es startet, gehören in getrennte Tool-Blöcke: Beide laufen parallel, der Start
  findet die Datei sonst nicht (Exit 127).
- Eine Warte-Schleife auf `gh pr checks` muss den Stand des NEUEN Kopf-Commits abwarten (Run-SHA prüfen); ein altes „fail“
  beendet sie sonst sofort.
