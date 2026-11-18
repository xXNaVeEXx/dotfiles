# Prüflauf der Paket-Queue: veralteter Remote-Scan, Warteschleife, fremde Regression durch diff-abgeleiteten Umfang

## Symptom
Der Endlauf (`wpq.py check`) ist rot in `export-ts`/`ui`: Eine generierte Index-Datei (z. B. `ui/src/generated/.../index.ts`)
enthält die Exporte der NEUEN Gruppe des Pakets nicht, obwohl Code und Tests im Worktree stimmen. Typisch direkt nach einem
Merge des Integrationszweigs ins Paket. Andere Pakete derselben Welle sind grün.

## Ursache
Der Modul-Scan (build.rs mit `rerun-if-changed` auf einen Ordner) vergleicht Änderungszeiten. rsync -a auf den geteilten Build-Slot behält
alte mtimes, und der Slot wurde nach dem Anlegen des Ordners schon von einem anderen Paket gebaut: Cargo hält den Scan für aktuell,
der neue Ordner bleibt unsichtbar.

## Dauerhafte Abhilfe im Build-Wrapper (einmal einbauen statt je Paket von Hand)
Im Remote-Build-Wrapper nach der Slot-Belegung und vor dem rsync eine Frische-Prüfung ausführen: je Crate, dessen `build.rs` den Scan enthält,
`find src -printf '%y %P\n' | sort | md5sum` bilden und mit einer pro Host+Slot+Crate gespeicherten Summe vergleichen (z. B. `locks/scan-<host-slot>-<crate>.sum`).
Weicht sie ab, `touch build.rs` und eine Log-Zeile (`RB_SCAN <crate>: …`) schreiben. Grund: Die Dateiliste ändert sich genau dann, wenn ein
Ordner dazukommt oder wegfällt, unabhängig von mtimes, und `build.rs` im Spiegel neuer als der letzte Build erzwingt den Scan.
Für Nicht-Cargo-Läufe überspringen und per Umgebungsvariable abschaltbar machen. Prüfen per Handtest mit eigenem Lock-Ordner: erster Lauf fasst
alle Scan-Crates an, zweiter keinen, neuer und entfernter Ordner werden je erkannt. Danach beide Spuren informieren, dass sie mtimes nicht mehr
von Hand erneuern und ein Wiederauftreten mit den `RB_SCAN`-Zeilen melden.

## Notbehelf von Hand (nur, solange der Wrapper die Prüfung nicht hat)
Im Paket-Worktree, ohne Git-Änderung:
1. `git checkout -- ui/src/generated` (falls ein roter Lauf Dateien zurückgeholt hat),
2. für jeden Gruppenordner des Pakets (je Crate/Schicht, i. d. R. 5–6 Pfade): `find <ordner> -type f -exec touch {} +; touch <ordner>`,
3. `wpq.py check <WP> --bg` neu starten. Beleg, dass es die Ursache war: `export-ts` wird grün.

## Warteschleife
`wpq.py wait check <WP>` kehrt bei laufendem Check mit „läuft noch“ und Exit 0 zurück. Darum nie `wait … && integ` ketten,
sondern in einer Schleife auf „grün“ prüfen (Ausgang „läuft noch“/„läuft bereits“ → weiter, sonst Abbruch), z. B. als bg_run mit ≥ 3 h Timeout:
`for i in $(seq 1 20); do o=$(wpq.py wait check <WP> 2>&1 | tail -2); case "$o" in *"läuft noch"*|*"läuft bereits"*) continue;; esac; break; done; case "$o" in *grün*) wpq.py integ <WP>;; esac`.
Grund: Der Schritt `ui` wartet oft lange auf einen Remote-Slot fremder Spuren; eine einmalige Abfrage meldet nur den Zwischenstand.

## Endlauf rot trotz „N von N Tests bestanden“
Zeigt das Nextest-Log eine grüne Summary, der Schritt endet aber mit Exit 2, ist es kein Testfehler: die letzten ~15 Zeilen des Logs lesen.
Zwei Ursachen kommen vor: (a) das Build-Wrapper-Skript wurde von einem Dritten mitten im Lauf geändert (bash liest Skripte inkrementell →
„syntax error“/„break: only meaningful“ in Wrapper-Zeilen) – `bash -n <wrapper>` prüfen, ist es wieder in Ordnung, Integration neu starten;
(b) `RB_OOM` (Speicherdeckel des Remote-Scopes, auch mit 1 Job) – neu starten mit größerem Deckel (`CLAW_MEM=9G` als Umgebung vor `wpq.py integ`).
Beides mit Logzeilen im Journal vermerken, damit der Betreiber des Wrappers es sieht; vom Worker keine Nacharbeit verlangen.

## Einzelner Oberflächentest rot nur unter Last
Scheitert genau ein fremder UI-Test an der Zeitgrenze (z. B. 5000 ms), während parallel ein schwerer Build auf demselben Rechner läuft, den
Endlauf einmal wiederholen statt Nacharbeit zu verlangen. Erst wenn derselbe Test auch ohne parallelen Schwerlauf oder in mehreren Paketen rot wird,
ihn als wackelnden Test gezielt beheben lassen (Zeitgrenze, Warten auf Ereignis statt fester Dauer).

## Roter Check, den ein früher integriertes Paket verursacht
Der Prüfumfang wird aus dem Diff des Pakets abgeleitet: Ein Paket, das ein gemeinsames Crate (z. B. die Kern-Bibliothek mit Wächter-Tests
wie „kein Netzzugriff außerhalb des Tors“) nicht anfasst, führt dessen Tests nie aus. Ein Verstoß steckt dann unbemerkt im integrierten Stand
und fällt erst beim nächsten Paket auf, das dieses Crate berührt. Vorgehen: Ersten roten Test im Nextest-Log lesen (`grep -E "FAIL|panicked"`),
Fundstelle gegen `git log`/Integrationen prüfen; liegt sie in Dateien eines schon integrierten Pakets, nicht dem aktuellen Worker anlasten.
Kleinen Fix im laufenden Worktree machen lassen: Pfad in `vorgaben/<WP>.pfade` freigeben, die Entscheidung in ENTSCHEIDUNGEN.md und
Journal vermerken und dem Worker per `steer` den exakten Ersatz nennen (Wächter-Datei der Fundament-Ebene nicht ändern; Textscans zählen
`tests.rs` unter `src/` als Produktcode, Testcode braucht dann eine andere Aufrufform). Beim Abnehmen von Paketen mit eigenem Netz-/Prozess-Code
zusätzlich einmal die Wächter-Tests des gemeinsamen Crates gezielt laufen lassen (`-p <crate> --test <wächter>`), statt auf den Diff-Umfang zu vertrauen.
