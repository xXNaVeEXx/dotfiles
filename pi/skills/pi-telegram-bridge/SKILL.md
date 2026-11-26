---
name: pi-telegram-bridge
description: "Die eigene Telegram-Brücke für den Pi-Coding-Agent einrichten, warten und erweitern (Repo ~/projects/pi-telegram, Starter ~/.local/bin/pi-telegram, systemd-User-Dienst pi-telegram) – RPC-Unterprozess, Warteschlange, Dialoge per Tasten, Sitzungen, Tests ohne Netz, Live-Prüfung; use when the Telegram bridge for Pi shall be set up or changed, the bot does not answer or spams, a Telegram account shall be allowed, or pi is to be driven via RPC mode (pi --mode rpc) from Python."
---

# pi-telegram-bridge

Telegram-Brücke für den Pi-Coding-Agent: ein Daemon (Python, nur Standardbibliothek) liest Telegram per Long
Polling und steuert das **installierte** `pi` per RPC (`pi --mode rpc`). Alle Erweiterungen des Nutzers bleiben
aktiv; es wird kein eigenes Pi eingebettet (Vorart mit eingebettetem SDK war wegen der 1.6.1-Erweiterungen unbrauchbar).

## Wo was liegt

- Repo `~/projects/pi-telegram` (git, main): `pi_telegram/{rpc,tg,md,sessions,config,bridge,cli}.py`, Starter
  `bin/pi-telegram`, Tests `tests/`, `README.md`.
- Starter `~/.local/bin/pi-telegram` (Symlink), Dienst `~/.config/systemd/user/pi-telegram.service`
  (`ExecStart=%h/.local/bin/pi-telegram run`, Restart=always).
- Konfiguration `~/.config/pi-telegram/config.json` (0600; bot_token, allowed_user_ids, owner_chat_id, pi_bin,
  default_cwd, poll_timeout, idle_minutes, max_alive_processes, rate_per_minute), Zustand `state.json`
  (Sitzungen je Chat + Leseoffset). Ablageort per `PI_TELEGRAM_HOME` umleitbar (Tests tun das).
- Einmalig durch den Nutzer: Bot bei @BotFather anlegen → `pi-telegram setup` im Terminal (Token per getpass,
  landet nicht in der Shell-Historie) → dem Bot **eine Nachricht schicken** (ergibt die Chat-Id = Freischaltung;
  Bots dürfen nicht zuerst schreiben) → Dienst startet. Ohne Token legt `install` nur Starter/Dienst an.

## Ablauf einer Nachricht

`handle_update` → Freischaltung (Privatchat + `allowed_user_ids`) → `/befehl`? sonst Job → `_run_job_inner`:
Prozess für (Chat, Ordner) holen (`_proc_for`: kalt = starten + Sitzung adoptieren; Sitzungswechsel =
`switch_session`/`new_session`), Statusnachricht „⏳ denkt …“, `prompt` senden, Ereignisse sammeln
(`message_end` Assistententext, `tool_execution_start` → Status, `agent_settled` → `_settle`), Antwort ersetzt
die Statusnachricht (`md.chunks`, Telegram-HTML). Beschäftigt → Warteschlange mit Positionsmeldung.
Dialoge (`extension_ui_request` select/confirm/input/editor) → Nachricht mit Tasten (callback_data
`d:confirm:1|0`, `d:select:<i>`) oder Textantwort → `extension_ui_response` `{id, confirmed|cancelled|value}`.

## Ändern und prüfen

1. Eigener Worktree (`wt switch -c`), dann ruff über `~/.pi-lens/pip-tools/bin/ruff` (nicht im PATH):
   `ruff format pi_telegram tests && ruff check --fix --unsafe-fixes pi_telegram tests` – Projekt-Config in
   `pyproject.toml` (select ALL) nötig, sonst entfernt ruff `# noqa`-Kommentare als „unused“.
2. `python3 -m unittest discover -s tests` (Fakes in `tests/fakes.py`: FakeTelegram zeichnet auf, FakePi spielt
   RPC mit `auto_reply`/`reply(text)`/`model_input`; `make_bridge(root, **cfg)`).
