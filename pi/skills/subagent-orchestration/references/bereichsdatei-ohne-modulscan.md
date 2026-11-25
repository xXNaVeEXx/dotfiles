# Bereichsdatei ohne Modul-Scan: Gruppenordner wird nie kompiliert

Hat ein Crate (z. B. die CLI) keinen Modul-Scan, trägt eine handgeschriebene Bereichsdatei (`mod.rs` mit Befehls-Enum) die Gruppen ein.
Ohne `pub mod <gruppe>;` und Dispatch-Zeile sind Code und Tests des Pakets tot; der Worker fragt dann per Rückfrage nach Freigabe
(oder meldet „grün“ für nie kompilierten Code).

## Ablauf
1. Beim Start des ERSTEN Pakets eines solchen Bereichs prüfen: `grep -rn 'include!' <crate>/src`, Scan-Aufrufer, vorhandene Gruppenordner.
2. Zusatzfreigabe sofort anlegen, `vorgaben/<WP>.pfade` (Kommentarzeile mit Grund):
   Bereichs-`mod.rs`, neue Gruppen-`mod.rs` (nur `pub mod <untergruppe>;`), `docs/manual/handbuch.html` (nur per `node tools/manual-gen.mjs`).
3. Auflagen an den Worker: nur additive Zeilen (Mod-Zeile, Enum-Varianten, run-Zeilen), EIGENER Commit, Präzedenz-Eintrag in ENTSCHEIDUNGEN nennen.
4. Rückfrage des Workers im selben Turn beantworten (Datei schreiben, dann `subagent_supervisor reply`); hat der Leitstand dieselbe Freigabe schon eingetragen, Datei lesen und nichts doppelt anhängen.
5. Folgepakete desselben Bereichs EINZELN nacheinander starten (je gleichartige `.pfade`), Merge-Konflikte bei der Integration von Hand lösen.

Grund: Parallel konfligieren alle Pakete in denselben Zeilen der Bereichsdatei, und ohne Anschluss prüft kein Test den Code.

Ist NUR die Bereichsdatei der CLI freigegeben (keine eigene Gruppen-Ordner-Freigabe unter der CLI), gehört die Befehlslogik als Funktion in das
Modul des Pakets in der Kern-Crate; die CLI-Variante ruft nur diese Funktion. Legt der Worker CLI-Dateien unter dem Gruppenordner an, meldet `abnahme`
„Dateien außerhalb der eigenen Pfade“ — dann Logik verschieben statt Pfade nachzufreigeben. Diese Zeile schon in den Start-Task schreiben.

Gleiches Muster bei der Flutter-Handy-App: Das Gruppenregister (`apps/lumi/lib/claw/<bereich>/<gruppe>/register.dart`, anfangs `void register(ClawRoutes r) {}`)
gehört keinem Paket exklusiv. Fragt der Worker nach der Anmeldung seiner Handy-Ansicht, additiv freigeben (import + `r.gruppe/r.texte/r.seite`, eigener Commit,
Präzedenz-Gruppe nennen) und in `.pfade` eintragen — besser schon beim Start, wenn der Brief eine Handy-Ansicht verlangt.

## Szenario-Datei des Briefs fehlt in der Pfadliste
Nennt der Brief ein E2E-Szenario (`tests/…/E2E-*.toml`) oder eine andere Datei außerhalb der Paket-Ordner, kennt `abnahme` sie nur, wenn sie in der
Pfadliste steht; sonst meldet es MANGEL „Datei außerhalb der eigenen Pfade“ erst nach der Arbeit des Workers.
- Beim Anlegen von `vorgaben/<WP>.pfade` den Brief gegen die Liste halten: `grep -n "E2E-\|\.toml" wp/<WP>.md` und jede Fundstelle eintragen.
- Von einem Geschwisterpaket nur die STEHENDEN Freigaben kopieren (`handbuch.html`, `Cargo.toml` der eigenen Crate); dessen Szenario-Zeilen gehören
  dem Geschwister und passen nicht zum neuen Brief. Fehlt dem Folgepaket ein Szenario, fragt der Worker zurück.
- Rückfrage wegen fehlender Datei: Zeile mit Grund an `.pfade` anhängen, ENTSCHEIDUNGEN + Journal ergänzen, `subagent_supervisor reply` im selben Turn.
- Der Endlauf `wpq check` ruft das E2E-Skript mit `--filter <E2E-ID>` und findet das Szenario NUR über den Dateinamen (Teilstring-Treffer auf ID oder Dateiname): Die Datei muss `E2E-<ID>.toml` heißen
  (nicht nach dem Paket benannt), sonst bricht der Check mit Exit 2 ab. Die E2E-ID steht im Brief-Abschnitt „E2E-Szenarien“; die Pfadliste
  desselben Briefs nennt dagegen einen paketbenannten Dateinamen (`LC-WP-…toml`) – der ist für den Filter falsch, die ID aus dem Abschnitt gewinnt
  (sie stammt oft aus einem anderen Nummernkreis als das Paket). Den Dateinamen `E2E-<ID>.toml` in `.pfade` UND wörtlich in den Worker-Start-Task schreiben.
