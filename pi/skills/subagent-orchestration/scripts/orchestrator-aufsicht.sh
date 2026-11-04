#!/usr/bin/env bash
# Aufsicht über einen fremden, autonom laufenden pi-Orchestrator in einem herdr-Pane (references/orchestrator-aufsicht.md).
# Start als bg_run (isAgent false, timeoutSeconds > AUF_BEAT_MIN*60), z. B.:
#   AUF_PANE=wA:p2 AUF_PROJ=~/projects/x AUF_TIMER=x-watchdog.timer bash orchestrator-aufsicht.sh
# Pollt alle AUF_POLL s und ENDET bei einem Ereignis (Auffälligkeit, Herzschlag, Planende) mit Endblock auf stdout;
# das Ende weckt die Aufsichts-Sitzung. Sie prüft, greift ggf. ein und startet die Loop neu.
# Liest nur: herdr, /proc, Sitzungs-/bg-Task-Dateien der fremden Sitzung, git-Refs, Plan, RAM/Platte, Watchdog.
# Kein `git status`: es frischt den Index auf und nimmt dafür index.lock – ein gleichzeitiger Commit des
# Orchestrators bricht dann ab. Schreibt nur AUF_LOG/AUF_STATE; beide NICHT in Pfade legen, die der Watchdog
# als Fortschritt zählt. Probe vor dem echten Lauf (muss HERZSCHLAG mit rc 0 liefern, FERTIG nur bei schon
# abgeschlossenem Orchestrator):
#   AUF_BEAT_MIN=0 AUF_POLL=1 AUF_LOG=/tmp/auf.log AUF_STATE=/tmp/auf.state timeout 60 bash orchestrator-aufsicht.sh
# Queue als Markdown-Tabelle (`| ID | … | Status |`) statt [x]-Liste: AUF_DONE_RE auf die erledigten Zeilen setzen
# (z. B. '\| fertig \|$'), AUF_PLAN_RE auf die aktiven (z. B. '\| (läuft|nacharbeit|fehler)'); Log-Zeilen in einer
# eigenen Datei (Journal) über AUF_PLANLOG_FILE.
# Not-Aus: touch "$AUF_STOP" (Standard <AUF_DIR>/STOP-AUFSICHT).
set -u
export HERDR_SOCKET_PATH=${HERDR_SOCKET_PATH:-$HOME/.config/herdr/herdr.sock}
PANE=${AUF_PANE:?AUF_PANE fehlt, z. B. AUF_PANE=wA:p2}
L=${AUF_PROJ:-$PWD}                                   # Projekt-Repo
N=${AUF_DIR:-$L/.tmp/night}                           # Steuerordner des Orchestrators
PLAN=${AUF_PLAN:-$N/PLAN.md}
PLAN_RE=${AUF_PLAN_RE:-'^- Spur [A-Z]+:'}             # Plan-Statuszeilen mit [x]/[~]/[ ] <PKG>
PLANLOG_RE=${AUF_PLANLOG_RE:-'^- [0-9]{2}:[0-9]{2} '} # Log-Zeilen im Plan
PLANLOG_FILE=${AUF_PLANLOG_FILE:-$PLAN}               # Datei mit den Log-Zeilen (z. B. eigenes JOURNAL.md)
DONE_RE=${AUF_DONE_RE:-}         # gesetzt = Queue-Tabelle: erledigte Zeilen, ID = erste Tabellenspalte
PROG_EXTRA=${AUF_PROG_EXTRA:-}   # weitere Fortschritts-Globs (Brief-/Berichtsordner), leerzeichengetrennt
WLOGS=${AUF_WLOGS:-}             # Globs der Worker-Testlogs (müssen für WORKER-STILL ≥15 min still sein)
DONE=${AUF_DONE:-$N/BERICHT.md}  # Schlussbericht; FERTIG erst mit Abschluss-Signal (WDSTOP da oder TIMER aus)
STOP=${AUF_STOP:-$N/STOP-AUFSICHT}
TIMER=${AUF_TIMER:-}             # systemd-User-Timer seines Watchdogs (leer = nicht prüfen)
WDSTOP=${AUF_WDSTOP:-$N/STOP-WD} # Stop-Marker seines Watchdogs = Abschluss-Signal
WDLOG=${AUF_WDLOG:-}
WDGIVEUP_RE=${AUF_WDGIVEUP_RE:-aufgegeben}
LOG=${AUF_LOG:-$N/aufsicht.log}
STATE=${AUF_STATE:-$N/aufsicht.state}
POLL=${AUF_POLL:-60}
BEAT_MIN=${AUF_BEAT_MIN:-90}     # Herzschlag: spätestens dann Bericht
IDLE_MIN=${AUF_IDLE_MIN:-12}     # idle/done ohne Worker und bg-Task; kürzer als die Anstoß-Schwelle des Watchdogs
STALL_MIN=${AUF_STALL_MIN:-40}   # kein Fortschrittssignal, obwohl weder Worker noch bg-Task laufen
HARD_MIN=${AUF_HARD_MIN:-75}     # kein Fortschrittssignal, egal was läuft
BLOCK_MIN=${AUF_BLOCK_MIN:-3}    # Pane meldet blocked (Dialog/Rückfrage)
NOPI_MIN=${AUF_NOPI_MIN:-8}      # kein Orchestrator-pi im Pane; länger als das Neustart-Intervall des Watchdogs
WORKER_MIN=${AUF_WORKER_MIN:-60} # Worker-Aktivität still (und Worker-Logs ≥15 min still)
MEM_MB=${AUF_MEM_MB:-2000}
DISK_GB=${AUF_DISK_GB:-8}
D=/tmp/acp-delegate              # acp_delegate-Läufe: <runId>.{session.jsonl,out,activity}
nl=$'\n'
GD=$(git -C "$L" rev-parse --absolute-git-dir 2>/dev/null)
declare -A RS                    # Cache runId → Startzeit (epoch) aus der ersten Zeile seiner Lauf-Sitzung

