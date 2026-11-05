# Spur-Orchestrator im Paket-Queue-Betrieb (Queue-Werkzeug `wpq.py`, Worker per acp_delegate)

Gilt für eine L1-Spur, die Pakete einer Queue der Reihe nach über ein gemeinsames Queue-Werkzeug (Status, Worktree, Abnahme,
Endlauf `check`, Integration `integ`) abarbeitet. Ablauf: Kontrollrunde → `next` → `wt` → Worker → `abnahme` → `check` → `integ`.
Laufende Taktung: nach jedem Wecken `next` erneut aufrufen (frei gewordene Abhängigkeiten starten sofort, max. 2 Worker je Spur);
ist der Herzschlag-Task beendet, sofort genau einen neuen starten — nie zwei parallel, nie keinen.

## Modellvorgaben des Leitstands wechseln mitten im Lauf
- Der Leitstand kann während der Spur ändern, welche Modelle erlaubt sind (z. B. „nur noch Claude“). Dann: sofort laufende
  Reviewer des gesperrten Modells per `acp_delegate_cancel` beenden und mit erlaubtem Modell neu starten (Teilausgabe ist wertlos),
  Queue-Status anpassen, die Änderung mit einer Journalzeile bestätigen, die geänderte START.md/Queue neu lesen.
  Gilt die Vorgabe „nur Claude“, ist die Paarung Worker opus → Prüfer sonnet, Worker sonnet → Prüfer opus; bei Startfehlern
  wird zwischen sonnet und opus gewechselt, nie auf ein anderes Modell ausgewichen. Ist das Kontingent-Tor zu, wartet `next`
  (kein Ausweichen): Herzschlag dann mit `--max 21600 --quota <anbieter>` und nur kurze Turns, damit die Pause wenig kostet.

## Worker starten
- `wt <WP>` (Worktree anlegen) und `acp_delegate` NIE im selben Tool-Block abschicken: Beide laufen parallel, der Worker kann vor
  dem fertigen Worktree starten und scheitert sofort mit `spawn …/node ENOENT` (cwd fehlt, Node selbst ist in Ordnung).
  Reihenfolge: erst `wt` und Ausgabe prüfen, dann in einem eigenen Block `acp_delegate`. Scheitert ein Start dennoch sofort
  (`FAILED` ohne Aktivität), einmal allein wiederholen, bevor das Modell gewechselt wird. Die Status-Zeile `läuft <runId> <modell>`
  erst setzen, wenn der Worker nach ~20 s Aktivität zeigt.

## Lebenszeichen eines frisch gestarteten Workers
- Im neu angelegten Paket-Worktree taugen `find -newermt` und `git log -1` nicht (der Baum ist beim Start identisch zur Basis,
  der erste Commit kommt erst spät). Stattdessen `git status --short` (neue/geänderte Dateien) plus Größe und mtime von
  `/tmp/acp-delegate/<runId>.activity`. Grund: Beides steigt schon in den ersten Minuten, Commits nicht.
- Meldet der Herzschlag „fertig <runId> (seit N min fertig, Queue sagt noch läuft)“, ist der Worker beendet (SIGTERM nach
  Abschluss ist normal): sofort Ergebnisdatei (`tail` von `/tmp/acp-delegate/<runId>.out`, letzte Zeile `ERGEBNIS:`) lesen und
  mit `abnahme` weitermachen, nicht auf eine weitere Benachrichtigung warten.

## Endlauf rot durch Dateien, die ein späteres Paket liefert
- Rot im Endlauf trennen in (a) echte Mängel des Pakets und (b) Schritte, die strukturell erst durch ein anderes Paket grün
  werden können (z. B. E2E-Harness kommt mit dem Prüfwerkzeug-Paket am Queue-Ende). Für (b) nie das Paket blockieren und nie
  die Prüfung stillschweigend entfernen: im Queue-Werkzeug den Schritt für die betroffenen Pakete als „übersprungen – Harness
  folgt mit <Paket>“ ausgeben (Ausnahme: das liefernde Paket selbst prüft dann ALLE Szenarien), die Entscheidung mit Grund an
  die zentrale Entscheidungsdatei hängen und im Journal vermerken.
- Rot (a) in einer Datei, die laut Pfadliste einem Nachbar-Paket gehört, aber vom neuen Typ erzwungen wird (z. B. ein
  `Record<Mode, …>` braucht den neuen Enum-Wert): kleiner Selbst-Fix ≤ 20 Zeilen im Paket-Worktree mit `git add <Pfad>` +
  `git commit`, statt einen Worker für eine Zeile zu starten. Das Nachbar-Paket zieht die Basis vor seinem Start ohnehin nach.
- Rot durch genau EINEN Bestandstest, den das Paket nicht berührt (Fehlermeldung ohne Bezug zu den geänderten Dateien, alle
  anderen Tests grün): zuerst `git diff <Basis>...HEAD --stat` auf Berührung prüfen, dann den Endlauf einmal wiederholen
  (Zustands-/Reihenfolge-Flake im Parallellauf); bleibt er rot, im Bericht/Journal als fremder Bestandsfehler melden statt
  das Paket zu blockieren. Der Wiederholungslauf gehört ohnehin hinter einen Reviewer-Fix.

