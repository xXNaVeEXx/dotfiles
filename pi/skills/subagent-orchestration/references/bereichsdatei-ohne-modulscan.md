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

## Szenario-Datei des Briefs fehlt in der Pfadliste
Nennt der Brief ein E2E-Szenario (`tests/…/E2E-*.toml`) oder eine andere Datei außerhalb der Paket-Ordner, kennt `abnahme` sie nur, wenn sie in der
Pfadliste steht; sonst meldet es MANGEL „Datei außerhalb der eigenen Pfade“ erst nach der Arbeit des Workers.
- Beim Anlegen von `vorgaben/<WP>.pfade` den Brief gegen die Liste halten: `grep -n "E2E-\|\.toml" wp/<WP>.md` und jede Fundstelle eintragen.
- Von einem Geschwisterpaket nur die STEHENDEN Freigaben kopieren (`handbuch.html`, `Cargo.toml` der eigenen Crate); dessen Szenario-Zeilen gehören
  dem Geschwister und passen nicht zum neuen Brief. Fehlt dem Folgepaket ein Szenario, fragt der Worker zurück.
- Rückfrage wegen fehlender Datei: Zeile mit Grund an `.pfade` anhängen, ENTSCHEIDUNGEN + Journal ergänzen, `subagent_supervisor reply` im selben Turn.
- Der Endlauf `wpq check` ruft das E2E-Skript mit `--filter <E2E-ID>` und findet das Szenario NUR über den Dateinamen: Die Datei muss `E2E-<ID>.toml`
  heißen (nicht nach dem Paket benannt), sonst bricht der Check mit Exit 2 ab. Die E2E-ID steht im Brief-Abschnitt „E2E-Szenarien“; die Pfadliste
  desselben Briefs nennt dagegen einen paketbenannten Dateinamen (`LC-WP-…toml`) – der ist für den Filter falsch, die ID aus dem Abschnitt gewinnt
  (sie stammt oft aus einem anderen Nummernkreis als das Paket). Den Dateinamen `E2E-<ID>.toml` in `.pfade` UND wörtlich in den Worker-Start-Task schreiben.
- Ändert das Paket ein Handbuch-Fragment (`docs/manual/claw/**/<WP>.json`), scheitern die UI-Tests `generator-drift`/`handbuch`, bis `handbuch.html`
  per `node tools/manual-gen.mjs` neu erzeugt ist: `docs/manual/handbuch.html` von Anfang an freigeben (nur Generator-Ausgabe, eigener Commit).
- Eine `.pfade`-Freigabe VOR dem `integ`-Start in eigenem Tool-Block anlegen; im selben Block gestartet verliert `integ` den Wettlauf (MANGEL Pfad).
Grund: Die Pfadliste ist die einzige Quelle der Abnahme; jede Lücke kostet eine Rückfrage-Runde samt Wartezeit des Workers.

## Worker läuft ins Zeitlimit (90 min) mit unfertigem Paket
Typisch: Rust und E2E committet, UI/Handbuch uncommittet, Bericht und Status-YAML fehlen (`abnahme` nennt 4 Mängel).
- `git status`, `git log <Basis>..HEAD`, `wpq.py abnahme` lesen; kurzen Abschluss-Brief nach `nacharbeit/<WP>.md` schreiben (was committet ist, was laut `abnahme` fehlt, früh committen) und einen frischen Worker auf demselben Worktree starten; Status währenddessen „läuft <runId> <modell> (Abschluss-Worker)“.
- In JEDEN Start-Task für große Pakete: „nach 60 min zuerst committen, was da ist; Bericht und Status-YAML vorrangig“. Grund: Das Zeitlimit tötet den Worker ohne Vorwarnung, uncommittete Arbeit ist dann nur durch einen weiteren Lauf zu retten.
- Reviewer bleibt ein anderes Modell als der Abschluss-Worker (Worker opus → Reviewer sonnet).

## Merge-Konflikte bei der Integration (Exit 4) in gemeinsam genutzten Dateien
Pakete derselben Gruppe erweitern dieselbe Crate-`Cargo.toml` (neue Abhängigkeiten) und lassen `handbuch.html` neu erzeugen; der erste Einbau
nach einem Geschwisterpaket konfligiert deshalb fast sicher. Lösung im Paket-Worktree (nicht im Integrationsbaum), dann `git add` +
`git commit --no-edit` und `integ` erneut:
- `Cargo.toml`: BEIDE Seiten behalten (Abhängigkeiten und Kommentarzeilen je Paket), doppelte Schlüssel wie `axum.workspace = true` nur einmal.
- `Cargo.lock`: kein Konfliktmarker nötig, wenn nur ein Abhängigkeitsblock abweicht; im Block der eigenen Crate die neuen Namen alphabetisch
  ergänzen (`"hmac"`, `"sha2"`); Abgleich gegen die Paket-Seite per `git show <paket-commit>:<pfad>/Cargo.lock`. Die endgültige Prüfung macht der
  Endlauf von `integ`, denn ein lokales `cargo metadata --locked --offline` kann am fehlenden Netz scheitern.
- `handbuch.html`: Konfliktfassung verwerfen (`git checkout --ours`), `node tools/manual-gen.mjs` und `--check`, dann erst `git add`.
Grund: Von Hand gemischte Hunks in erzeugten Dateien driften; Lockfile-Zeilen sind dagegen reine Listen und sicher von Hand zu ergänzen.
