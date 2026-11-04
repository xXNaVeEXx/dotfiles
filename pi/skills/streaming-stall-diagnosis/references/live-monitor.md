# Live-Monitor für Stall-Ereignisse (Rezept)

Monitor VOR dem Start der Wiedergabe als Hintergrundlauf starten (bg_run, isAgent:false, ~15 min), damit der Stall vollständig im Log landet. Nutzer anweisen: Beim Stall sofort melden und **15–20 s mit dem Reload warten**, damit das Totfenster sauber aufgezeichnet wird.

## Monitor-Script (bg_run)

```bash
LOG=/tmp/streamwatch-main.log; SSLOG=/tmp/streamwatch-ss.log; IPLOG=/tmp/streamwatch-ips.log
: > $LOG; : > $SSLOG; : > $IPLOG
prx=$(cat /sys/class/net/wlan0/statistics/rx_bytes); ptx=$(cat /sys/class/net/wlan0/statistics/tx_bytes)
for i in $(seq 1 900); do
  sleep 1
  rx=$(cat /sys/class/net/wlan0/statistics/rx_bytes); tx=$(cat /sys/class/net/wlan0/statistics/tx_bytes)
  echo "$(date +%H:%M:%S) rx=$(( (rx-prx)/1024 ))KB/s tx=$(( (tx-ptx)/1024 ))KB/s $(cut -d' ' -f1-3 /proc/loadavg)" >> $LOG
  prx=$rx; ptx=$tx
  ss -tnp 2>/dev/null | grep ESTAB | awk '{print $5}' | sed 's/:[0-9]*$//' >> $IPLOG.tmp
  if (( i % 5 == 0 )); then
    { echo "===== $(date +%H:%M:%S) ====="; ss -tnpi 2>/dev/null | grep -A1 ESTAB | grep -vE '^--$'; } >> $SSLOG
    sort -u $IPLOG.tmp >> $IPLOG; : > $IPLOG.tmp
  fi
done
```

## Auswertung

- **Log-Zeilenformat**: `HH:MM:SS rx=NKB/s tx=NKB/s load1 load5 load15` → Felder: rx = `$2`, tx = `$3`, Load = `$4`. Achtung Feld-Falle: tx ist NICHT `$4` — falsche awk-Spalte liefert Load-Werte als „TX-Dips".
- **Stall finden**: rx bricht von konstantem Niveau (z. B. ~330 KB/s + Segment-Bursts alle ~6 s) schlagartig auf <60 KB/s ein und erholt sich nicht → das ist die Sekunde, in der der Hoster die Auslieferung stoppte.
- **TX-Dips prüfen**: `awk '{tx=$3; gsub(/tx=/,"",tx); if (tx+0 < 50) print $1, tx}' $LOG` — nie geleerte Zeilen = Upload lief durchgehend (Netzwerk unschuldig).
- **Beweis aufs Socket**: `ss -tnpi dst <hoster-ip>` kurz nach dem Stall: `bytes_received` hoch (MB-Bereich = Flow lief), `lastrcv` in zig Sekunden (Server schickt nichts mehr), `cwnd:10`, `app_limited`, Verbindung noch `ESTAB` ohne Reset = serverseitiger Stopp.
- **Bildschirm-Freeze nebenbei**: TX sinkt auch, wenn das geteilte Bild statisch wird (wenig Bewegung = wenig Bitrate) — statisches Bild ist KEIN Netzwerkproblem; echte Encode-Stalls wären TX ≈ 0 über 1–3 s.
- **HLS-Segment-Muster**: periodische Bursts (alle ~5–10 s ein MB-Burst über Grundlast) = gesundes segmentiertes Nachladen; konstante Grundlast zusätzlich = Screenshare/Voice.
