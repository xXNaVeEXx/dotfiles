---
name: pi-telegram-bridge
description: "Die eigene Telegram-Brücke für den Pi-Coding-Agent einrichten, warten und erweitern (Repo ~/projects/pi-telegram, Starter ~/.local/bin/pi-telegram, systemd-User-Dienst pi-telegram) – RPC-Unterprozess, Warteschlange, Dialoge per Tasten, Sitzungen, Tests ohne Netz, Live-Prüfung; use when the Telegram bridge for Pi shall be set up or changed, the bot does not answer or spams, a Telegram account shall be allowed, or pi is to be driven via RPC mode (pi --mode rpc) from Python."
---

# pi-telegram-bridge

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
2. `python3 -m unittest discover -s tests` (31 Tests, Fakes in `tests/fakes.py`: FakeTelegram zeichnet auf,
   FakePi spielt RPC mit `auto_reply`/`reply(text)`; `make_bridge(root, **cfg)`).
3. `python3 -m tests.live_check [Ordner]` = echtes pi + nachgebautes Telegram, fünf Schritte mit Zeitangabe.
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
  jedem `new_session`/Neustart – Brücke unterdrückt sie per `chat.quiet` bis zum ersten Auftrag.

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

## Typische Störungen

| Symptom | Ursache / Handgriff |
|---|---|
| keine Antwort, Journal „401 Unauthorized“ | Token falsch → `pi-telegram setup --reallow` |
| Nachricht bleibt unbeantwortet, Journal „403 … bot can't initiate conversation“ | Konto nicht freigeschaltet → dem Bot zuerst schreiben, Id per `pi-telegram status` prüfen, `pi-telegram allow <Id>` |
| „❌ Pi wurde beendet (Exit N)“ | Erweiterung/Modell lief nicht; `pi-telegram logs -f`, im selben Ordner `pi` im Terminal probieren |
| Statusnachricht bleibt stehen | Prozess hängt → `/stopp`, sonst `pi-telegram restart` (Sitzung bleibt erhalten) |
| viele „🔔 Hinweis“ | `chat.quiet` umgangen (neue Ereignisquelle) → nur nach erstem Auftrag weiterleiten |

## Erweitern

Neuer Brücken-Befehl: `_cmd_<name>` in `bridge.py` + Verzweigung in `_command` + HELP-Text (HTML-escaped!) +
README-Tabelle + Test in `tests/test_bridge.py` (FakePi, `wait_until`). Neues Ereignis: `_on_event`-Zweig.
Neues Zielkonto: `pi-telegram allow <Id>`. Void-/Voice-Nachrichten sind bewusst nicht umgesetzt.
