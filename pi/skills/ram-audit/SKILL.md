---
name: ram-audit
description: "RAM-/Swap-Audit und Prozess-Aufräumen auf dem Linux-Desktop des Nutzers: Top-Verbraucher aggregiert identifizieren, killbare Prozesse sicher klassifizieren (Pi-Sessions/Proxys, Docker, Desktop), Swap-Altlasten behandeln. Use when the user asks what consumes the most RAM/memory, wants to free memory, asks which processes/programs to close or stop, mentions swap usage, or available RAM collapses while own build/test workers run in parallel (pause with SIGSTOP instead of kill, auto-resume, emergency brake, lock thresholds)."
---

# ram-audit

# RAM-Audit auf dem Linux-Desktop (dieser Nutzer)

Klasse: Analyse von RAM-/Swap-Verbrauch und sichere Empfehlung, was beendet werden kann.

## Procedure (in dieser Reihenfolge)

1. **Überblick:** `free -h` (verfügbar zählt, nicht frei) + `ps aux --sort=-%mem | head -25`.
2. **Aggregieren** (viele kleine Kindprozesse einzeln sind Rauschen):
   ```
   ps -eo rss,comm --no-headers | awk '{sum[$2]+=$1; n[$2]++} END {for (c in sum) printf "%8.0f MB %3d procs %s\n", sum[c]/1024, n[c], c}' | sort -rn | head -20
   ```
3. **Swap-Verbraucher pro Prozess** (RSS allein lügt bei Swap-Last):
   ```
   for f in /proc/[0-9]*/status; do pid=${f#/proc/}; pid=${pid%/status}; s=$(grep -m1 ^VmSwap: $f | awk '{print $2}'); [ "${s:-0}" -gt 51200 ] && echo "$((s/1024)) MB PID $pid $(grep -m1 ^Name: $f | awk '{print $2}')"; done | sort -rn
   ```
4. **Prozessbäume & Ports klären**, bevor irgendetwas als "überflüssig" gilt: `ps -o pid=,ppid=,etime=,rss= -p <pids>` und `ss -tlnp | grep <port>`. Kinder (Proxys, Webhelper) gehören zu einer Session — nie einzeln als Waisen deklarieren, solange der Parent lebt. Auch ein Proxy mit totem Parent (umgehängt an systemd) kann noch eine lebende Session bedienen: vorher `ss -tnp | grep :<port>` prüfen, welcher Prozess eine Verbindung hält.
5. **Empfehlung als Tabelle** mit RAM+Swap-Summe, Risiko und Restart-Kommando. Immer anbieten, es direkt auszuführen (Nutzer will proaktive Execution).

## Nach einem Absturz

- Wer wurde beendet und warum: `journalctl -b --since -2h | grep -iE 'oomd|oom killer|out of memory'` (bei Bedarf
  `--user`). systemd-oomd beendet bei hoher Swap-Belegung die ganze cgroup mit dem meisten Swap, z. B. einen
  tmux-Scope samt aller Kindprozesse; der Kernel-OOM-Killer beendet dagegen einzelne Prozesse.
- Danach die Verbraucher wie oben aggregieren und dem Nutzer nennen, welche Programme den Druck erzeugt haben.

## Kill-Regeln (mit Begründung)

- Desktop (plasmashell, kwin_wayland, Xwayland): nie killen — killt die Session.
- Docker: `docker stop <name>` statt kill — Daten bleiben, Restart per `docker start` trivial.
- Pi-Sessions des Nutzers: ohne ausdrücklichen Auftrag **nachfragen, welche aktiv sind** — der Nutzer arbeitet tagelang in Sessions. Bittet er selbst, nicht mehr benötigte Sitzungen zu schließen, selbst klassifizieren statt fragen:
  1. Zuordnung: `HERDR_PANE_ID` aus `/proc/<pid>/environ` je `pgrep -x pi`, dazu RSS + VmSwap; `PI_ACP_DELEGATE_DEPTH>0` = Worker einer Sitzung, gehört zu deren Pane.
  2. Je Pane `herdr agent get <pane>` (Status, Sitzungsdatei): Stunden seit letzter Änderung der Sitzungs-JSONL und letzte Assistant-Nachricht. Beendbar ist, was fertig berichtet hat und lange still ist; behalten, was auf eine Entscheidung des Nutzers wartet, einen Herzschlag/Worker hat oder von einem aktiven Watchdog-Timer betreut wird (`systemctl --user list-timers` + deren `watchdog.env` mit `PANE=`). Ein Watchdog, der fehlende Panes neu startet, würde die Sitzung sonst wiederbeleben.
  3. Vor dem Schließen Pane, cwd und Sitzungsdatei in eine Liste schreiben (Wiederaufnahme `cd <cwd> && pi --session <datei>`), dann `herdr agent prompt <pane> "/quit"`; eigene Orchestrator-Tabs danach mit `herdr tab close <tab>` schließen, Tabs des Nutzers stehen lassen.
