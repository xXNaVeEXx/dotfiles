# Nacharbeit nach rotem Wellen-Gate / roter Wellen-CI (Spur-Orchestrator, Integrationsbranch ist frei)

Der Leitstand fährt am Wellenende die Voll-Suite über den Integrationsstand und öffnet dann einen PR aus einem
Schnappschuss-Branch. Meldet er rote Tests (Gate) oder einen roten CI-Job (PR), die jede Paket-Prüfung übersehen hat,
beheben die Spur-Orchestratoren das selbst (kein neues Paket, kein Worker nötig, wenn es mechanisch ist).

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

## Lehren
- Massenhaft angelegte leere Platzhalter (Gerüst-Generator, ~300 Dateien) sind ein Risiko, wenn ein Build-Skript jede Datei
  im Ordner einbettet und Tests Nicht-Leere verlangen. Platzhalter nur anlegen, wenn kein Konsument sie als Eingabe liest;
  sonst legt das spätere Paket die Datei mit den ersten echten Inhalten an. Den Generator danach so ändern, dass er die
  Hülle nicht neu erzeugt (sonst kehrt der Fehler mit dem nächsten Lauf zurück).
- Der Paket-Endlauf wählt Schritte aus den geänderten Pfaden: reine JSON-/Doku-Änderungen lösen keinen Rust-Test aus, obwohl
  `build.rs` sie einbettet. Ein Paket, das viele Dateien in einem von `build.rs`/Tests gelesenen Ordner anlegt, muss den
  Test des einbettenden Crates im Endlauf haben (Queue-Werkzeug-Regel oder Zusatzschritt), sonst fällt es erst im Gate auf.
- Ein Hilfsskript und der `bg_run`, der es startet, gehören in getrennte Tool-Blöcke: Beide laufen parallel, der Start
  findet die Datei sonst nicht (Exit 127).
- Eine Warte-Schleife auf `gh pr checks` muss den Stand des NEUEN Kopf-Commits abwarten (Run-SHA prüfen); ein altes „fail“
  beendet sie sonst sofort.
