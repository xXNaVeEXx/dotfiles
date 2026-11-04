#!/usr/bin/env bash
# warte.sh <spur> [--max SEK] [--quota anb1,anb2,…]  – Herzschlag einer Spur (bg_run statt `sleep`).
# In den Steuerordner kopieren (dort liegen spuren/<spur>/QUEUE.md, quota.sh, locks/). Endet mit einer Zeile, Exit 0:
#   WARTE-ENDE fertig <runId> (<stopReason>, seit <n> min fertig, Queue sagt noch läuft)
#   WARTE-ENDE frei <anbieter>        (nur mit --quota: Tor-Skript dieses Anbieters gibt Exit 0)
#   WARTE-ENDE herzschlag <SEK>s      (Frist abgelaufen → Kontrollrunde)
# Fertig = Queue-Zeile sagt noch „läuft|nacharbeit <runId>“ (Groß/Klein egal), die letzte Nachricht der Sitzung
# $WARTE_DIR/<runId>.session.jsonl ist eine Assistant-Antwort mit stopReason stop|length|aborted|error, und die Datei
# ruht seit WARTE_NACH s (180). Den stopReason prüfen, nicht eine Schlusszeile der .out: Worker schreiben sie oft
# nicht am Zeilenanfang. Wer die acp-Meldung bekam, nimmt binnen 3 min ab → kein Doppel-Wecken. Je Lauf höchstens
# alle WARTE_WIEDER s (1800) melden (Zustand locks/warte-<spur>.state), sonst Weck-Schleife bei nicht nachgezogener
# Queue-Zeile. Testfälle (Attrappen, WARTE_TAKT=1): fertig; schon gemeldet; zu frisch; läuft noch (toolUse);
# abgenommen; „resume <runId>“ zählt nicht; nacharbeit+error; großgeschrieben; alte ID im Freitext; Sitzung fehlt;
# Übergang während des Wartens; quota frei/zu; erneut nach Frist; halbe letzte Zeile; Queue fehlt; falsche Option.
set -u
C=${WARTE_C:-$(cd "$(dirname "$0")" && pwd)}
DIR=${WARTE_DIR:-/tmp/acp-delegate}
TAKT=${WARTE_TAKT:-60}
NACH=${WARTE_NACH:-180}
WIEDER=${WARTE_WIEDER:-1800}
QUOTA=${WARTE_QUOTA:-$C/quota.sh}
s=${1:?Spur fehlt}
shift
max=1500
quota=""
while [ $# -gt 0 ]; do
  case $1 in
    --max) max=$2; shift 2 ;;
    --quota) quota=$2; shift 2 ;;
    *) echo "warte.sh: unbekannte Option $1" >&2; exit 2 ;;
  esac
done
Q=$C/spuren/$s/QUEUE.md
[ -f "$Q" ] || { echo "warte.sh: $Q fehlt" >&2; exit 2; }
ST=$C/locks/warte-$s.state
mkdir -p "$C/locks" && touch "$ST"
ende=$(($(date +%s) + max))
while :; do
  now=$(date +%s)
  for id in $(grep -oiE '(läuft|nacharbeit) del_[A-Za-z0-9]+_[A-Za-z0-9]+' "$Q" | awk '{print $2}' | sort -u); do
    f=$DIR/$id.session.jsonl
    [ -f "$f" ] || continue
    sr=$(tail -n 5 "$f" | jq -rR 'fromjson? | select(.type=="message") | "\(.message.role) \(.message.stopReason // "-")"' 2>/dev/null | tail -n 1)
    case $sr in "assistant stop" | "assistant length" | "assistant aborted" | "assistant error") ;; *) continue ;; esac
    alt=$((now - $(stat -c %Y "$f")))
    [ "$alt" -ge "$NACH" ] || continue
    zul=$(awk -v i="$id" '$1 == i { t = $2 } END { print t + 0 }' "$ST")
    [ $((now - zul)) -ge "$WIEDER" ] || continue
    echo "$id $now" >>"$ST"
    echo "WARTE-ENDE fertig $id (${sr#assistant }, seit $((alt / 60)) min fertig, Queue sagt noch läuft)"
    exit 0
  done
  if [ -n "$quota" ]; then
    for a in ${quota//,/ }; do
      if "$QUOTA" "$a" >/dev/null 2>&1; then echo "WARTE-ENDE frei $a"; exit 0; fi
    done
  fi
  [ "$now" -ge "$ende" ] && { echo "WARTE-ENDE herzschlag ${max}s"; exit 0; }
  sleep "$TAKT"
done