## Abnahme „Dateien außerhalb der eigenen Pfade“
- Meldet `abnahme` (oder `integ`) diesen Mangel, erst klären, ob der Brief die Datei ausdrücklich verlangt (z. B. ein Pflicht-Test)
  oder ob ein Typ/eine Abhängigkeit sie erzwingt, die Pfadliste sie aber vergessen hat (typisch: die Manifest-Datei einer Hülle
  aus dem Fundament-Paket, die das Folge-Paket mit Abhängigkeiten füllt; oder ein Bestands-Test, den neuer Testcode rot macht).
  Dann nicht den Worker nacharbeiten lassen
  und die Datei nicht verschieben, sondern die Pfade des Pakets im Queue-Werkzeug zusätzlich freigeben (Freigabe-Datei je Paket,
  eine Zeile je Pfad, z. B. `vorgaben/<WP>.pfade`), Entscheidung mit Grund an die zentrale Entscheidungsdatei hängen, `abnahme`
  wiederholen. Kriterium: Datei neu oder nur von bereits integrierten Paketen berührt, also keine Überschneidung mit laufenden
  (prüfbar mit `git diff --name-only <Basis>...HEAD` der anderen Worktrees).
- Worker legen die Freigabedatei teils selbst an (mit Kommentar „Bestätigung offen“) oder weisen im Bericht darauf hin:
  Ergebnisdatei und `vorgaben/` lesen, nicht erst auf den `abnahme`-Mangel warten, die Freigabe inhaltlich gegenlesen und den
  Entscheidungsdatei-Eintrag selbst nachtragen (der Worker tut es nicht). Zusätzlich `git diff <Basis>...HEAD -- <Manifest>`
  lesen: nur additive Zeilen, Normalbau bleibt unverändert (Netz-/Test-Features nur optional bzw. in dev-dependencies).
- Die Freigabe muss VOR dem Selbst-Fix/`integ` stehen; `integ` prüft die Pfade erneut und bricht sonst mit Exit 1 ab.
- Endet der Worker-Bericht mit `ERGEBNIS: teilweise – … Pfadfreigabe fehlt` (oder fehlt die Schlusszeile ganz: `abnahme` warnt
  „Bericht ohne Schlusszeile“), besteht `abnahme` noch, aber `integ` bricht mit „MANGEL Bericht: ERGEBNIS: teilweise“
  (Exit 1) ab, weil es die Schlusszeile strikt auf `fertig` prüft. Nach bestätigter
  Freigabe die Schlusszeile im Bericht des Pakets auf `ERGEBNIS: fertig – …` ändern/anhängen, committen (Doku-Pfad gehört dem
  Paket) und `integ` neu starten; diese Änderung löst im `integ` einen vollen Neu-Endlauf aus (rund 10 min) – besser gleich
  beim Bestätigen der Freigabe erledigen, noch vor dem Endlauf.

## Integration (`integ`) in mehreren Runden
- `integ` merged feat in den Paket-Worktree und prüft neu, sobald eigene Änderungen seit dem letzten Endlauf oder fremde
  Dateien im Spiel sind; ist feat währenddessen durch eine andere Spur weitergelaufen, folgt „nächste Runde“ mit erneutem
  Endlauf. Das ist normal (Minuten bis über eine Viertelstunde), kein Hänger: nicht abbrechen, Herzschlag weiterlaufen lassen.
  Mehrere `integ` verschiedener Pakete dürfen gleichzeitig gestartet werden; das Werkzeug serialisiert den Push. Bei Speicherlimit
  `LUMI_REMOTE_JOBS=2` auch für `integ` setzen, weil dessen Neu-Endlauf sonst ebenfalls mit 255 abbricht.

## Hinweise aus Worker-Berichten an spätere Pakete weitergeben
- Worker nennen im Bericht Voraussetzungen für ein späteres Paket (z. B. Reihenfolge der CI-Schritte, die das Prüfpaket
  einbauen muss) oder Anschlüsse, die sie wegen fremder Pfade nicht selbst machen konnten (z. B. Registrierung im Gateway-Start).
  Beim Abnehmen sofort ins Journal der Spur schreiben, sonst geht es vor dem Start des Zielpakets verloren;
  beim Start des Zielpakets prüfen, ob der Brief es schon enthält.

## Reviewer bei großem Diff
- Die Grenze „~500 geänderte Zeilen“ gilt für echten Code. Besteht der Diff überwiegend aus generierten/gleichförmigen
  Gerüstdateien (`git diff --numstat | sort -rn | head`), die Größe der nicht-gleichförmigen Dateien zählen; unter der Grenze
  genügt Stichprobe + grüner Endlauf. Begründung ins Journal.