3. `python3 -m tests.live_check [Ordner]` = echtes pi + nachgebautes Telegram, fünf Schritte mit Zeitangabe;
   `python3 -u -m tests.live_check_image <bild>` für den Bildweg (Modell mit und ohne Bild-Input).
4. Commit im Repo; Dienst neu starten (`pi-telegram restart`) – der Starter zeigt per Symlink aufs Repo.

Regeln aus Skill python-script-authoring gelten (kein `except Exception`, `check=False` explizit, typisierte
Fehler, Zeilen ≤ 120).

## RPC-Fakten (pi 1.6.1, docs/rpc*.md im nix-Store-Paket)

- Start `pi --mode rpc [--session Datei] [--name Name]`, strikt JSONL **nur an LF** trennen (`bytes.readline`),
  stdout kontinuierlich lesen, stderr nie als Protokoll, Diagnose dort.
- `prompt` → `{"disposition": "started"|"queued"|"handled"}`; „handled“ = kein Lauf (Extension-Kommando) →
  2 s Schonfrist, dann erledigen. Ende erst bei `agent_settled` (nach `agent_end` kommen Retry/Compaction/
  Follow-up). `images` = base64 + mimeType. Während eines Laufs nur `steer`/`follow_up` oder Extension-Kommandos.
- Kaltstart mit allen Erweiterungen ca. 7 s (bigpowers, pi-lens, MCP); Antworten 10–20 s – Statusmeldungen sind
  Pflicht. `get_state` liefert sessionFile/sessionId/isStreaming/model/thinkingLevel; `switch_session` braucht
  `{"sessionPath": …}`; `set_session_name` `{"name": …}`.
- `extension_ui_request` blockiert Pi bis zur Antwort; `timeout` in ms → Rechtzeitig antworten oder verfällt.
  Startup-Flut: `notify`-Meldungen („80 skills loaded“, Hinweise) kommen **vor** dem ersten `prompt` und bei
  jedem `new_session`/Neustart – Brücke unterdrückt sie per `chat.quiet`, aber nur bis der Prozess steht
  (`quiet = False` direkt nach `_proc_for`, nicht erst nach der `prompt`-Antwort): Meldungen zwischen
  `get_state` und `prompt`-Antwort sind schon Auftragsmeldungen (z. B. der Bild-Hinweis unten).
- Bilder: `get_state.model.input` sagt, ob das Modell Bilder versteht. Ohne Bild-Input greift die Erweiterung
  `image-paste` (Skill image-ocr-fallback): sie beschreibt per Vision-Modell und meldet das mit
  `notify` „image-paste: N Bild(er) als Text für <Modell> (via <Vision-Modell>)“ **vor** der `prompt`-Antwort.
  Die Brücke zeigt das als Statuszeile (`IMAGE_NOTE` in bridge.py) statt als 🔔-Nachricht. `setWorkingMessage`
  der Erweiterung ist im RPC-Modus ein No-Op – die Fortschrittsanzeige macht die Brücke selbst.

## Stolperfallen

- Sitzungs adoptieren: nach `_adopt_session(new=False)` muss `_attached[key] = session.name` **nach** dem
  Adoptieren gesetzt werden, sonst lädt der zweite Auftrag die Sitzung noch einmal (switch auf dieselbe Datei).
- Pipes: Python-`print` ist blockgepuffert, Kindprozesse (systemctl) schreiben sofort – Ausgabereihenfolge in
  Protokollen täuscht; beim Testen `python3 -u` oder `flush=True`.
- `systemctl --user daemon-reload` duldet keinen Unit-Namen – `_systemctl` hängt `UNIT_NAME` nur bei
  Unit-Verben an.
- Telegram zählt UTF-16-Einheiten (Emoji = 2), Limit 4096 → `utf16_cut`, CHUNK_LIMIT 3800; HTML nur mit
  `html.escape(quote=False)`, ein Stück darf nie mitten im Tag/Codeblock enden (`md._hard_split`/`_cut_long_line`).
