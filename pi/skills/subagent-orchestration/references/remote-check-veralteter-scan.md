# Prüflauf der Paket-Queue: veralteter Remote-Scan, Warteschleife, fremde Regression durch diff-abgeleiteten Umfang

## Symptom
Der Endlauf (`wpq.py check`) ist rot in `export-ts`/`ui`: Eine generierte Index-Datei (z. B. `ui/src/generated/.../index.ts`)
enthält die Exporte der NEUEN Gruppe des Pakets nicht, obwohl Code und Tests im Worktree stimmen. Typisch direkt nach einem
Merge des Integrationszweigs ins Paket. Andere Pakete derselben Welle sind grün.
Gleiche Ursache, andere Formen:
- Ein Test, der eingebettete Datentabellen zählt (z. B. „alle Übersetzungstabellen geladen“), ist rot, weil neu hinzugefügte
  Tabellendateien im Build-Spiegel nicht eingebettet wurden.
- Die Übersetzung selbst scheitert in einer Sammeldatei, die der Worker nicht geändert hat: „cannot find `<modul>` in `<gruppe>`“
  (ein neues Modul fehlt in der erzeugten Modulliste) oder „couldn't read …/<modul>/mod.rs“ (ein entferntes oder umbenanntes Modul
  steht noch darin). Typisch ist es bei mehreren Paketen gleichzeitig rot und nur in einem Schritt (z. B. nur Check oder nur das
  Fremd-Ziel), während die anderen Schritte desselben Laufs grün sind.

## Ursache
Ein Build-Skript (build.rs mit `rerun-if-changed` auf einen Ordner) vergleicht Änderungszeiten. rsync -a auf den geteilten Build-Slot behält
alte mtimes, und der Slot wurde nach dem Anlegen der Dateien schon von einem anderen Paket gebaut: Cargo hält das Skript für aktuell,
der neue Ordner bzw. die neue Datei bleibt unsichtbar. Das betrifft jeden Ordner, den ein build.rs beobachtet, nicht nur `src/`.

## Dauerhafte Abhilfe im Build-Wrapper (einmal einbauen statt je Paket von Hand)
Im Remote-Build-Wrapper nach der Slot-Belegung und vor dem rsync eine Frische-Prüfung ausführen: je Paket, dessen `build.rs` einen Ordner
beobachtet (Modul-Scan, `rerun-if-changed=src`, eingebettete Datenordner wie Übersetzungstabellen),
`find <ordner> -printf '%y %P\n' | sort | md5sum` über ALLE beobachteten Ordner bilden und mit einer pro Host+Slot+Paket gespeicherten Summe
vergleichen (z. B. `locks/scan-<host-slot>-<paket>.sum`). Weicht sie ab, `touch build.rs` und eine Log-Zeile (`RB_SCAN <paket>: …`) schreiben.
Grund: Die Dateiliste ändert sich genau dann, wenn eine Datei oder ein Ordner dazukommt oder wegfällt, unabhängig von mtimes, und `build.rs`
im Spiegel neuer als der letzte Build erzwingt den Neulauf. Drei Dinge gehören dazu, sonst bleibt die Prüfung lückenhaft:
1. Alle Mitglieder des Workspace mit Build-Skript erfassen, auch die außerhalb des Crate-Ordners (z. B. die App-Hülle):
   `grep -n members Cargo.toml` lesen und alle `rerun-if-changed`-Ziele durchsehen (`grep -n rerun-if <mitglied>/build.rs`).
   Grund: Eine Schleife nur über `crates/*/build.rs` lässt genau das Paket aus, das die Befehls-Sammeldateien aller Gruppen trägt.
   Ein vergessener Datenordner zeigt sich erst Tage später als roter Zähl-Test.
2. Den Paketnamen aus `[package] name` der `Cargo.toml` nehmen, nicht aus dem Ordnernamen. Grund: Die Bau-Ordner im Spiegel heißen
   nach dem Paket (`<paket>-<hash>`), und bei der App-Hülle weichen Ordner und Paketname ab.
3. Bei geänderter Liste zusätzlich die Ausgabe-Ordner des Build-Skripts für dieses Paket im Slot-Spiegel löschen, und zwar in ALLEN
   Zielordnern (`target*/*/build/<paket>-[0-9a-f]*` und `target*/*/*/build/<paket>-[0-9a-f]*`), und die Summe erst nach erfolgreichem
   Löschen merken. Grund: Jede Bauart (Check, Test, Lint, Fremd-Ziel) hat ihren eigenen Ausgabe-Ordner. Das `touch` wirkt nur im
   ersten Lauf nach dem Wechsel, weil der nächste Abgleich die alte Änderungszeit zurückschreibt; die Summe ist dann schon gemerkt,
   und die übrigen Bauarten behalten die veraltete Liste. Den Löschbefehl über `sh -c '…'` schicken, wenn die Anmelde-Shell des
   Rechners keine bash ist (Muster ohne Treffer brechen dort den ganzen Befehl ab), und `2>/dev/null; true` anhängen.
   Vorher mit `ls` auf dem Rechner zählen, wie viele Ordner je Paket dort liegen.
Für Nicht-Cargo-Läufe überspringen und per Umgebungsvariable abschaltbar machen. Prüfen per Handtest mit eigenem Lock-Ordner: erster Lauf fasst
alle betroffenen Pakete an, zweiter keinen, neuer und entfernter Ordner bzw. neue Datei werden je erkannt. Die Namensfindung einmal über alle
Mitglieder laufen lassen (kein leerer Name, Abweichungen nur dort, wo erwartet). Den Wrapper nur atomar ersetzen
(Sicherung, Kopie bearbeiten, `bash -n`, `mv`), weil laufende Builds das Skript sonst halb geändert weiterlesen. Danach beide Spuren informieren,
dass sie mtimes nicht mehr von Hand erneuern und ein Wiederauftreten mit den `RB_SCAN`-Zeilen melden. Die Änderung gilt erst als belegt, wenn
ein echter Lauf die Log-Zeile für das Paket zeigt und der vorher rote Schritt grün ist; bis dahin im Bericht „Korrektur eingebaut, Beleg steht aus“.
Meldet eine Spur „Endlauf rot nur durch veralteten Scan, build.rs angefasst“, ist das eine Lücke im Wrapper und kein Einzelfall: die Fehlermeldung
dem Paket zuordnen, dessen Build-Skript die genannte Datei erzeugt, und dort nachsehen, ob die Prüfung es erfasst.

## Notbehelf von Hand (nur, solange der Wrapper die Prüfung nicht hat)
Im Paket-Worktree, ohne Git-Änderung:
1. `git checkout -- ui/src/generated` (falls ein roter Lauf Dateien zurückgeholt hat),
2. für jeden neuen Ordner des Pakets (je Crate/Schicht, i. d. R. 5–6 Pfade, auch neue Datenordner/-dateien): `find <ordner> -type f -exec touch {} +; touch <ordner>`,
   bei eingebetteten Daten zusätzlich das `build.rs` des einbettenden Crates anfassen,
3. `wpq.py check <WP> --bg` neu starten. Beleg, dass es die Ursache war: der vorher rote Schritt wird grün.

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
Laufen dabei mehrere Endläufe verschiedener Pakete gleichzeitig auf dem Ersatz-Rechner, beendet dessen Kernel einen davon, auch wenn jeder
für sich unter seinem Deckel bliebe: die Endläufe als serielle Kette fahren (einer nach dem anderen) und die Jobzahl begrenzen.
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
