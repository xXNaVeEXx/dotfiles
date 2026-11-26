# Wellenende: Gesamtlauf starten und Nacharbeit nach rotem Gate / roter CI

Der Leitstand fährt am Wellenende die Voll-Suite über den Integrationsstand und öffnet dann einen PR aus einem
Schnappschuss-Branch. Der erste Abschnitt gilt für den Leitstand (Start des Gesamtlaufs), die folgenden für die
Spur-Orchestratoren (Nacharbeit; der Integrationsbranch ist dann frei).

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
