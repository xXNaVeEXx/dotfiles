---
name: pi-rpc-client
description: "Pi als Subprocess über den RPC-Modus fernsteuern (pi --mode rpc, JSONL über stdin/stdout) – Start, Befehle, Ereignisse bis agent_settled, Dialoge der Erweiterungen, Sitzungsdateien, Kaltstartkosten unter Erweiterungslast, Leser-Thread-Fallen; use when a script, daemon, bot, scheduler or service (Telegram bot, cron runner, web UI, voice assistant) shall drive the installed Pi instead of the TUI, or an RPC integration hangs, answers late or loses responses."
---

# pi-rpc-client

# Pi über RPC fernsteuern

Pi im RPC-Modus als Kindprozess steuern: Befehle als JSON-Zeilen auf stdin, Antworten und Ereignisse als
JSON-Zeilen auf stdout. Gilt für jedes Programm, das das **installierte** Pi fernsteuert (Bot, Zeitplan,
Web-Oberfläche, Sprachassistent) – Erweiterungen, Skills und Auth des Nutzers bleiben aktiv, es wird kein
SDK eingebettet (eingebettete alte SDKs vertragen sich nicht mit den Erweiterungen der aktuellen Version).
Arbeitsendes Vorbild: `~/projects/pi-telegram/pi_telegram/rpc.py` (Skill pi-telegram-bridge).

## 1. Starten

- `pi --mode rpc` plus normale CLI-Optionen: `--session <Datei>` (fortsetzen) oder `--no-session`, `--name`,
  `--provider/--model`; Arbeitsordner = `cwd` des Kindprozesses. `stdin`/`stdout`/`stderr` als Pipes,
  `start_new_session=True`, damit es beim Ende des Aufrufers nicht die Signale teilt.
- stdout **kontinuierlich** in einem Leser-Thread lesen, als Bytes und **nur an LF** trennen
  (`bytes.readline()`; `readline`-Module teilen auch an U+2028/U+2029, die in JSON-Zeichenketten erlaubt sind).
  stderr ist nie Protokoll, dort stehen Diagnosen (Ende als Ringpuffer aufheben).
- Kaltstart kostet: gemessen 13–40 s bis zur ersten Antwort, je nach Last und Erweiterungsmenge
  (mit `--no-skills` ≈ 16 s, mit `--no-extensions` < 1 s). Erstes Zeitlimit ≥ 60 s setzen, Prozess warm
  halten und beim Dienststart vorladen. Messen: Zeit bis zur ersten `get_state`-Antwort.

## 2. Befehle und Antworten

- Befehl `{"id": "…", "type": "…", …}` → `{"id", "type": "response", "command", "success", "data" | "error"}`.
  Antworten kommen asynchronous, nach Id zuordnen. Fehlerhafter Befehl: `success: false` mit Klartext; kaputtes
  JSON: Antwort mit `command: "parse"` und ohne Id.
- `prompt` → `data.disposition` `started` | `queued` | `handled`; `handled` = kein Lauf (z. B.
  Erweiterungsbefehl). Ein erfolgreicher `prompt` heißt nur „angenommen“.
- Lauf-Ende ist `agent_settled`, nicht `agent_end` (danach können Retry, Compaction, Follow-up kommen).
- Zustand: `get_state` → `model{provider,id,input,…}`, `thinkingLevel`, `isStreaming`, `isCompacting`,
  `sessionFile`, `sessionId`, `sessionName`, `pendingMessageCount`; `get_messages`; `get_last_assistant_text`
  → `{"text"}`; `get_session_stats`.
- Sitzung: `new_session` (optional `parentSession`) und `switch_session {"sessionPath": "<jsonl>"}` →
  `{"cancelled"}`; `set_session_name {"name"}`; `fork`, `clone`, `get_tree`, `get_entries`, `export_html`.
- Während eines Laufs nur `steer` (nach dem laufenden Werkzeug, vor dem nächsten Modellaufruf),
  `follow_up` (erst nach Laufende) oder Erweiterungsbefehle; sonst `abort` (wartet bis leer),
  `clear_queue` → `{steering, followUp}`.
- Modell und Denken: `get_available_models` → `{models: [...]}`, `set_model {"provider","modelId"}`,
  `set_thinking_level`/`cycle_thinking_level` → `{"level"}`; `compact` (optional `customInstructions`) →
  `{summary, tokensBefore, estimatedTokensAfter, usage}`.
