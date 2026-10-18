#!/bin/sh
# Wache für einen acp_delegate-Worker. Als bg_run starten (surviveReload), damit ihr Ende die Sitzung weckt:
# acp_delegate-Meldungen wecken eine ruhende Sitzung nicht.
# Endet, sobald der Worker-Prozess weg ist (fertig oder vom Watchdog beendet) oder seine
# .activity-Datei <still> Minuten unverändert ist.
# Wartet der Worker auf einen eigenen langen Befehl (bash-Kind des Worker-pi, z. B. Workspace-clippy auf der
# Build-Maschine), gilt er erst nach <hard> Minuten ohne Aktivität als still. LSP-Kinder zählen nicht.
# Aufruf: sh worker-wache.sh <runId> [<pid>|auto] [<still-min>=15] [<hard-min>=75]
run=$1; pid=${2:-auto}; still=${3:-15}; hard=${4:-75}
d=/tmp/acp-delegate
act=$d/$run.activity
out=$d/$run.out
[ -n "$run" ] || { echo "Aufruf: worker-wache.sh <runId> [<pid>|auto] [<still-min>] [<hard-min>]"; exit 2; }

# pid suchen: pi-Prozess mit PI_ACP_DELEGATE_DEPTH=1, dessen Start der Geburt der .activity-Datei am nächsten liegt
if [ "$pid" = auto ]; then
  i=0
  while [ ! -f "$act" ] && [ $i -lt 30 ]; do sleep 2; i=$((i+1)); done
  born=$(stat -c %W "$act" 2>/dev/null || echo 0)
  now=$(date +%s); best=""; bestd=999999
  for p in $(pgrep -x pi); do
    tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^PI_ACP_DELEGATE_DEPTH=1$' || continue
    st=$((now - $(ps -o etimes= -p "$p" | tr -d ' ')))
    dd=$((born - st)); [ $dd -lt 0 ] && dd=$((-dd))
    if [ $dd -lt $bestd ]; then bestd=$dd; best=$p; fi
  done
  pid=$best
  [ -n "$pid" ] && [ "$bestd" -le 120 ] || { echo "KEIN-PID: kein passender Worker-Prozess für $run (Abstand $bestd s)"; exit 3; }
fi
echo "Wache $run: pid $pid, still=$still min (mit bash-Kind $hard min), Start $(date +%H:%M:%S)"

while kill -0 "$pid" 2>/dev/null; do
  if [ -f "$act" ]; then
    age=$(( $(date +%s) - $(stat -c %Y "$act") ))
    if [ "$age" -ge $((still * 60)) ]; then
      if [ "$age" -lt $((hard * 60)) ] && pgrep -P "$pid" -x bash >/dev/null 2>&1; then
        : # wartet auf einen eigenen Befehl → noch nicht still
      else
        echo "STILL: $run seit $((age / 60)) min ohne Aktivität (pid $pid lebt noch)"
        pgrep -P "$pid" -a 2>/dev/null | cut -c1-200 | sed 's/^/  Kind: /'
        break
      fi
    fi
  fi
  sleep 30
done
kill -0 "$pid" 2>/dev/null || echo "ENDE: Worker $run (pid $pid) beendet um $(date +%H:%M:%S)"
echo "--- letzte Ausgabe (.out):"
tail -c 500 "$out" 2>/dev/null
echo
