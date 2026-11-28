# Baukette steht: Endläufe warten stundenlang auf einen Slot

Symptom (27./28.11.2026, Lumi Claw): Worker melden `tool bash open for 240s` oder „no activity“,
Endlauf-Logs enthalten nur `RB_WAIT Slot a seit 370 min belegt`, Herzschlag läuft aus, ohne dass ein
Paket fertig wird. Sechs Stunden Stillstand über beide Spuren.

## Ursache klären – drei Kandidaten, der billigste zuerst
1. **Rechner hat geschlafen** (war hier der Fall: suspend 19:04–01:03). `journalctl --user -u systemdsuspend.service`
   bzw. `journalctl -b | grep -i -E "suspend|resume"` oder `last -x`. Lokale Prozesse (rb.sh-Warteschleifen,
   ssh, Worker) stehen dann mitlaufender Uhr; die Meldung des alten Herzschlags kommt erst nach dem
   Aufwachen an und weckt die Sitzung nicht zuverlässig. Danach läuft meist alles von selbst weiter –
   nichts beenden, nur Register prüfen (Worker am Zeitlimit? Worktree-Stand sichern).
2. **Zwei Slots mit großem Crate-Testbau** (`-p lumi-desktop` UND `-p lumi-cli` bauen `lumi_desktop_lib`
   mit): Slot am Speicherdeckel (`systemctl --user show lumi-claw-<slot>-run.scope -p MemoryCurrent -p MemoryMax`),
   Host ohne freien Speicher (`grep -E "MemAvailable|SwapFree" /proc/meminfo`), `rustc` mit wenigen CPU-Sekunden
   bei hohem Alter (`ps -eo pid,etimes,time,rss,args | grep -E "rustc|ld "` – Spalte `time` gegen `etimes` halten).
3. **Fremder Aufrufer außerhalb der Slots**: `readlink /proc/<pid>/cwd` des lokalen `remote.sh`-Prozesses
   nennt Worktree (also Spur und Paket); ppid ist der gemeinsame pi-subagents-Runner und sagt nichts.

Lesen: lokal `ps -eo pid,etimes,args --forest | grep -A6 'rb.sh'` (wer hält, wer wartet),
`grep -E 'RB_WAIT|RB_START|RB_EXIT' $C/logs/wpq-lc-wp-<paket>-nextest.log | tail -3`,
Log des haltenden Laufs `$C/logs/<name>.log` (neue `Compiling`-Zeilen?).

## Sonderfall Schritt `windows` rot ohne Codefehler
`STEP windows EXIT=101`, Log `$C/logs/wpq-lc-wp-<paket>-windows.log` (das aktuelle ist `.log`, NICHT
`.log.prev` – `ls | tail -1` liefert das alte): `error: couldn't read ".../crates/lumi-channels/src/zugang/<modul>/mod.rs"`
mit Pfeil auf `target-win/…/debug/build/lumi-channels-<hash>/out/zugang_mods.rs`. Ursache: der
Modul-Scan (`tools/claw-modscan.rs`, per `build.rs` → `include!` in `src/zugang/mod.rs`) schreibt die
Modulliste in `OUT_DIR`; das Windows-Zielverzeichnis `~/lumi-claw-<slot>/target-win` bleibt zwischen
Läufen erhalten, `rsync -a` bewahrt die Quell-mtime des Verzeichnisses – cargo hält das Skript für
aktuell, obwohl im neuen Stand ein Modul fehlt (Rest eines anderen Pakets, z. B. KANAL). Kein Fehler des
Pakets. Dauerhafte Abhilfe im Build-Wrapper: siehe `remote-check-veralteter-scan.md`. Von Hand nur noch,
wenn der Wrapper den Fall nicht abdeckt: `ssh <bauhost> 'rm -rf ~/lumi-claw-<slot>/target-win/x86_64-pc-windows-gnu/debug/build/lumi-channels-*'`
(nur wenn dort kein Windows-Lauf läuft: `pgrep -af check-windows`), Worker per `steer` sagen, dass er
nicht am Code probiert, sondern den Endlauf komplett neu startet und den Fehllauf im Bericht nennt.

## Handeln
- Läuft es wieder (neue `Compiling`-Zeilen, MemAvailable gestiegen, CPU-Sparte wächst): nichts beenden,
  nur Journal + ggf. Hinweis „offen für L0“.
- Eigener Lauf hält den Slot und steht: `bash $C/rb.sh kill <name>` (beendet Prozessgruppe und den
  Remote-Scope), Worker per `steer` sagen, warum, und den Einzeltest nicht sofort wiederholen lassen.
- Fremder Lauf hält den Slot: nicht beenden; der Leitstand entscheidet. Serialisierung vorschlagen:
  Läufe mit großem Crate-Bau nur in einem Slot gleichzeitig.
- Vorbeugen: Worker-Einzelschritte mit `-p lumi-cli`/`-p lumi-desktop` sind Volldbauten; im Brief
  Einzeltests nur über den Endlauf oder nur für kleine Crates verlangen; nicht drei Endläufe
  gleichzeitig in die Slot-Schlange stellen (dritter erst nach dem ersten grünen).

