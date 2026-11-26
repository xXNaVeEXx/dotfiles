# Integration rot: Lastflake erkennen, Testdatei ohne Hotspot freigeben

## Integ-Lauf rot — erst klassifizieren, dann handeln
1. Check-Log lesen: `grep -n "^STEP" <check-log>` (welcher Schritt EXIT≠0), dann im Schritt-Log `grep -nE "FAIL|AssertionError|Failed Tests|Test Files|Tests "`.
2. Lastflake liegt vor, wenn (a) genau EIN Test rot ist, (b) er eine Zeit misst (`rendert < 200 ms`, `waitFor`-Frist) und knapp reißt (204 gegen 200 ms), (c) alle übrigen Schritte und Tests grün sind und (d) im selben Lauf Last war (`RB_OOM`/`RB_RETRY` im nextest-Schritt, mehrere Spuren auf dem Slot). Ursache: Mess-Test läuft parallel zu schwerer Last.
3. Dann im Worktree nichts ändern (`git status --short` leer, Merge-Commit steht), Journal-Zeile mit Testname + Messwert + „sonst alles grün“, `wpq.py integ` neu starten (zweiter Endlauf). Wird derselbe Test erneut rot, ist es kein Flake mehr: systematisch klären und dem Fundament/L0 melden, nicht im Paket-Worktree „reparieren“.
4. `RB_OOM=1 … Kein Testfehler` mit `RB_RETRY` und grüner Summary ist kein Fehler des Pakets.
5. Integ rot ohne Testfehler (Exit 1/255, kein FAIL im Log) auf dem Remote-Slot = Speicherdeckel größer als freier RAM des Hosts (OOM-Kill im Scope, vom Wrapper nicht erkannt). Neu starten mit kleinerem Deckel und weniger Jobs (`CLAW_RB_HOST=<host> CLAW_MEM=7G LUMI_REMOTE_JOBS=2`), nicht mit größerem Deckel. Exit 75 = Remote-Host per ssh nicht erreichbar → ohne `CLAW_RB_HOST` auf den Standard-Slot zurückfallen.

## Check-Schritt „windows“ rot nur durch Basis-Fehler fremder Dateien
- Der Windows-Clippy-Schritt wird automatisch zugeschaltet, sobald ein Paket Zeilen mit `cfg(windows…)`/`cfg(unix)` hinzufügt; er prüft den ganzen Baum und scheitert dann an unbenutzten Imports/Variablen in Test-Dateien fremder Spuren (unter Windows kompilierte cfg-Zweige fehlen).
- Prüfen: `grep -a -A6 '^error' <windows-Schritt-Log>` bzw. `grep -a -- '-->'` listet die Fehlerdateien; liegt keine davon in den Paketpfaden und ist der Fehler auf dem Basis-Stand (feat-Branch) identisch, ist es Basis-Rot.
- Entscheiden: Das Integ-Gate verlangt ein grünes `windows`, „nur im Bericht vermerken“ ist also eine Sackgasse. Reine cfg(unix)-Gating-Fixes (kein Logikeingriff, je Datei ein Commit ≤72 Zeichen) lässt man im Paket machen (Präzedenz), nachdem die Dateien in `vorgaben/<WP>.pfade` freigegeben sind (Kommentar mit Grund). Journal + ENTSCHEIDUNGEN; Worker listet jede Fehlerdatei:Zeile + Commit im Bericht; Basis-Rot zusätzlich an L0 melden.
- Der feat-Merge im Integ-Lauf kann NEUE fremde Windows-Fehler hereinholen (Check vorher grün, Endlauf nach Merge wieder rot): gleicher Mini-Fix-Weg (Brief, .pfade-Zeile, günstiger Worker im selben wt, abnahme + check, integ neu) und L0 melden, dass der Fehler über feat kam.

## Pflicht-Test liegt in einer Crate-Datei, die kein Modul einbindet
- Symptom (Worker-Rückfrage): ein im Brief verlangter CLI-Test würde nie kompiliert, weil das Hotspot-`mod.rs` der Ziel-Crate den Ordner nicht einbindet.
- Ausweg ohne Hotspot-Eingriff: EINE neue Datei `crates/<crate>/tests/<name>.rs` (Integrationstest-Crate), die das Modul per `#[path = "../src/…/mod.rs"] mod x;` einbindet; sie läuft unter `nextest -p <crate>`. Nur freigeben, wenn das Modul nichts Crate-Internes nutzt.
- Braucht der Test Logik aus einer anderen eigenen Crate, genügt EINE Dependency-Zeile in der Cargo.toml der aufrufenden Crate (+ Cargo.lock) — vorher Zyklus prüfen (nennt die Gegen-Crate die aufrufende?).
- Beides in `vorgaben/<WP>.pfade` eintragen (Kommentar mit Grund), ENTSCHEIDUNGEN + Journal, `subagent_supervisor reply` UND `subagent steer` (der Worker zieht die Anfrage oft zurück), im Bericht als Abweichung nennen lassen.
- Die eigentliche Lücke (Hotspot bindet Ordner nicht ein, Tests laufen nie) als Pflichtpunkt ins Anschluss-Paket der Spur eintragen.
- Dasselbe gilt für Contracts-Gruppendateien (`…/kern/<gruppe>/mod.rs`): fehlt sie, scannt der Modul-Scan den Untermodul-Ordner nicht — Worker fragt nach; Zeile in `.pfade` + Antwort genügt.
