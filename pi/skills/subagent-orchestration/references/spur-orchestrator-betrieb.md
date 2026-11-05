# Spur-Orchestrator im Paket-Queue-Betrieb (Queue-Werkzeug `wpq.py`, Worker per acp_delegate)

Gilt für eine L1-Spur, die Pakete einer Queue der Reihe nach über ein gemeinsames Queue-Werkzeug (Status, Worktree, Abnahme,
Endlauf `check`, Integration `integ`) abarbeitet. Ablauf: Kontrollrunde → `next` → `wt` → Worker → `abnahme` → `check` → `integ`.

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
