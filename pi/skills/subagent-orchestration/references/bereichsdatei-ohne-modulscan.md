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