- `pi --mode rpc` nutzt denselben Sitzungsordner `~/.pi/agent/sessions/<cwd>--/` wie das Terminal →
  Terminal-Sitzungen sind per `/wechsel` fortsetzbar; Prozesse je (Chat, realpath(cwd)).
- Base64-Testdaten: `\xff\xd8jpeg` ergibt `/9hq…`, nicht `/9j` – Bytes mit `\xff\xd8\xff` nehmen.
- `--user`-Dienst erbt den systemd-Nutzer-PATH (mise-Shims, ~/.nix-profile/bin) – `pi_bin` deshalb als
  absoluten Pfad (`default_pi_bin()` bevorzugt `~/.nix-profile/bin/pi`).
- Nebenläufige Befehle am pi-Prozess (/modell, /denken, /kompakt, /letzte) laufen über `_run_command` und
  erhöhen `chat.commands`: ein Auftrag, der direkt hinter `/modell` kommt, wird sonst vor `set_model`
  ausgeführt (Wettlauf → falsches Modell, Bild nicht beschrieben). Neuer nebenläufiger Befehl: immer
  `_pool.submit(self._run_command, chat, self._cmd_x, …)`, nie `_cmd_x` direkt.
- Telegram-Dateinamen lügen: PNG als „photo.jpg“. Bildformat aus den Bytes lesen (`sniff_image`), als Datei
  geschickte Fotos sind unkomprimiert und groß → über 1,5 MB per ImageMagick verkleinern (`shrink_image`,
  Kante höchstens 2000), sonst lehnt die Modell-API ab.
- Test mit echtem Bild: `magick -background white -fill black -font Adwaita-Sans -pointsize 30 -size 560x
  caption:'…' /tmp/tg-bild.png` und `python3 -u -m tests.live_check_image /tmp/tg-bild.png` (Font
  „DejaVu-Sans“ fehlt hier). glm-5.3 hat keinen Bild-Input, glm-5.4 schon – beide Fälle prüfen.
- Reader-Thread: Wrappersignaturen exakt übernehmen (`_settle(self, chat, aborted, *, handled=False)`) – ein
  TypeError im RPC-Leser-Thread hinterlässt einen hängenden Chat ohne Fehlermeldung im Journal.

## Typische Störungen

| Symptom | Ursache / Handgriff |
|---|---|
| keine Antwort, Journal „401 Unauthorized“ | Token falsch → `pi-telegram setup --reallow` |
| Nachricht bleibt unbeantwortet, Journal „403 … bot can't initiate conversation“ | Konto nicht freigeschaltet → dem Bot zuerst schreiben, Id per `pi-telegram status` prüfen, `pi-telegram allow <Id>` |
| „❌ Pi wurde beendet (Exit N)“ | Erweiterung/Modell lief nicht; `pi-telegram logs -f`, im selben Ordner `pi` im Terminal probieren |
| Statusnachricht bleibt stehen | Prozess hängt → `/stopp`, sonst `pi-telegram restart` (Sitzung bleibt erhalten) |
| viele „🔔 Hinweis“ | `chat.quiet` greift nur bis der Prozess steht – Meldung aus der Startphase einordnen: auftragsrelevant (Statuszeile) oder unterdrücken |
| Antwort vom falschen Modell, Bild wird trotz fehlendem Bild-Input nicht beschrieben | Befehl und Auftrag liefen parallel → Befehle nur über `_run_command`, `/modell` muss vor dem Auftrag fertig sein |

## Erweitern

Neuer Brücken-Befehl: `_cmd_<name>` in `bridge.py` + Verzweigung in `_command` + HELP-Text (HTML-escaped!) +
README-Tabelle + Test in `tests/test_bridge.py` (FakePi, `wait_until`). Neues Ereignis: `_on_event`-Zweig.
Neues Zielkonto: `pi-telegram allow <Id>`. Sprach- und Videonachrichten sind nicht umgesetzt: den
Spracherkennungs-Motor nicht selbst wählen (lokal oder API ist eine Nutzerentscheidung; Auswahlkriterien und
Messverfahren in Skill selfhosted-speech-stack), erst nach der Entscheidung bauen.