hm() { date +%H:%M; }
mt() { stat -c %Y "$@" 2>/dev/null | sort -n | tail -1; }
hd() { timeout 15 herdr "$@" 2>/dev/null; }

read_agent() { # Status, Sitzungsdatei/SID, bg-Task-Ordner (= cwd der fremden Sitzung)
  local j s c
  if ! j=$(hd agent get "$PANE"); then st=herdr-fehler; return; fi
  st=$(jq -r '.result.agent.agent_status // "none"' <<<"$j" 2>/dev/null)
  s=$(jq -r '.result.agent.agent_session.value // empty' <<<"$j" 2>/dev/null)
  if [ -n "$s" ] && [ "$s" != "$sfile" ]; then
    sfile=$s; sid=$(basename "$s" .jsonl); sid=${sid#*_}
    c=$(head -n 1 "$s" 2>/dev/null | jq -r '.cwd // empty' 2>/dev/null)
    tasks=${AUF_TASKS:-${c:-$L}/.pi/tasks}
  fi
}

read_pane() { # Orchestrator-pi im Pane? Worker = pi der Vordergrundgruppe mit PI_ACP_DELEGATE_DEPTH=1
  local j p
  wpids=""
  if ! j=$(hd pane process-info --pane "$PANE"); then pi='?'; return 1; fi
  pi=nein
  for p in $(jq -r '.result.process_info.foreground_processes[]? | select(.name == "pi") | .pid' <<<"$j" 2>/dev/null); do
    # Prozess wird gerade beendet: ohne mm gehören seine /proc-Dateien root, environ ist unlesbar → überspringen.
    # 2>/dev/null VOR der Eingabeumleitung, weil Bash Umleitungen von links nach rechts ausführt.
    [ -r "/proc/$p/environ" ] || continue
    if tr '\0' '\n' 2>/dev/null <"/proc/$p/environ" | grep -qx 'PI_ACP_DELEGATE_DEPTH=1'; then
      wpids="$wpids $p"
    else
      pi=ja
    fi
  done
}

read_bg() { # laufende bg_run-Tasks der fremden Sitzung (status running UND pid lebt)
  local f p names=""
  bgn=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    p=$(jq -r '.pid // 0' "$f" 2>/dev/null)
    case $p in '' | *[!0-9]* | 0) continue ;; esac
    kill -0 "$p" 2>/dev/null || continue
    bgn=$((bgn + 1))
    names="$names,$(jq -r '.name // "?"' "$f" 2>/dev/null | tr ' ' '_')"
  done < <(grep -lE '"status": *"running"' "$tasks"/"$sid"-*/*.json 2>/dev/null)
  bgnames=${names#,}
}

run_start() { # setzt rs = Startzeit des Laufs $1 (0 = unbekannt); nur Treffer werden gecacht
  local ts
  rs=${RS[$1]:-0}
  [ "$rs" -gt 0 ] && return
  ts=$(head -n 1 "$D/$1.session.jsonl" 2>/dev/null | jq -r '.timestamp // empty' 2>/dev/null)
  [ -n "$ts" ] && rs=$(date -d "$ts" +%s 2>/dev/null || echo 0)
  [ "$rs" -gt 0 ] && RS[$1]=$rs
}

read_workers() { # Worker-pid ↔ eigener Lauf (runIds aus seiner Sitzungsdatei) über die Startzeit, still je Lauf
  local p pst r a d bd best logs newest runs="" used=" " list="" silent=""
  wcount=0; own_acts=""
  # shellcheck disable=SC2086
  logs=$(mt $WLOGS); logs=${logs:-0}
  [ -n "$sfile" ] && runs=$(grep -oE 'del_[a-z0-9]+_[a-z0-9]+' "$sfile" 2>/dev/null | sort -u)
  for r in $runs; do [ -e "$D/$r.activity" ] && own_acts="$own_acts $D/$r.activity"; done
  # shellcheck disable=SC2086
  newest=$(mt $own_acts); newest=${newest:-$t}
  for p in $wpids; do
    wcount=$((wcount + 1))
    pst=$(ps -o etimes= -p "$p" 2>/dev/null | tr -dc 0-9); pst=$((t - ${pst:-0}))
    best=""; bd=301 # Lauf-Sitzung entsteht beim Worker-Start; >5 min Abstand = fremder Lauf
    for r in $runs; do
      case $used in *" $r "*) continue ;; esac
      run_start "$r"; [ "$rs" -gt 0 ] || continue
      d=$((rs - pst)); d=${d#-}
      if [ "$d" -lt "$bd" ]; then bd=$d; best=$r; fi
    done
    if [ -n "$best" ]; then
      used="$used$best "
      a=$(mt "$D/$best.activity" "$D/$best.session.jsonl"); a=${a:-$t}
      list="$list $best:$(((t - a) / 60))m"
    else
      a=$newest; list="$list pid$p:?" # nicht zuordenbar: jüngste eigene Aktivität, kein Fehlalarm
    fi
    if [ $((t - a)) -ge $((WORKER_MIN * 60)) ] && [ $((t - logs)) -ge 900 ]; then silent="$silent ${best:-pid$p}"; fi
  done
  wlist=${list# }
  wsilent=${silent# }
}

read_progress() { # jüngstes Fortschrittssignal; nur eigene Läufe, eigene LOG/STATE zählen nicht
  local f files=()
  # shellcheck disable=SC2086
  for f in "$sfile" "$PLAN" "$GD/logs/HEAD" $own_acts "$tasks"/"$sid"-*/*.output $PROG_EXTRA $WLOGS; do
    [ "$f" = "$LOG" ] || [ "$f" = "$STATE" ] || files+=("$f")
  done
  prog=$(mt "${files[@]}"); prog=${prog:-$t}
  # Start der Aufsicht zählt als Fortschritt: Sie wird direkt nach einem Auftrag gestartet, und der Orchestrator
  # braucht Minuten, bis er Worker/Dateien anfasst — sonst sofort STILLSTAND mit dem Alter der letzten Datei.
  [ "$prog" -lt "$start" ] && prog=$start
}

plan_items() { # erledigte Plan-Einträge (sortiert) – Queue-Tabelle über DONE_RE oder [x]/[~]-Liste über PLAN_RE
  if [ -n "$DONE_RE" ]; then
    grep -E "$DONE_RE" "$PLAN" 2>/dev/null | awk -F'|' '{gsub(/ /, "", $2); print $2}' | sort
    return
  fi
  grep -E "$PLAN_RE" "$PLAN" 2>/dev/null | grep -oE '\[(x|~)\] [^ ·]+' \
    | sed -E 's/^\[x\] //; s/^\[~\] (.*)/\1~/' | sort
}

zustand() {
  local sa
  sa=$(mt "$sfile"); sa=${sa:-$t}
  echo "pane=$st pi=$pi sitz=$(((t - sa) / 60))m worker=$wcount[$wlist] bg=$bgn[$bgnames] br=$br@$head" \
    "prog=$(((t - prog) / 60))m mem=${mem}MB disk=${disk}G wd=$wd"
}

finish() { # Endblock auf stdout (= bg_run-Meldung) und ins LOG, STATE-Zeile, Ende
  {
    echo "AUFSICHT-EXIT $1 $(hm) (Laufzeit $(((t - start) / 60)) min)"
    echo "Detail: $2"
    echo "Zustand: $(zustand)"
    echo "Meilensteine seit $(date -d "@$start" +%H:%M):${miles:- keine}"
    echo "Commits seit Start:"
    git -C "$L" log --all --since="@$start" --format='  %h %ad %s' --date=format:%H:%M -12 2>/dev/null
    echo "PLAN:"
    grep -E "$PLAN_RE" "$PLAN" 2>/dev/null | cut -c1-260
    echo "PLAN-Log (letzte 3):"
    grep -E "$PLANLOG_RE" "$PLANLOG_FILE" 2>/dev/null | tail -n 3 | cut -c1-240
    if [ -n "$WDLOG" ]; then echo "Watchdog (letzte 2):"; tail -n 2 "$WDLOG" 2>/dev/null | cut -c1-200; fi
  } | tee -a "$LOG"
  printf '%s %s %s@%s\n' "$t" "$1" "$br" "$head" >"$STATE"
  exit 0
}

sfile=""; sid=${AUF_SID:-}; tasks=${AUF_TASKS:-$L/.pi/tasks}
st=none; pi='?'; wpids=""; bgn=0; bgnames=""; wcount=0; wlist=""; wsilent=""; own_acts=""; rs=0
mem=0; disk=999; wd=-; miles=""
start=$(date +%s); t=$start; prog=$t
head=$(git -C "$L" rev-parse --short HEAD 2>/dev/null); br=$(git -C "$L" symbolic-ref --short -q HEAD || echo detached)
lhead=$head; lbr=$br; lw=-1; prev_plan=$(plan_items)
wd_gaveup0=0; [ -n "$WDLOG" ] && wd_gaveup0=$(grep -cE "$WDGIVEUP_RE" "$WDLOG" 2>/dev/null)
wd_gaveup0=${wd_gaveup0:-0}
idle_since=0; block_since=0; nopi_since=0; herdr_err=0; mem_low=0; i=0
mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
echo "$(date '+%d.%m %H:%M:%S') Start Aufsicht pane=$PANE poll=${POLL}s beat=${BEAT_MIN}m idle=${IDLE_MIN}m" \
  "stall=${STALL_MIN}/${HARD_MIN}m br=$br@$head" >>"$LOG"

while :; do
  t=$(date +%s); i=$((i + 1))
  [ -n "$TIMER" ] && wd=$(systemctl --user is-active "$TIMER" 2>/dev/null)
  [ -e "$STOP" ] && finish GESTOPPT "$(basename "$STOP") liegt vor – Loop nicht neu starten"
  # FERTIG nur mit Abschluss-Signal: Ein Schlussbericht allein ist oft ein Worker-Entwurf vor Prüflauf und letztem PR.
  # Ohne Watchdog (kein TIMER, Marker entsteht nie) endet die Loop stattdessen mit STEHT samt Hinweis auf den Bericht.
  if [ -e "$DONE" ] && { [ -e "$WDSTOP" ] || { [ -n "$TIMER" ] && [ -n "$wd" ] && [ "$wd" != active ]; }; }; then
    finish FERTIG "$(basename "$DONE") liegt vor, Abschluss-Signal da (Stop-Marker: $([ -e "$WDSTOP" ] && echo ja || echo nein), Timer: ${wd:--})"
  fi
  read_agent
  if read_pane; then
    if [ "$pi" = ja ]; then nopi_since=0; elif [ "$nopi_since" -eq 0 ]; then nopi_since=$t; fi
  fi
  read_bg; read_workers; read_progress
  head=$(git -C "$L" rev-parse --short HEAD 2>/dev/null); br=$(git -C "$L" symbolic-ref --short -q HEAD || echo detached)
  mem=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  [ $((i % 10)) -eq 1 ] && disk=$(df -BG --output=avail "$HOME" | tail -n 1 | tr -dc 0-9)

  if [ "$head" != "$lhead" ] || [ "$br" != "$lbr" ]; then
    miles+="$nl  - $(hm) $br@$head $(git -C "$L" log -1 --format=%s 2>/dev/null | cut -c1-72)"
    lhead=$head; lbr=$br
  fi
  cur_plan=$(plan_items)
  neu=$(comm -13 <(printf '%s\n' "$prev_plan") <(printf '%s\n' "$cur_plan") | tr '\n' ' ')
  [ -n "${neu// /}" ] && miles+="$nl  - $(hm) PLAN abgehakt: $neu"
  prev_plan=$cur_plan
  if [ "$wcount" != "$lw" ]; then
    [ "$lw" -ge 0 ] && miles+="$nl  - $(hm) Worker $lw→$wcount [$wlist]"
    lw=$wcount
  fi
  echo "$(date +%H:%M:%S) $(zustand)" >>"$LOG"

  if [ "$st" = herdr-fehler ]; then herdr_err=$((herdr_err + 1)); else herdr_err=0; fi
  [ "$herdr_err" -ge 5 ] && finish HERDR "herdr antwortet seit 5 Abfragen nicht"
  if [ "$st" = blocked ]; then
    [ "$block_since" -eq 0 ] && block_since=$t
    [ $((t - block_since)) -ge $((BLOCK_MIN * 60)) ] && finish BLOCKIERT "Pane $PANE meldet blocked seit $(((t - block_since) / 60)) min"
  else block_since=0; fi
  [ "$nopi_since" -gt 0 ] && [ $((t - nopi_since)) -ge $((NOPI_MIN * 60)) ] \
    && finish KEIN-PI "kein Orchestrator-pi im Pane seit $(((t - nopi_since) / 60)) min (Watchdog-Neustart ausgeblieben?)"
  if { [ "$st" = idle ] || [ "$st" = done ]; } && [ "$wcount" -eq 0 ] && [ "$bgn" -eq 0 ] && [ "$pi" = ja ]; then
    [ "$idle_since" -eq 0 ] && idle_since=$t
    [ $((t - idle_since)) -ge $((IDLE_MIN * 60)) ] && finish STEHT "Orchestrator $st seit $(((t - idle_since) / 60)) min, kein Worker, kein bg-Task$([ -e "$DONE" ] && echo " – $(basename "$DONE") liegt vor, vermutlich fertig (ohne Abschluss-Signal)")"
  else idle_since=0; fi
  [ "$wcount" -eq 0 ] && [ "$bgn" -eq 0 ] && [ $((t - prog)) -ge $((STALL_MIN * 60)) ] \
    && finish STILLSTAND "seit $(((t - prog) / 60)) min kein Fortschrittssignal, kein Worker, kein bg-Task (Pane $st)"
  [ $((t - prog)) -ge $((HARD_MIN * 60)) ] && finish STILLSTAND "seit $(((t - prog) / 60)) min gar kein Fortschrittssignal"
  [ -n "$wsilent" ] && finish WORKER-STILL "Worker ohne Aktivität ≥${WORKER_MIN} min: $wsilent"
  if [ "${mem:-99999}" -lt "$MEM_MB" ]; then mem_low=$((mem_low + 1)); else mem_low=0; fi
  [ "$mem_low" -ge 3 ] && finish RAM "MemAvailable ${mem} MB < ${MEM_MB} MB seit 3 Abfragen"
  [ "${disk:-999}" -lt "$DISK_GB" ] && finish PLATTE "nur ${disk} GB frei in \$HOME"
  if [ -n "$TIMER" ] && [ "$wd" != active ] && [ ! -e "$WDSTOP" ]; then finish WATCHDOG "$TIMER ist '$wd' (ohne Stop-Marker)"; fi
  if [ -n "$WDLOG" ]; then
    g=$(grep -cE "$WDGIVEUP_RE" "$WDLOG" 2>/dev/null)
    [ "${g:-0}" -gt "$wd_gaveup0" ] && finish WATCHDOG "Watchdog hat aufgegeben (Muster '$WDGIVEUP_RE' im Log)"
  fi
  [ $((t - start)) -ge $((BEAT_MIN * 60)) ] && finish HERZSCHLAG "regulärer Bericht nach ${BEAT_MIN} min"
  sleep "$POLL"
done
