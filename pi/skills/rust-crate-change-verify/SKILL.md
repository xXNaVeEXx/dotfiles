---
name: rust-crate-change-verify
description: Rust-Struct-Felder workspace-weit einführen und die Verifikationskette (check --all-targets, nextest, clippy) RAM-sicher bis grün fahren — Initialisierer-Inventur, Deadlock- und Exit-Maskierungs-Fallen. Use when adding fields to a shared Rust struct, when cargo/nextest runs report hidden test-compile errors, or when wiring background build commands whose exit codes must stay truthful.
---

# rust-crate-change-verify

# Rust: Struktur erweitern + Workspace verifizieren

Klasse von Aufgabe: Einem häufig konstruierten Rust-Struct Felder hinzufügen (oder sonstigen Crate-übergreifenden Cross-Cut) und die Änderung RAM-sicher bis grün verifizieren.

## Ablauf

1. **Initialisierer-Inventur VOR dem ersten Build:** `grep -rn "StructName {"` über ALLE Quellen — Produktionscode, `#[cfg(test)]`-Helper im selben Crate, Integrationstests in `tests/` UND downstream Crates/Bins (src-tauri & Co.).
2. **check compiliert keine Tests:** `cargo check` baut lib+bins, NICHT test targets. Erste Verifikation ist deshalb `check --all-targets` (betroffene Packages) oder direkt nextest — sonst bleiben E0063-Fehler in Test-Helpern bis zur Testrunde versteckt.
3. **Schwere Schritte seriell + exit sauber propagieren:** Hintergrundläufe mit Pipes (`… | tee log | tail`) dürfen NICHT mit `; echo EXIT=$?` enden — das Echo übermalt den cargo-Exit (Benachrichtigung meldet exit 0 trotz Fehler). Stattdessen am Ende `exit ${PIPESTATUS[0]}`.
4. **Erst wenn der eigene Crate grün ist:** downstream Crates mitkompilieren (eigener check-Lauf), dann clippy `-D warnings` und Vollläufe.

## Stolperfallen

- **`for x in lock(m).list.clone()` deadlocked:** die Iterables-Temporäre (MutexGuard) lebt bis zum Schleifenende — jedes innere `lock(m)` im Schleifenkörper hängt den Test für immer auf (>60 s SLOW). Snapshot zuerst binden: `let xs = lock(m).list.clone(); for x in xs {…}`.
- **`let binding = m.lock().unwrap();` in Tests:** derselbe Mechanismus am Funktionskörper — der Guard fällt erst am Test-ENDE ab; jeder spätere `lock(m)` (auch aus Produktionscode über Sinks/Events heraus) deadlockt still. Guard in einem Block scopen und nur die Daten rausgeben.
- **Hängenden Test eingrenzen ohne ptrace:** gdb/eu-stack auf fremde Prozesse scheitert an ptrace-Beschränkungen. Stattdessen `std::fs::OpenOptions … append("/tmp/<name>-trace.log")`-Zeilen an die verdächtigen Aufrufe setzen, Test mit nextest laufen lassen, letzte Trace-Zeile = Hängeort; danach Trace-Zeilen per `sed '/DBG-/d'` entfernen. Beweist den blockierenden Aufruf in einem Lauf.
- **must_use-Rückgaben in Tests:** ignorierter Rückgabewert (z. B. `store.record(…)`) wird mit clippy `-D warnings` zum Fehler — `let _ = …` davor.
- **Struktur-Literale in Tests:** keine `..serde_json::from_value`-Tricks, vollständige Literale wie im Bestand; Helper-Funktion je Datei erweitern.
- **Engine-/Modus-Felder beim Speichern:** ein save mit GEÄNDERTEM Feld (z. B. Engine) kann Seiteneffekte auslösen (Prozess-Spawn, Handoff-Bau) und Tests hängen lassen — gewünschten Wert direkt bei der Konstruktion setzen.
- **Verspätete Hintergrund-Benachrichtigungen:** mehrere Läufe derselben Kette überlappen; Benachrichtigungen kommen ungeordnet — Zuordnung über Task-ID, nicht über Reihenfolge; veraltete Meldungen nicht erneut abarbeiten.