- Nennen ZWEI Pakete dieselbe E2E-ID (z. B. Geschwister teilen sich ein Szenario): dem Folgepaket eine EIGENE Datei mit Suffix geben (`E2E-<ID>-<thema>.toml`) – sie trifft den Filter weiter, kollidiert aber nicht mit der Datei des Geschwisters (kein Merge-Konflikt, kein Überschreiben). In `.pfade`, ENTSCHEIDUNGEN und Worker-Task nennen und dem Worker verbieten, die Geschwister-Datei anzufassen.
- Deckt ein Szenario mehrere Pakete ab (z. B. Datei-Speichern, PDF, Wiki-Notiz in einer E2E-ID), prüft der Worker nur den eigenen Teil offline; die Teile der Geschwister stehen im TOML-Kopf und im Bericht als „gehört anderem Paket“ — ehrliches Teilszenario statt Runner-Änderung.
- Ändert das Paket ein Handbuch-Fragment (`docs/manual/claw/**/<WP>.json`), scheitern die UI-Tests `generator-drift`/`handbuch`, bis `handbuch.html`
  per `node tools/manual-gen.mjs` neu erzeugt ist: `docs/manual/handbuch.html` von Anfang an freigeben (nur Generator-Ausgabe, eigener Commit). Verlangt der Brief ausdrücklich kein Handbuch, `handbuch.html` NICHT freigeben.
- Eine `.pfade`-Freigabe VOR dem `integ`-Start in eigenem Tool-Block anlegen; im selben Block gestartet verliert `integ` den Wettlauf (MANGEL Pfad).
Grund: Die Pfadliste ist die einzige Quelle der Abnahme; jede Lücke kostet eine Rückfrage-Runde samt Wartezeit des Workers.

## Worker läuft ins Zeitlimit (90 min) mit unfertigem Paket
Typisch: Rust und E2E committet, UI/Handbuch uncommittet, Bericht und Status-YAML fehlen (`abnahme` nennt 4 Mängel).
- `git status`, `git log <Basis>..HEAD`, `wpq.py abnahme` lesen; kurzen Abschluss-Brief nach `nacharbeit/<WP>.md` schreiben (was committet ist, was laut `abnahme` fehlt, früh committen) und einen frischen Worker auf demselben Worktree starten; Status währenddessen „läuft <runId> <modell> (Abschluss-Worker)“.
- In JEDEN Start-Task für große Pakete: „nach 60 min zuerst committen, was da ist; Bericht und Status-YAML vorrangig“. Grund: Das Zeitlimit tötet den Worker ohne Vorwarnung, uncommittete Arbeit ist dann nur durch einen weiteren Lauf zu retten.
- Reviewer bleibt ein anderes Modell als der Abschluss-Worker (Worker opus → Reviewer sonnet).

### Zeitlimit NACH fertigem Bericht (häufiger Fall)
Meldet `abnahme` „ABNAHME OK“ und steht die Schlusszeile im Bericht, ist das Paket fertig – kein Abschluss-Worker, sondern normal weiter mit Review. Der Worker verbrachte die Restzeit meist mit einem eigenen `wpq check` (läuft im Hintergrund weiter, wartet z. B. 25 min auf einen belegten Remote-Slot): `pgrep -af "wpq.py check <WP>"` und zugehörige `rb.sh`-Prozesse mit `kill <pid>` beenden (keine `pkill -f`), sonst blockiert er den Remote-Slot der Spur. Testzahl selbst nachzählen (Bericht und Realität weichen oft um 1 ab) und dem Reviewer die Abweichung mitgeben.
- Worker-Tasks verbieten ausdrücklich „`wpq.py check` selbst starten“ (Prüfung nur über `tools/remote.sh`); der Endlauf gehört der Spur.

## Merge-Konflikte bei der Integration (Exit 4) in gemeinsam genutzten Dateien
Pakete derselben Gruppe erweitern dieselbe Crate-`Cargo.toml` (neue Abhängigkeiten) und lassen `handbuch.html` neu erzeugen; der erste Einbau
nach einem Geschwisterpaket konfligiert deshalb fast sicher. Lösung im Paket-Worktree (nicht im Integrationsbaum), dann `git add` +
`git commit --no-edit`, `touch apps/lumi-desktop/crates/*/build.rs` und `integ` erneut:
- `Cargo.toml`: BEIDE Seiten behalten (Abhängigkeiten und Kommentarzeilen je Paket), doppelte Schlüssel wie `axum.workspace = true` nur einmal.
- `Cargo.lock`: kein Konfliktmarker nötig, wenn nur ein Abhängigkeitsblock abweicht; im Block der eigenen Crate die neuen Namen alphabetisch
  ergänzen (`"hmac"`, `"sha2"`); Abgleich gegen die Paket-Seite per `git show <paket-commit>:<pfad>/Cargo.lock`. Die endgültige Prüfung macht der
  Endlauf von `integ`, denn ein lokales `cargo metadata --locked --offline` kann am fehlenden Netz scheitern.
