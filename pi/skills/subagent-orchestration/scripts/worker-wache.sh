#!/bin/sh
# Wache für acp_delegate-Worker. Als bg_run starten (surviveReload): Ihr Ende weckt die Sitzung,
# Abschlussmeldungen von acp_delegate wecken eine ruhende Sitzung nicht.
#
# Aufruf:  [WACHE_STILL=15] [WACHE_HARD=75] [WACHE_ALLE=1] sh worker-wache.sh <runId>...
#   alt:   sh worker-wache.sh <runId> auto [<still-min>] [<hard-min>]
# Bei resumeFrom-Läufen `sleep 15;` voranstellen, damit eine alte Schlusszeile nicht als Abschluss gilt.
#
# Ereignisse (die Wache endet beim ersten; mit WACHE_ALLE=1 erst, wenn alle Läufe fertig sind):
#   FERTIG  Letzte Zeile von <runId>.session.jsonl = Assistant-Nachricht mit stopReason ≠ toolUse (rc 0).
#   STILL   <runId>.activity ist WACHE_STILL min unverändert. Läuft gerade ein Werkzeug (letzte [tool]-Zeile ohne
#           folgende [done]-Zeile, z. B. ein langer Testlauf), gilt erst WACHE_HARD min (rc 1).
#   TOT?    Ein Worker-pi dieser Sitzung (Kind des Eltern-pi mit PI_ACP_DELEGATE_DEPTH=1) ist verschwunden, kein Lauf
#           hat eine frische Abschlussmarke geschrieben, UND die eigenen Läufe schreiben danach WACHE_VERDACHT s
#           (Standard 360) nichts mehr in ihre .activity (rc 1). Schreiben sie weiter, war es ein anderer Worker der
#           Sitzung (z. B. vom 5-min-Wächter beendet) → Entwarnung, die Wache läuft weiter.
# Bewusst keine Zuordnung runId → pid: Gleichzeitig gestartete Worker haben dieselbe Startzeit, und die runId
# steht weder in der Befehlszeile noch in der Umgebung des Worker-pi. Ein lebender Worker schreibt spätestens alle
# 5 min (sonst beendet ihn der acp-Wächter), darum trennt die Aktivität nach dem Wegfall lebend von tot.
d=/tmp/acp-delegate

if [ $# -ge 2 ] && { [ "$2" = auto ] || [ -z "$(printf %s "$2" | tr -d 0-9)" ]; }; then
  WACHE_STILL=${3:-${WACHE_STILL:-15}}
  WACHE_HARD=${4:-${WACHE_HARD:-75}}
  set -- "$1"
fi
still=${WACHE_STILL:-15}
hard=${WACHE_HARD:-75}
alle=${WACHE_ALLE:-0}
frist=${WACHE_VERDACHT:-360}
[ $# -ge 1 ] || {
  echo "Aufruf: [WACHE_STILL=15] [WACHE_HARD=75] [WACHE_ALLE=1] [WACHE_VERDACHT=360] sh worker-wache.sh <runId>..."
  exit 2
}

# gibt den stopReason aus, wenn der Lauf abgeschlossen ist
abschluss() {
  f=$d/$1.session.jsonl
  [ -f "$f" ] || return 1
  z=$(tail -n 1 "$f")
  case $z in *'"role":"assistant"'*) ;; *) return 1 ;; esac
  sr=$(printf '%s\n' "$z" | grep -o '"stopReason":"[A-Za-z]*"' | tail -n 1 | cut -d'"' -f4)
  [ -n "$sr" ] && [ "$sr" != toolUse ] || return 1
  echo "$sr"
}
werkzeug_laeuft() {
  grep -E '^\[(tool|done)\] ' "$d/$1.activity" 2>/dev/null | tail -n 1 | grep -q '^\[tool\] '
}
eltern_pi() {
  p=$$
  while [ -n "$p" ] && [ "$p" -gt 1 ]; do
    p=$(ps -o ppid= -p "$p" | tr -d ' ')
    [ -n "$p" ] && [ "$(cat /proc/"$p"/comm 2>/dev/null)" = pi ] && {
      echo "$p"
      return 0
    }
  done
  return 1
}
worker_zahl() {
  n=0
  for c in $(pgrep -P "$ep" -x pi); do
    tr '\0' '\n' <"/proc/$c/environ" 2>/dev/null | grep -q '^PI_ACP_DELEGATE_DEPTH=1$' && n=$((n + 1))
  done
  echo "$n"
}
frisch_fertig() {
  for f in $(find "$d" -maxdepth 1 -name '*.session.jsonl' -mmin -3 2>/dev/null); do
    abschluss "$(basename "$f" .session.jsonl)" >/dev/null && return 0
  done
  return 1
}

ep=$(eltern_pi) || ep=""
vorher=""
verdacht=""
[ -n "$ep" ] && vorher=$(worker_zahl)
echo "Wache $(date +%H:%M:%S): $* · still $still min, mit laufendem Werkzeug $hard min · Eltern-pi ${ep:-?}, Worker ${vorher:-?}"
offen="$*"
while :; do
  rest=""
  for r in $offen; do
    if sr=$(abschluss "$r"); then
      echo "FERTIG: $r (stopReason=$sr) um $(date +%H:%M:%S)"
      tail -c 300 "$d/$r.out" 2>/dev/null
      echo
      [ "$alle" = 1 ] || exit 0
    else
      rest="$rest $r"
    fi
  done
  offen=$rest
  [ -n "$offen" ] || {
    echo "ALLE FERTIG um $(date +%H:%M:%S)"
    exit 0
  }
  for r in $offen; do
    a=$d/$r.activity
    [ -f "$a" ] || continue
    age=$(($(date +%s) - $(stat -c %Y "$a")))
    g=$still
    werkzeug_laeuft "$r" && g=$hard
    if [ "$age" -ge $((g * 60)) ]; then
      echo "STILL: $r seit $((age / 60)) min ohne Aktivität (Grenze $g min); offen:$offen"
      tail -n 3 "$a" | cut -c1-200
      exit 1
    fi
  done
  if [ -n "$ep" ]; then
    jetzt=$(worker_zahl)
    if [ "$jetzt" -lt "$vorher" ] && [ -z "$verdacht" ] && ! frisch_fertig; then
      verdacht=$(date +%s)
      echo "Verdacht $(date +%H:%M:%S): Worker-pis der Sitzung $vorher → $jetzt; prüfe $frist s, ob die eigenen Läufe weiterschreiben"
    fi
    vorher=$jetzt
  fi
  if [ -n "$verdacht" ] && [ $(($(date +%s) - verdacht)) -ge "$frist" ]; then
    tot=""
    for r in $offen; do
      m=$(stat -c %Y "$d/$r.activity" 2>/dev/null || echo 0)
      [ "$m" -gt "$verdacht" ] || tot="$tot $r"
    done
    if [ -n "$tot" ]; then
      echo "TOT?: seit dem Wegfall eines Worker-pi ($(date -d @"$verdacht" +%H:%M:%S)) keine Aktivität mehr von:$tot; offen:$offen"
      exit 1
    fi
    echo "Entwarnung $(date +%H:%M:%S): eigene Läufe schreiben weiter — ein anderer Worker der Sitzung ist geendet"
    verdacht=""
  fi
  sleep 30
done