- `/tmp` ist ein tmpfs und zählt als RAM (Spalte `shared` in `free`): alte `nix-shell.*`-Ordner (`-mmin +90`) und alte Delegate-Logs in `/tmp/acp-delegate` (`-mmin +4320`) löschen, fremde Arbeitsordner stehen lassen.
- Eigene Hintergrund-Tasks mit `bg_kill <taskId>` oder per PID aus der Task-Datei beenden, nie `pkill -f <skriptname>`: Das Muster trifft die eigene Shell, sobald der Name irgendwo in derselben Befehlszeile steht (auch als Pfad-Argument von sed/grep), und der Klammer-Trick `[x]yz` schützt nur, wenn der Klartext sonst nicht in der Zeile vorkommt. Beim Aufräumen Pi-Prozess UND seinen billion-context-Proxy zusammen killen (eigener Port 1878x; meist PPID-Kind, aber Proxys werden umgehängt oder geteilt → Zuordnung über `ss -tnp` und `BILI_PARENT_PID` in `/proc/<pid>/environ`). Apps, die pi-Pakete laden (Extension-Hosts), starten eigene Proxys — die gehören zur App, nicht zum pi des Nutzers.
- Sicher killbar: Steam, spectacle, Browser-Tabs, alte Dev-Server — alles, was on-demand neu startet.
- Swap bleibt nach Kills voller Altlasten (Kernel schreibt nicht zurück): aufräumen per Reboot oder `sudo swapoff -a && sudo swapon -a` (nur bei genug freiem RAM).

## Akuter Engpass durch laufende Builds/Tests eigener Worker

Bei wenig verfügbarem RAM (unter ~2 GB) mit hoher Swap-Belegung ist sofortiges Handeln nötig, sonst beendet
systemd-oomd ganze Sitzungsbereiche (siehe „Nach einem Absturz“).
1. Verursacher zuordnen: `ps -eo pid,rss,etimes,args --sort=-rss | head` und je PID `readlink /proc/<pid>/cwd`. Daraus
   ergeben sich Spur bzw. Worktree. Typische Spitzen sind `next build` mit Worker-Prozessen und turbo-Läufe, die mehrere
   `tsc` parallel starten.
2. Anhalten statt abbrechen: Nur die schweren Kindprozesse (`tsc`, `next`) per `kill -STOP` anhalten, nicht den
   Sperr-Wrapper darüber. Grund: Der Wrapper druckt weiter seinen Herzschlag, deshalb beendet der Leerlauf-Wächter den
   Worker nicht, und nach `kill -CONT` läuft der Prozess ohne Verlust weiter. Angehaltene Prozesse wachsen nicht mehr,
   und ihre Seiten lagert der Kernel bevorzugt aus.
3. Automatisch fortsetzen: Ein bg_run-Job wartet, bis `MemAvailable` über einer Schwelle liegt (z. B. 6 GB), höchstens
   ~20 min, und schickt dann `kill -CONT`. Für die nächste halbe Stunde zusätzlich eine Notbremse als bg_run: Fällt der
   freie RAM unter ~700 MB, wird der größte Node-Prozess mit cwd im Worktree-Ordner angehalten; ab ~4 GB läuft er weiter.
4. Ursache beheben: RAM-Schwellen im Sperr-Wrapper gelten nur beim Start eines Laufs, Spitzen verschiedener Klassen
   (schwer/E2E plus mittel) überlagern sich danach. Deshalb die Start-Schwellen über die gemessenen Spitzen heben
   (z. B. schwer/E2E ≥ 6,5 GB, mittel ≥ 4 GB) und das Skript atomar ersetzen (`.new` schreiben, `bash -n`, `mv`).

## Sessions entschlammen ohne Verlust

Langlaufende pi-Sessions blähen sich per Kontext auf. Pi-Sessions sind persistent: beenden und `pi --continue` (oder `pi --resume <id>`) — Verlauf liegt in `~/.pi/agent/sessions`, RSS fällt auf einen Bruchteil, Arbeit bleibt vollständig erhalten.
