---
name: ram-audit
description: RAM-/Swap-Audit und Prozess-Aufräumen auf dem Linux-Desktop des Nutzers: Top-Verbraucher aggregiert identifizieren, killbare Prozesse sicher klassifizieren (Pi-Sessions/Proxys, Docker, Desktop), Swap-Altlasten behandeln. Use when the user asks what consumes the most RAM/memory, wants to free memory, asks which processes/programs to close or stop, or mentions swap usage.
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
- Pi-Sessions des Nutzers: **nachfragen, welche aktiv sind** — der Nutzer arbeitet tagelang in Sessions. Beim Aufräumen Pi-Prozess UND seinen billion-context-Proxy zusammen killen (eigener Port 1878x; meist PPID-Kind, aber Proxys werden umgehängt oder geteilt → Zuordnung über `ss -tnp` und `BILI_PARENT_PID` in `/proc/<pid>/environ`). Apps, die pi-Pakete laden (Extension-Hosts), starten eigene Proxys — die gehören zur App, nicht zum pi des Nutzers.
- Sicher killbar: Steam, spectacle, Browser-Tabs, alte Dev-Server — alles, was on-demand neu startet.
- Swap bleibt nach Kills voller Altlasten (Kernel schreibt nicht zurück): aufräumen per Reboot oder `sudo swapoff -a && sudo swapon -a` (nur bei genug freiem RAM).

## Sessions entschlammen ohne Verlust

Langlaufende pi-Sessions blähen sich per Kontext auf. Pi-Sessions sind persistent: beenden und `pi --continue` (oder `pi --resume <id>`) — Verlauf liegt in `~/.pi/agent/sessions`, RSS fällt auf einen Bruchteil, Arbeit bleibt vollständig erhalten.
