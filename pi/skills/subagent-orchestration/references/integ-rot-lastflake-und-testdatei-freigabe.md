# Integration rot: Lastflake erkennen, Testdatei ohne Hotspot freigeben

## Integ-Lauf rot — erst klassifizieren, dann handeln
1. Check-Log lesen: `grep -n "^STEP" <check-log>` (welcher Schritt EXIT≠0), dann im Schritt-Log `grep -nE "FAIL|AssertionError|Failed Tests|Test Files|Tests "`.
2. Lastflake liegt vor, wenn (a) genau EIN Test rot ist, (b) er eine Zeit misst (`rendert < 200 ms`, `waitFor`-Frist) und knapp reißt (204 gegen 200 ms), (c) alle übrigen Schritte und Tests grün sind und (d) im selben Lauf Last war (`RB_OOM`/`RB_RETRY` im nextest-Schritt, mehrere Spuren auf dem Slot). Ursache: Mess-Test läuft parallel zu schwerer Last.
3. Dann im Worktree nichts ändern (`git status --short` leer, Merge-Commit steht), Journal-Zeile mit Testname + Messwert + „sonst alles grün“, `wpq.py integ` neu starten (zweiter Endlauf). Wird derselbe Test erneut rot, ist es kein Flake mehr: systematisch klären und dem Fundament/L0 melden, nicht im Paket-Worktree „reparieren“.
4. `RB_OOM=1 … Kein Testfehler` mit `RB_RETRY` und grüner Summary ist kein Fehler des Pakets.

## Pflicht-Test liegt in einer Crate-Datei, die kein Modul einbindet
- Symptom (Worker-Rückfrage): ein im Brief verlangter CLI-Test würde nie kompiliert, weil das Hotspot-`mod.rs` der Ziel-Crate den Ordner nicht einbindet.
- Ausweg ohne Hotspot-Eingriff: EINE neue Datei `crates/<crate>/tests/<name>.rs` (Integrationstest-Crate), die das Modul per `#[path = "../src/…/mod.rs"] mod x;` einbindet; sie läuft unter `nextest -p <crate>`. Nur freigeben, wenn das Modul nichts Crate-Internes nutzt.
- Braucht der Test Logik aus einer anderen eigenen Crate, genügt EINE Dependency-Zeile in der Cargo.toml der aufrufenden Crate (+ Cargo.lock) — vorher Zyklus prüfen (nennt die Gegen-Crate die aufrufende?).
- Beides in `vorgaben/<WP>.pfade` eintragen (Kommentar mit Grund), ENTSCHEIDUNGEN + Journal, `subagent_supervisor reply` UND `subagent steer` (der Worker zieht die Anfrage oft zurück), im Bericht als Abweichung nennen lassen.
- Die eigentliche Lücke (Hotspot bindet Ordner nicht ein, Tests laufen nie) als Pflichtpunkt ins Anschluss-Paket der Spur eintragen.
