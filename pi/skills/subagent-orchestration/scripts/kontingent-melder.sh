#!/usr/bin/env bash
# kontingent-melder.sh – Melder für ein vom Nutzer angekündigtes Zurücksetzen eines Kontingents
# (references/kontingent.md §5). In den Steuerordner kopieren und als eigene User-Unit starten.
#  1. Merkt beim Start resetsAt des Fensters (Label-Regex KM_LABEL, Standard ^Weekly).
#  2. Erreicht das Fenster KM_SCHWELLE %, ruft es GENAU EINMAL KM_NOTIFY auf (Desktop-Benachrichtigung).
#  3. Springt resetsAt um mehr als KM_SPRUNG s (Nutzer hat zurückgesetzt oder die Woche ist regulär um), löscht es
#     die Zeilen mit KM_MARKE aus KM_OVERRIDE (tmp + mv), gibt KM-ENDE aus und endet mit Exit 0.
#     Nicht schon nach der Meldung enden: Sonst hebt die Ausnahme das Tor bis zu ihrem Ablauf auch in der neuen Woche.
#     resetsAt als epoch mit Toleranz vergleichen, nicht als Text, weil Sammler dieselbe Zeit mal mit, mal ohne
#     Sekundenbruchteil schreiben.
# env: KM_FILE (Usage-JSON, Pflicht), KM_LABEL, KM_SCHWELLE (92), KM_TAKT (300 s; die JSON erneuert sich nur etwa
#      alle 5 min), KM_SPRUNG (3600), KM_NOTIFY (notify-send), KM_APP, KM_TITEL (printf-Format, %s = Prozent),
#      KM_TEXT, KM_OVERRIDE (Ausnahme-Datei), KM_MARKE (eindeutige Marke der eigenen Ausnahme-Zeile).
# Start:
#   systemd-run --user --unit=<lauf>-melder -p RuntimeMaxSec=7d -p StandardOutput=append:<log> \
#     --setenv=HOME="$HOME" --setenv=PATH="$PATH" \
#     --setenv=DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" \
#     --setenv=KM_FILE=<usage.json> --setenv=KM_OVERRIDE=<quota-override> --setenv=KM_MARKE='<marke>' \
#     /bin/bash <steuer>/kontingent-melder.sh
#   Ohne DBUS_SESSION_BUS_ADDRESS erreicht notify-send aus einer User-Unit den Desktop nicht. Vorher mit denselben
#   --setenv eine Probe schicken: systemd-run --user --wait --pipe -q … notify-send "Probe" "…"; echo rc=$?
# Test (künstliche JSON, KM_NOTIFY=echo, KM_TAKT=1, timeout): Meldung und danach Reset (nur die eigene Zeile fehlt),
#   Reset vor der Schwelle, Schwelle ohne Reset (Zeile bleibt, nur eine Meldung), knapp unter der Schwelle (still),
#   Reset ohne Override-Datei, resetsAt nur anders formatiert (läuft weiter).
set -u
f=${KM_FILE:?KM_FILE (Usage-JSON) fehlt}
label=${KM_LABEL:-^Weekly}
s=${KM_SCHWELLE:-92}
takt=${KM_TAKT:-300}
sprung=${KM_SPRUNG:-3600}
nt=${KM_NOTIFY:-notify-send}
app=${KM_APP:-Orchestrator}
titel=${KM_TITEL:-Kontingent bei %s %%}
text=${KM_TEXT:-Es starten keine neuen Läufe mehr. Bitte zurücksetzen, danach geht es von selbst weiter.}
ov=${KM_OVERRIDE:-}
marke=${KM_MARKE:-}

feld() { jq -r --arg l "$label" '[.limits[] | select(.label | test($l))][0] | '"$1"' // empty' "$f" 2>/dev/null; }
ep() { [ -n "$1" ] && date -d "$1" +%s 2>/dev/null; }
hm() { date +%H:%M; }

r0=$(ep "$(feld .resetsAt)")
gemeldet=0
echo "$(hm) KM-START schwelle=$s resetsAt=${r0:-?}"
while :; do
  r=$(ep "$(feld .resetsAt)")
  p=$(feld '(.percent * 100 | round)')
  [ -z "$r0" ] && r0=$r
  if [ -n "$r0" ] && [ -n "$r" ] && [ $((r > r0 ? r - r0 : r0 - r)) -gt "$sprung" ]; then
    if [ -n "$ov" ] && [ -n "$marke" ] && [ -f "$ov" ]; then
      grep -vF -- "$marke" "$ov" > "$ov.km" || true
      mv "$ov.km" "$ov"
    fi
    echo "$(hm) KM-ENDE zurückgesetzt (resetsAt $(date -d "@$r0" '+%d.%m %H:%M') → $(date -d "@$r" '+%d.%m %H:%M'), jetzt ${p:-?} %)"
    exit 0
  fi
  if [ "$gemeldet" = 0 ] && [ -n "$p" ] && [ "$p" -ge "$s" ]; then
    printf -v t "$titel" "$p"
    $nt -u critical -a "$app" "$t" "$text"
    gemeldet=1
    echo "$(hm) KM-GEMELDET ($p %)"
  fi
  sleep "$takt"
done
