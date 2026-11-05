# Nacharbeit nach rotem Wellen-Gate (Spur-Orchestrator, Integrationsbranch ist frei)

Der Leitstand fährt am Wellenende die Voll-Suite über den Integrationsstand. Meldet er rote Tests, die jede Paket-Prüfung
übersehen hat, beheben die Spur-Orchestratoren das selbst (kein neues Paket, kein Worker nötig, wenn es mechanisch ist).

## Ablauf
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

## Lehren
- Massenhaft angelegte leere Platzhalter (Gerüst-Generator, ~300 Dateien) sind ein Risiko, wenn ein Build-Skript jede Datei
  im Ordner einbettet und Tests Nicht-Leere verlangen. Platzhalter nur anlegen, wenn kein Konsument sie als Eingabe liest;
  sonst legt das spätere Paket die Datei mit den ersten echten Inhalten an. Den Generator danach so ändern, dass er die
  Hülle nicht neu erzeugt (sonst kehrt der Fehler mit dem nächsten Lauf zurück).
- Der Paket-Endlauf wählt Schritte aus den geänderten Pfaden: reine JSON-/Doku-Änderungen lösen keinen Rust-Test aus, obwohl
  `build.rs` sie einbettet. Ein Paket, das viele Dateien in einem von `build.rs`/Tests gelesenen Ordner anlegt, muss den
  Test des einbettenden Crates im Endlauf haben (Queue-Werkzeug-Regel oder Zusatzschritt), sonst fällt es erst im Gate auf.
