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

## Herzschlag-Falle
Der Herzschlag (`warte.sh <spur> --max 1500`) lief mit `WARTE-ENDE herzschlag 1500s` aus, ohne die
Sitzung zu wecken; erst der Watchdog des Leitstands (369 min) holte sie zurück, und die Abschlussmeldung
des alten Herzschlags kam Stunden später als normale Benachrichtigung nach. Darum bei JEDEM Wecken
`pgrep -af warte.sh` gegen die Queue halten und beim Kontrollgang die `RB_WAIT`-Zeilen lesen – ein
laufender Herzschlag beweist keinen Fortschritt. Eine Benachrichtigung über einen alten, bereits
ersetzten Herzschlag oder einen selbst beendeten Task braucht keine Aktion.
