# Spur-Orchestrator im Paket-Queue-Betrieb (Queue-Werkzeug `wpq.py`, Worker per acp_delegate)

Gilt für eine L1-Spur, die Pakete einer Queue der Reihe nach über ein gemeinsames Queue-Werkzeug (Status, Worktree, Abnahme,
Endlauf `check`, Integration `integ`) abarbeitet. Ablauf: Kontrollrunde → `next` → `wt` → Worker → `abnahme` → `check` → `integ`.
Laufende Taktung: nach jedem Wecken `next` erneut aufrufen (frei gewordene Abhängigkeiten starten sofort, max. 2 Worker je Spur);
ist der Herzschlag-Task beendet, sofort genau einen neuen starten — nie zwei parallel, nie keinen.

## Lebenszeichen eines frisch gestarteten Workers
- Im neu angelegten Paket-Worktree taugen `find -newermt` und `git log -1` nicht (der Baum ist beim Start identisch zur Basis,
  der erste Commit kommt erst spät). Stattdessen `git status --short` (neue/geänderte Dateien) plus Größe und mtime von
  `/tmp/acp-delegate/<runId>.activity`. Grund: Beides steigt schon in den ersten Minuten, Commits nicht.

## Endlauf rot durch Dateien, die ein späteres Paket liefert
- Rot im Endlauf trennen in (a) echte Mängel des Pakets und (b) Schritte, die strukturell erst durch ein anderes Paket grün
  werden können (z. B. E2E-Harness kommt mit dem Prüfwerkzeug-Paket am Queue-Ende). Für (b) nie das Paket blockieren und nie
  die Prüfung stillschweigend entfernen: im Queue-Werkzeug den Schritt für die betroffenen Pakete als „übersprungen – Harness
  folgt mit <Paket>“ ausgeben (Ausnahme: das liefernde Paket selbst prüft dann ALLE Szenarien), die Entscheidung mit Grund an
  die zentrale Entscheidungsdatei hängen und im Journal vermerken.
- Rot (a) in einer Datei, die laut Pfadliste einem Nachbar-Paket gehört, aber vom neuen Typ erzwungen wird (z. B. ein
  `Record<Mode, …>` braucht den neuen Enum-Wert): kleiner Selbst-Fix ≤ 20 Zeilen im Paket-Worktree mit `git add <Pfad>` +
  `git commit`, statt einen Worker für eine Zeile zu starten. Das Nachbar-Paket zieht die Basis vor seinem Start ohnehin nach.

## Abnahme „Dateien außerhalb der eigenen Pfade“
- Meldet `abnahme` (oder `integ`) diesen Mangel, erst klären, ob der Brief die Datei ausdrücklich verlangt (z. B. ein Pflicht-Test)
  oder ob ein Typ/eine Abhängigkeit sie erzwingt, die Pfadliste sie aber vergessen hat. Dann nicht den Worker nacharbeiten lassen
  und die Datei nicht verschieben, sondern die Pfade des Pakets im Queue-Werkzeug zusätzlich freigeben (Freigabe-Datei je Paket,
  eine Zeile je Pfad, z. B. `vorgaben/<WP>.pfade`), Entscheidung mit Grund an die zentrale Entscheidungsdatei hängen, `abnahme`
  wiederholen. Kriterium: Datei neu oder nur von bereits integrierten Paketen berührt, also keine Überschneidung mit laufenden.
- Worker legen die Freigabedatei teils selbst an (mit Kommentar) oder weisen im Bericht darauf hin: Ergebnisdatei und `vorgaben/`
  lesen, nicht erst auf den `abnahme`-Mangel warten, und die Freigabe inhaltlich gegenlesen.
- Die Freigabe muss VOR dem Selbst-Fix/`integ` stehen; `integ` prüft die Pfade erneut und bricht sonst mit Exit 1 ab.

## Hinweise aus Worker-Berichten an spätere Pakete weitergeben
- Worker nennen im Bericht Voraussetzungen für ein späteres Paket (z. B. Reihenfolge der CI-Schritte, die das Prüfpaket
  einbauen muss). Beim Abnehmen sofort ins Journal der Spur schreiben, sonst geht es vor dem Start des Zielpakets verloren;
  beim Start des Zielpakets prüfen, ob der Brief es schon enthält.

## Reviewer bei großem Diff
- Die Grenze „~500 geänderte Zeilen“ gilt für echten Code. Besteht der Diff überwiegend aus generierten/gleichförmigen
  Gerüstdateien (`git diff --numstat | sort -rn | head`), die Größe der nicht-gleichförmigen Dateien zählen; unter der Grenze
  genügt Stichprobe + grüner Endlauf. Begründung ins Journal.
- Reviewer (anderes Modell, nur lesen, ausdrücklich „keine cargo-Builds“, Antwort ≤ 40 Zeilen mit FAZIT-Zeile) parallel zum
  Endlauf starten, nicht danach. Echte Funde mit Ein-Zeilen-Fix (z. B. Race beim Abonnieren: Startwert vor dem Anlegen des
  Abos lesen oder bei „ab jetzt“ gar nicht filtern) selbst im Worktree beheben, committen, `abnahme` + Endlauf wiederholen;
  gering/dokumentierte Funde nur ins Journal. Nach jedem Code-Commit muss `WPQ_HEAD` des Endlaufs wieder dem HEAD entsprechen.

## Gemeinsames Werkzeug wird von anderen Spuren live bearbeitet
- Das Queue-Werkzeug liegt in einem Ordner, den alle Spuren editieren. Schlägt ein Aufruf mit `SyntaxError` in einer Datei fehl,
  die du nicht angefasst hast (oder kurz nach deiner eigenen Änderung), zuerst `python3 -c "import ast;ast.parse(open(f).read())"`
  und erneut starten, bevor du Ursachen suchst: meist war eine fremde Teil-Schreibung gerade im Gang. Eigene Änderungen am
  Werkzeug klein halten und danach prüfen, dass sie noch drinstehen (`grep`), weil eine fremde Voll-Schreibung sie überschreiben kann.
- Eigene Änderung immer mit Parse-Check absichern, bevor der Endlauf als Hintergrundtask startet; ein sofort scheiternder
  Task kostet sonst eine Runde.

## Speicherlimit im Endlauf
- Bricht der Test-Schritt auf dem Build-Host mit Exit 255 ab (Speicherlimit, kein Testfehler), mit weniger parallelen Jobs
  wiederholen (z. B. 2), nicht den Worker nacharbeiten lassen.