- Bereichsdatei (`werkz/mod.rs` o. ä.): beide Seiten sind reine Zusatzzeilen (`pub mod`, Enum-Variante, `match`-Arm) → alle behalten; Marker per
  `sed -i -e '/^<<<<<<< /d' -e '/^=======$/d' -e '/^>>>>>>> /d' <datei>`, danach Ergebnis lesen (je Gruppe genau ein `mod`, eine Variante, ein Arm).
- `handbuch.html`: Konfliktfassung verwerfen (`git checkout --ours` bzw. `--theirs`), `node tools/manual-gen.mjs` und `--check`, dann erst `git add`.
Grund: Von Hand gemischte Hunks in erzeugten Dateien driften; Lockfile-Zeilen und Registerzeilen sind dagegen reine Listen und sicher von Hand zu ergänzen.

## Worker bittet um lokalen Lauf eines Werkzeugs, das auf dem Remote-Rechner fehlt (z. B. Flutter)
- Ablehnen (RAM-Schutz: keine lokalen Builds/Tests), per `subagent_supervisor reply` im selben Turn: Test sauber schreiben und von Hand gegen Nachbartests auf Typ-/Import-Fehler lesen, im Bericht unter „Nicht umgesetzt oder nur teilweise“ „nicht ausgeführt“ vermerken, Status der Ansicht `ersatz` statt `umgesetzt`.
- ENTSCHEIDUNGEN + Journal ergänzen und den Nachholauf (z. B. `flutter test <pfad>`) als offenen Punkt im Bericht der Spur führen.
Grund: Ein ungeprüfter Test als „umgesetzt“ meldet Grün für nie gelaufenen Code; ein lokaler Lauf riskiert den OOM-Absturz der Sitzung.

## Endläufe und Integration nacheinander
Auf dem Remote-Rechner laufen schon die Prüfläufe anderer Spuren: den Endlauf (`wpq check`) eines weiteren Pakets erst starten, wenn der vorige Endlauf/`integ` der eigenen Spur beendet ist (`pgrep -af "wpq.py (check|integ)"`); Status solange „prüfen: … endlauf folgt“. Grund: Zwei parallele Remote-Läufe erzeugen Last-Flakes und doppelte Wartezeit statt Durchsatz.

## `integ`/Endlauf bricht ab: Remote-Fehler vs. SIGTERM
- Endlauf rot NUR in einem Schritt mit `RB_EXIT=255` und „server … not responding“ (andere Schritte grün) = Remote-Ausfall, kein Paketfehler: `touch build.rs`, `integ` einfach neu starten (`rb.sh` nimmt dann den Ersatzrechner). Kein Brief, kein Worker.
- Endet das integ-Log nach wenigen Sekunden mit „ABGEBROCHEN (Signal/Exit 143)“ und `QUEUE` steht auf „fehler integ abgebrochen“, hat ein Signal die Prozessgruppe des `bg_run`-Tasks getötet; der Herzschlag wartet dann auf nichts. Prüfen: `pgrep -af "wpq.py integ"` leer, Log lesen, `git status` im Paket-Worktree sauber. Neu starten ABGEKOPPELT: `setsid nohup bash -c "python3 $C/wpq.py integ <WP>; echo INTEG_EXIT=\$?" > $C/spuren/<SPUR>/integ-<wp>.out 2>&1 < /dev/null & disown`, Ausgabe später per `tail` lesen. Dieselbe Form für lange Endläufe nutzen. Grund: abgekoppelte Prozesse überleben Werkzeug-/Sitzungszeitlimits und Neustarts der Tool-Gruppe.
- Nach jedem Task-Ende (Notification) trotzdem `wpq.py stand` lesen und nicht nur „completed“ glauben: Exit 0 des bg_run kann ein abgebrochenes integ verdecken (`echo INTEG_EXIT=$?` steht dahinter).
- Läuft `integ` lange, weil `feat` zwischendurch weiterwandert („inzwischen weiter – nächste Runde“, Runde 2/3 mit vollem Endlauf), ist das normal: im Log nur die letzte Rundenzeile lesen, keine Eingriffe, Reviews/Starts anderer Pakete weiter nach Lauf-Register und RAM entscheiden.
