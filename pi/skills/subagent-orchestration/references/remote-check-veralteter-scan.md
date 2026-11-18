# Prüflauf auf geteiltem Remote-Slot: neue Gruppenordner unsichtbar, Warteschleife für „läuft noch“

## Symptom
Der Endlauf (`wpq.py check`) ist rot in `export-ts`/`ui`: eine generierte Index-Datei (z. B. `ui/src/generated/.../index.ts`)
enthält die Exporte der NEUEN Gruppe des Pakets nicht, obwohl Code und Tests im Worktree stimmen. Andere Pakete derselben Welle sind grün.

## Ursache und Abhilfe
Der Modul-Scan (build.rs/`rerun-if-changed` auf einen Ordner) vergleicht Änderungszeiten. rsync auf den geteilten Build-Slot behält
alte mtimes, und der Slot wurde nach dem Anlegen des Ordners schon von einem anderen Paket gebaut: Cargo hält den Scan für aktuell,
der neue Ordner bleibt unsichtbar. Abhilfe ohne Git-Änderung, im Paket-Worktree:
1. `git checkout -- ui/src/generated` (falls ein roter Lauf Dateien zurückgeholt hat),
2. für jeden Gruppenordner des Pakets (je Crate/Schicht, i. d. R. 5–6 Pfade): `find <ordner> -type f -exec touch {} +; touch <ordner>`,
3. `wpq.py check <WP> --bg` neu starten. Beleg, dass es die Ursache war: `export-ts` wird grün.
Den Hinweis („neue Gruppenordner mit `touch` anfassen, Check wiederholen“) gleich in den Start-Task jedes Workers schreiben, der eine neue Gruppe anlegt.

## Warteschleife
`wpq.py wait check <WP>` kehrt bei laufendem Check mit „läuft noch“ und Exit 0 zurück. Darum nie `wait … && integ` ketten,
sondern in einer Schleife auf „grün“ prüfen (Ausgang „läuft noch“/„läuft bereits“ → weiter, sonst Abbruch), z. B. als bg_run mit ≥ 3 h Timeout:
`for i in $(seq 1 20); do o=$(wpq.py wait check <WP> 2>&1 | tail -2); case "$o" in *"läuft noch"*|*"läuft bereits"*) continue;; esac; break; done; case "$o" in *grün*) wpq.py integ <WP>;; esac`.
Grund: Der Schritt `ui` wartet oft lange auf einen Remote-Slot fremder Spuren; eine einmalige Abfrage meldet nur den Zwischenstand.
