# Pi-Session-JSONL auswerten (Ursprungssitzung, Aufträge, letzte Meldungen)

## Session-Datei finden
- Ablage: `~/.pi/agent/sessions/--<cwd-slug>--/<UTC-Start>_<session-id>.jsonl` (Slug = cwd mit `-` statt `/`). Eigene Sitzung: `$PI_SESSION_FILE`.
- Die Ordnernamen beginnen mit `--` → ohne `--` liest `ls` sie als Option und bricht ab. Immer `ls -d -- */` bzw. `ls -t -- ./--<slug>--/*.jsonl` oder `find` nutzen:
  `cd ~/.pi/agent/sessions && find . -name '*.jsonl' -newermt '<YYYY-MM-DD HH:MM>' -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort`
  (mtime = letzte Schreibung, Größe verrät Riesensitzungen → nie ganz lesen).
- Schneller über die Session-ID aus `session_search {}`: `grep -rl "<session-id>" ~/.pi/agent/sessions --include=*.jsonl`.
- Der Dateiname trägt die Startzeit in UTC → vor jedem Vergleich mit Commits/Logs in Ortszeit umrechnen; der Versatz ändert sich beim Sommer-/Winterzeitwechsel.

## Prozess ↔ Sitzung zuordnen
- `ps -o pid,lstart,etime,args -C pi`: Startzeit eines pi-Prozesses = Zeitstempel seiner ERSTEN Session-Datei.
- `/new` legt im selben Prozess eine neue Datei an — die PID bleibt, ihre Startzeit zeigt weiter auf die Ursprungssitzung. Aktuell ist die jüngste Datei mit passendem cwd, deren mtime noch wächst.
- Schnellster Nachweis für `/new` im selben Pane: `ls -dt ~/.pi/tasks/*` — die Ordner heißen `<session-id>-<pi-PID>`. Tragen die eigene und die tote Sitzung dieselbe PID-Endung, bin ich der Nachfolger.
- Worker/Delegates: `ps -eo pid,lstart,args | grep -E 'acp-delegate|pi --mode|del_'` (runId steht im Argument).