## Einbau oder Endlauf ist still gestorben
Zelle „integrieren“ oder Journal „Einbau läuft“, aber die pid aus der pid-Datei ist weg und das Log endet
kurz nach dem Start, ohne `RB_EXIT`. Häufigste Ursache: Der Lauf wurde aus einem Vordergrund-Aufruf der
Sitzung gestartet; wird dieser Aufruf abgebrochen (Zeitlimit, Schutzregel), stirbt die ganze Prozessgruppe
mit. Vorher ausschließen, dass die Speicher-Wache eingegriffen hat (ihr Log). Dann abgekoppelt neu starten
(`setsid nohup … &`), die pid festhalten und nach etwa zehn Minuten mit `ps -p <pid>` prüfen. Als
Leitstand bei jeder Runde die pid jedes „laufenden“ Einbaus prüfen, weil die Spur den Tod nicht bemerkt:
Ihr Warte-Wecker wartet auf ein Log, das nie fertig wird.

## Build-Rechner ist wieder erreichbar: Last zwischen den Rechnern aufteilen
1. Belegen, wo die Bauten gerade laufen, bevor etwas umgestellt wird: Besitzer-Dateien der Slots lesen und
   auf beiden Rechnern `uptime; free -m; pgrep -af 'cargo|rustc' | head`. Ein Wrapper mit
   Erreichbarkeitsprobe schaltet für jeden NEUEN Aufruf von selbst zurück; schon laufende Läufe enden
   auf dem alten Rechner und werden nicht abgebrochen.
2. Beide Rechner vorher und nachher messen (Last, verfügbarer Speicher, Swap) und die Restlast auf dem
   Sitzungs-Rechner nach Programmnamen summieren
   (`ps -eo rss,comm --no-headers | awk '{a[$2]+=$1} END{for(k in a) printf "%.1fG %s\n",a[k]/1048576,k}' | sort -rn | head`).
   Grund: Der Nutzer will sehen, dass der Rechner leerer ist und woher der Rest kommt (Sitzungen, Browser,
   Datei-Index), nicht nur „umgestellt“ lesen.
3. Die Speicherdeckel an den KLEINEREN Rechner anpassen: Anzahl paralleler Läufe mal Deckel muss in seinen
   Arbeitsspeicher passen. Lieber kleinerer Deckel mit mehr Jobs und dem Neuversuch des Wrappers nach
   einem Speicher-Abbruch als wieder eine serielle Kette. Den Spuren die neuen Werte nennen, die serielle
   Kette für neue Starts aufheben, laufende Läufe zu Ende laufen lassen; Quittung als Journalzeile.
4. Den Schutz des Sitzungs-Rechners im Wrapper erzwingen, nicht über Disziplin der Spuren: Ist der gewählte
   Rechner der Ausweich-Rechner, hält der Lauf eine gemeinsame Sperre (`exec <fd>>"<locks>/lokal-seriell.lock";
   flock <fd>`), dann läuft dort nur ein Bau zugleich. Die Sperre mit zwei Unter-Shells einzeln testen,
   den Wrapper atomar ersetzen und den Rechner in die Startzeile des Logs schreiben. Grund: Die Spuren
   haben gerade die Regel „parallel erlaubt“ bekommen und bemerken einen erneuten Ausfall nicht; ohne
   Sperre liefen dann zwei Bauten neben Sitzungen und Workern.
5. Bau-Zwischenstände des Ausweich-Rechners und gemeinsam genutzte Ordner im Zwischenspeicher nicht
   löschen. Größe und Preis des Löschens nennen (einmal von vorn bauen) und den Nutzer entscheiden lassen.
6. Nutzer-Liste (Hinweis „Rechner einschalten“ als erledigt), Übersicht, Stand und Entscheidung nachziehen.
   Im Bericht trennen, was getestet ist (die Sperre allein) und was erst der echte Ausweichfall zeigt.
7. In der nächsten Runde belegen, dass zwei parallele Läufe auf dem Build-Rechner ohne Speicher-Abbruch
   durchlaufen; sonst Deckel oder Job-Zahl nachstellen.

## Herzschlag-Falle
Der Herzschlag (`warte.sh <spur> --max 1500`) lief mit `WARTE-ENDE herzschlag 1500s` aus, ohne die
Sitzung zu wecken; erst der Watchdog des Leitstands (369 min) holte sie zurück, und die Abschlussmeldung
des alten Herzschlags kam Stunden später als normale Benachrichtigung nach. Darum bei JEDEM Wecken
`pgrep -af warte.sh` gegen die Queue halten und beim Kontrollgang die `RB_WAIT`-Zeilen lesen – ein
laufender Herzschlag beweist keinen Fortschritt. Eine Benachrichtigung über einen alten, bereits
ersetzten Herzschlag oder einen selbst beendeten Task braucht keine Aktion.

## Register-Status lesen, ohne den Kontext zu fluten
`/tmp/pi-subagents-uid-1001/async-subagent-runs/<runId>/status.json` enthält `recentTools`/`recentOutput`
(zusammen ~45 KB). Nie mit `cat` ausgeben; Felder wählen:
`python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["status"],d["turnCount"],d["lastActivityAt"])' <datei>`.