- Reviewer (anderes Modell, nur lesen, ausdrücklich „keine cargo-/npm-Builds“, Antwort ≤ 40 Zeilen mit FAZIT-Zeile) parallel zum
  Endlauf starten, nicht danach. Bei Paketen mit Sicherheits-/Sperr-Charakter (Netz-Tor, Pfadprüfung, URL-/Redirect-Parser)
  im Auftrag ausdrücklich nach Umgehungen durch Parser-Unterschiede fragen (Schreibweisen, die der echte Client anders liest
  als die eigene Prüfung), nach Feature-Gating-Lücken und nach Wegen am Tor vorbei (öffentliche Funktionen, die den rohen
  Client/Builder herausgeben, Test-Nähte ohne `cfg(test)`/Feature, Umgebungs-Proxys). Bei UI-/Transportpaketen nach
  Reconnect-Wettläufen fragen (spätes `onclose` des alten Sockets kappt den neuen; `send` wirft → Anfrage bleibt in
  `pending` hängen) und danach, ob Test-Doubles synchron schließen und damit den Fehler verdecken. Bei Generator-/Scan-Paketen
  (Build-Skripte, die Module/Dateien einsammeln) nach Textsuche statt Parsing (`contains("fn register(")` trifft Methoden,
  Kommentare, private Funktionen), Symlink-Folgen (`is_dir()` folgt Links → Schleifen/fremde Ordner), ungültigen Bezeichnern,
  fehlendem `rerun-if-changed`, unbegrenzt hängenden dynamischen Importen und Fehlerisolierung je Gruppe fragen; `--check`-Modi
  müssen rot werden können. Echte Funde mit kleinem
  Fix (z. B. Race beim Abonnieren: Startwert vor dem Anlegen des Abos lesen; Server-Task ohne Abort bei Drop; ungeprüfter
  Index; Redirect-Ziel nach Client-Regeln normalisieren; Socket-Generationsprüfung `this.current === ws`; Tor-Umgehung durch
  eigenen Anfrage-Typ ohne `send`) selbst im Worktree beheben, einen Test für den Fund ergänzen (Test-Double mit
  verzögertem `onclose`/werfendem `send`), committen, `abnahme` + Endlauf wiederholen; gering/dokumentierte Funde nur ins
  Journal. Nach jedem Code-Commit muss `WPQ_HEAD` des Endlaufs wieder dem HEAD entsprechen: darum, falls der Endlauf schon
  grün ist, mit `integ` auf den Reviewer warten und den Endlauf nach dem Fix wiederholen.
- Läuft der Endlauf noch, während der Reviewer-Fix im selben Worktree editiert wird, ist dessen Ergebnis gemischt und wertlos:
  Endlauf per `bg_kill` beenden, Fix committen (bestätigen), neuen Endlauf starten, altes Ergebnis verwerfen.
- Ein Fix aus einem Review-Fund wird erst nach dem Endlauf als korrekt gewertet: Fehlertypen und Importe im Paket-Worktree
  nicht raten (`anyhow::anyhow!` statt `format!` bei `#[from] anyhow::Error`), sondern den Endlauf sofort nach dem Commit
  starten und dessen ersten Schritt (`cargo-check`, ~0,2 min) lesen. Fix und Commit in EINEM Block mit `&&` und danach
  `git log -1`; ein Hook lehnt Betreffzeilen > 72 Zeichen ab (der Block bricht ab, die Änderung bleibt ungestaged/uncommittet:
  nach einem Fehlschlag `git status` prüfen und `git add` + `commit` mit kürzerer Zeile wiederholen, Endlauf nie vor
  bestätigtem Commit starten).

## Gemeinsames Werkzeug wird von anderen Spuren live bearbeitet
- Das Queue-Werkzeug liegt in einem Ordner, den alle Spuren editieren. Schlägt ein Aufruf mit `SyntaxError` in einer Datei fehl,
  die du nicht angefasst hast (oder kurz nach deiner eigenen Änderung), zuerst `python3 -c "import ast;ast.parse(open(f).read())"`
  und erneut starten, bevor du Ursachen suchst: meist war eine fremde Teil-Schreibung gerade im Gang. Eigene Änderungen am
  Werkzeug klein halten und danach prüfen, dass sie noch drinstehen (`grep`), weil eine fremde Voll-Schreibung sie überschreiben kann.
- Eigene Änderung immer mit Parse-Check absichern, bevor der Endlauf als Hintergrundtask startet; ein sofort scheiternder
  Task kostet sonst eine Runde.

## Speicherlimit im Endlauf
- Bricht der Test-Schritt auf dem Build-Host mit Exit 255 ab (Speicherlimit, kein Testfehler), mit weniger parallelen Jobs
  wiederholen (z. B. `LUMI_REMOTE_JOBS=2`), nicht den Worker nacharbeiten lassen. Laufen zwei Endläufe gleichzeitig, beide mit
  2 Jobs starten.
- Pakete, die das große Desktop-Crate im Test mitbauen, brauchen zusätzlich einen größeren Speicherdeckel für den Bau
  (Worker melden das im Bericht, z. B. `CLAW_MEM=14G`); Endlauf dann mit dieser Variable starten, nicht mit weniger Jobs allein.