## Delegate-Worker der toten Sitzung finden
```bash
jq -r 'select(.type=="message" and .message.role=="assistant") | .message.content[]?
  | select(.type=="toolCall" and (.name|test("delegate|subagent"))) | .name+" "+(.arguments|tostring)' F | cut -c1-500
jq -r 'select(.type=="message" and .message.role=="toolResult") | select(.message.toolName|test("delegate|subagent"))
  | (.message.content|map(.text? // "")|join(" "))' F | grep -o 'runId `[^`]*`' | sort -u
```
- Der zuletzt genannte runId gilt, denn ein `resumeFrom` vergibt eine neue ID. Danach `tail -c 1500 /tmp/acp-delegate/<runId>.activity` lesen und `git status --short` im Worker-cwd prüfen, um den Teilstand zu sehen.

## Struktur
- Zeile 1: `{"type":"session","version":…,"id":…,"timestamp":…,"cwd":…}`.
- Danach `type=="message"` mit `.message.role` ∈ user/assistant/toolResult/system, dazu Extension-Einträge mit `.customType`.
- Rollen zählen: `jq -c 'select(.type=="message") | .message.role' F | sort | uniq -c`.
- Assistant-Einträge tragen `.message.stopReason` (`stop`, `toolUse`, `error`, `length`, `aborted`) und bei Fehlern `.message.errorMessage`.

## Todesursache bestimmen
Zuerst klären, woran die Sitzung starb, und erst danach entscheiden, ob sie fortgesetzt werden darf:
```bash
jq -r 'select(.type=="message" and .message.role=="assistant") | .message.stopReason' F | sort | uniq -c
jq -r 'select(.type=="message" and .message.role=="assistant" and (.message.stopReason|IN("stop","toolUse")|not))
  | [.timestamp[0:16], .message.stopReason, ((.message.errorMessage // "")|.[-200:])] | @tsv' F | tail -5
jq -r 'select(.type=="message" and .message.role=="assistant" and .message.stopReason=="stop") | .timestamp[0:16]' F | tail -1   # letzte echte Antwort
```
- Das Ende der Fehlermeldung lesen (`.[-200:]`): Die Anbieter-JSON-Hülle steht vorne, die Ursache hinten.
- `prompt is too long` / `context length` / `too many tokens`: Kontext-Überlauf. Die Sitzung nie fortsetzen (`--continue`, `--session`, Watchdog-Neustart), denn jede Anfrage schickt wieder die volle Historie. Frisch starten und den Stand aus den Projekt-Dokumenten aufbauen; prüfen, dass der Watchdog die neue Sitzung verfolgt und nicht die alte neu startet.
- `429` / `overloaded` / Proxy-Meldung `bili_throttle_terminal`: Kontingent oder Last. Die genaue Ursache und das Reset-Datum stehen oft nicht in der Sitzung, sondern nur im Retry-Log eines Workers (`grep -a 429 /tmp/acp-delegate/*.activity | tail -2`). z.ai/bigmodel meldet ein Wochen- oder Monatslimit als Code `1310` mit Reset-Zeitpunkt.
  - Kurze Last-Sperre: Die Sitzung darf nach dem Reset fortgesetzt werden.
  - Reset erst in Tagen: nicht warten, sondern auf einem anderen Anbieter weiterarbeiten. Worker desselben Anbieters hängen dann in Retry-Schleifen: abbrechen und mit `resumeFrom` plus `model`-Override auf einen verfügbaren Anbieter fortsetzen. Dem Nutzer das Reset-Datum nennen.
- `aborted`: Der Nutzer hat abgebrochen, kein Absturz.
- Die Zeitspanne zwischen letzter echter Antwort und letztem Fehler ist die Ausfallzeit; in den Bericht an den Nutzer aufnehmen.

## Echte Nutzeraufträge extrahieren
Review-Turns, Hintergrund-/Delegate-Meldungen und Proxy-Meldungen stehen ebenfalls als role user in der Datei und müssen heraus:
```bash
jq -r 'select(.type=="message" and .message.role=="user")
  | [(.timestamp|sub("\\.[0-9]+Z$";"Z")),
     ((.message.content|if type=="string" then . else (map(select(.type=="text")|.text)|join(" ")) end)
      |gsub("\n";" ⏎ ")|.[0:260])] | @tsv' F \
| grep -v -E 'hermes-review|AUTONOMOUS REVIEW|background-task-notification|acp_delegate (completed|FAILED|cancelled)|\[ACP\]'
```
Lange Aufträge danach einzeln voll lesen: `select(.timestamp|startswith("<ts>"))`.

## Letzte Meldungen
```bash
tail -n 12 F | jq -r '[.timestamp,.type,(.customType // .message.role // ""),
  ((.message.content // "")|if type=="string" then . else (map(.text? // "")|join(" ")) end
   |gsub("\n";" ⏎ ")|.[0:200])]|@tsv'
```
Assistant-Zeilen mit reinen Tool-Calls bleiben leer. Die letzte Schreibung ist oft nur ein Extension-Eintrag (z. B. beim `/new`), daher die letzte echte Assistant-Antwort mit Text gezielt suchen — sie nennt meist Übergabe, Queue und offene Nutzerentscheidungen. Gezielt per Zeitfenster vor dem Tod:
```bash
jq -r 'select(.type=="message" and .message.role=="assistant" and .timestamp>"<von>" and .timestamp<"<bis>")
  | .timestamp[11:19] + " " + ([.message.content[]? | if .type=="text" then "TXT: "+.text
      elif .type=="toolCall" then "CALL: "+(.arguments|tostring) else empty end] | join(" | "))' F | cut -c1-600 | tail -12
```
Offene Punkte der toten Sitzung quer über ihre Antworten sammeln: Texte ab einem Zeitpunkt nach `offen|später|follow|noch nicht|nächst` greppen (`… | grep -iE '…' | tail -15`). Grund: Angekündigte Folgearbeiten stehen oft nur in Zwischenmeldungen und in keinem Tracker.