- Erweiterungsbefehle (`/name args`) und `/skill:name` ebenfalls über `prompt` (werden expandiert).
- Bilder im Auftrag: `"images": [{"type": "image", "data": "<base64>", "mimeType": "image/png"}]`.

## 3. Ereignisse (stdout)

- `agent_start`, `message_update` (`assistantMessageEvent.type` u. a. `text_delta` mit `delta`),
  `message_end`, `tool_execution_start` `{toolCallId, toolName, args}`, `tool_execution_update`
  (`partialResult`), `tool_execution_end` (`result`, `isError`, `durationMs`), `auto_retry_start`,
  `agent_end`, `agent_settled {"aborted"}`; außerdem `queue_update`, `entry_appended`,
  `session_info_changed`, `thinking_level_changed`, `bash_execution_update`, `extension_error`.
- Erweiterungen senden ~2 `extension_ui_request`-Datensätze je Sekunde (Fire-and-forget `setStatus`,
  `setWidget`, `notify`, `setTitle`, `set_editor_text`) – normal, kein Sturm; einfach ignorieren oder
  als Status aufbereiten. Direkt vor dem ersten `prompt` und nach jedem `new_session` kommt eine Startphase
  mit `notify`-Hinweisen („80 skills loaded“ …): unterdrücken, aber nur bis der Prozess steht.

## 4. Dialoge der Erweiterungen

- `extension_ui_request` mit `method` `select` | `confirm` | `input` | `editor` **blockiert Pi** bis zur
  Antwort oder bis `timeout` (ms) abläuft. Antwort `{"type": "extension_ui_response", "id": "<selbe>",
  "confirmed": true|false}` bzw. `{"cancelled": true}` bei `confirm`; `{"value": "…"}` bei select/input/editor.
- In Chats/Oberflächen als Tasten oder Freitext anbieten (confirm → Ja/Nein-Tasten mit `callback_data`,
  select → nummerierte Liste, input/editor → Textantwort); Zeitlimit der Oberfläche = `timeout` + 2 s.

## 5. Sitzungsdateien

- `~/.pi/agent/sessions/<cwd, '/' → '-'>--/<ISO-Zeit>_<uuid>.jsonl` (oder `--session-dir`,
  Env `PI_CODING_AGENT_SESSION_DIR`). Kopfzeile `{"type":"session","version":3,"id","timestamp","cwd"}`,
  danach u. a. `model_change`. RPC und Terminal teilen denselben Ordner → Terminalsitzungen sind per
  `switch_session` fortsetzbar; `--session <Datei>` übernimmt den Ordner der Sitzung.
- Die nach Änderungszeit neueste Datei im eigenen Ordner ist die **eigene** TUI-Sitzung, nicht die des
  Kindprozesses: fremde Sitzung anhand Kopfzeitstempel (≥ Prozessstart) und erstem Nutzerwunsch erkennen.
- Zeitstempel der Einträge gliedern die Wartezeit (Kopf = Prozessstart, `model_change`, erste
  Nutzernachricht = Auftrag, Assistenteneintrag = Antwort) – erst damit ist „langsam“ einer Phase zuordnen.

## 6. Leser-Thread-Fallen

- Waiter für eine Anfrage-Id **vor** dem Schreiben eintragen. Kommt die Antwort unter Last zurück, bevor der
  Aufrufer nach `write` weiterläuft, verwirft der Leser-Thread sie als unbekannte Id → Zeitüberschreitung
  (selten, nur unter Last). Regressionstest mit einem Leser, der dauernd Fremddatensätze sendet.
- Eine Ausnahme im Leser-Thread (z. B. Wrapper mit abweichender Signatur) hinterlässt einen still hängenden
  Ablauf ohne Journalzeile:Reader-Code klein halten, Ausnahmen dort protokollieren, auf Stille ein
  Zeitlimit mit Klartext-Antwort setzen.
- Beim Beenden stdin schließen und Gnadenfrist geben (Pi räumt auf), dann `SIGTERM`, dann erst `kill`.

## Quellen

Doku im installierten Paket (`/nix/store/*-pi-*/lib/pi/node_modules/@earendil-works/pi-coding-agent/docs/`):
`rpc.md`, `rpc-commands.md`, `json.md`, `rpc-extension-ui.md`, `session-format.md`, `security.md`.
Version each Mal an `pi --help` und diesen Dateien prüfen – das Protokoll ändert sich zwischen Versionen.
