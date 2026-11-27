---
name: pi-telegram-bridge
description: "Die eigene Telegram-Brücke für den Pi-Coding-Agent einrichten, warten und erweitern (Repo ~/projects/pi-telegram, Starter ~/.local/bin/pi-telegram, systemd-User-Dienst pi-telegram) – RPC-Unterprozess, Warteschlange, Dialoge per Tasten, Sitzungen, Tests ohne Netz, Live-Prüfung; use when the Telegram bridge for Pi shall be set up or changed, the bot does not answer or spams, a Telegram account shall be allowed, or pi is to be driven via RPC mode (pi --mode rpc) from Python, or a tool call needs the user's Telegram confirmation (Schutzschild/guard) or got blocked for lack of it."
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

1. Eigener Worktree (`wt switch -c <name>` → `~/projects/pi-telegram.<name>`); der laufende Dienst nutzt den
   Haupt-Checkout – dort nie ändern, nur mergen und `pi-telegram restart`. Arbeiter bekommen den Paket-Abschnitt
   aus `docs/PLAN.md` als Brief (Architektur, Regeln, Reihenfolge). Bei beladener Maschine (Load > 10) dauert der
   Pi-Kaltstart 30–40 s: Live-Prüfungen mit großzügigen Wartezeiten (240 s) für den Kaltstart, aber eigenem kleinem Limit (≤ 90 s) und einer Protokollzeile je gesehenem Ereignis für Dialog-Warteschritte – ein verfehltes Warte-Prädikat läuft sonst stillos minutenlang; fremde Prozesse nie beenden.
   Dann ruff über `~/.pi-lens/pip-tools/bin/ruff` (nicht im PATH):
   `ruff format pi_telegram tests && ruff check --fix --unsafe-fixes pi_telegram tests` – Projekt-Config in
   `pyproject.toml` (select ALL) nötig, sonst entfernt ruff `# noqa`-Kommentare als „unused“.
2. `python3 -m tests` – niemals `python3 -m unittest discover -s tests` (ohne Top-Level überspringt das das Paket-Init, `pi_telegram.config` wird mit dem echten Ordner geladen und die Tests überschreiben die state.json des laufenden Diensts; so ging einmal die Sitzung des Nutzers verloren – seitdem wirft `tests/__init__.py` laut RuntimeError). (Fakes in `tests/fakes.py`: FakeTelegram zeichnet auf, FakePi spielt
   RPC mit `auto_reply`/`reply(text)`/`model_input`; `make_bridge(root, **cfg)`).
3. `python3 -m tests.live_check [Ordner]` = echtes pi + nachgebautes Telegram, fünf Schritte mit Zeitangabe;
   `python3 -u -m tests.live_check_image <bild>` für den Bildweg (Modell mit und ohne Bild-Input).
4. Commit im Repo; Dienst neu starten (`pi-telegram restart`) – der Starter zeigt per Symlink aufs Repo.
   Neustart nur bei ruhigem Bot (Journal ohne laufenden Auftrag, keine offene Statuszeile): mitten im Auftrag
   verliert der Neustart die Antwort.

Regeln aus Skill python-script-authoring gelten (kein `except Exception`, `check=False` explizit, typisierte
Fehler, Zeilen ≤ 120).

## RPC-Fakten (pi 1.6.1, docs/rpc*.md im nix-Store-Paket)

Allgemeine Grundlagen und Fallstricke des RPC-Modus (Befehle, Ereignisse, Dialoge, Sitzungsdateien,
Leser-Thread, Kaltstart) stehen im Skill pi-rpc-client; hier nur das Brücken-spezifische.

- Start `pi --mode rpc [--session Datei] [--name Name]`, strikt JSONL **nur an LF** trennen (`bytes.readline`),
  stdout kontinuierlich lesen, stderr nie als Protokoll, Diagnose dort.
- `prompt` → `{"disposition": "started"|"queued"|"handled"}`; „handled“ = kein Lauf (Extension-Kommando) →
  2 s Schonfrist, dann erledigen. Ende erst bei `agent_settled` (nach `agent_end` kommen Retry/Compaction/
  Follow-up). `images` = base64 + mimeType. Während eines Laufs nur `steer`/`follow_up` oder Extension-Kommandos.
- Kaltstart mit allen Erweiterungen und Skills 7–40 s je nach Last (Erweiterungen ≈ 16 s, Skills ≈ 20 s bei
  Load 15; ohne beides 0,6 s) – er dominiert die Latenz, das warme Pi antwortet in 4–5 s. Messen: Zeit bis zur
  ersten `get_state`-Antwort, einmal normal, einmal mit `--no-extensions`/`--no-skills`. Prozess deshalb warm
  halten (beim Dienststart vorladen, Hauptsitzung nicht beenden); Antworten 10–20 s – Statusmeldungen sind Pflicht. `get_state` liefert sessionFile/sessionId/isStreaming/model/thinkingLevel; `switch_session` braucht
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
- RPC-Client: den Waiter für eine Anfrage-Id **vor** dem Schreiben eintragen. Kommt die Antwort unter Last
  schneller zurück, als der Aufrufer nach `write` weiterläuft, verwirft der Leser-Thread sie als unbekannte Id →
  Zeitüberschreitung (gemessen 1 von 300 `get_state`, nur unter Last reproduzierbar). Die ~2 Erweiterungs-
  Datensätze/s auf stdout sind normal und nicht die Ursache. Regressionstest mit einem Leser-Thread, der
  dauernd solche Datensätze sendet (`ChatterPi`); `/status` zeigt nach 5 s Stille „Modell: – (pi antwortet
  gerade nicht)“ statt zu hängen.
- Statuszeile gehört zum Auftrag: schon beim Erledigen des Auftrags aus dem Chat nehmen, sonst benutzt der
  nächste Auftrag dieselbe Nachricht und die Antwort überschreibt sie.
- Statuszeile und chat action „typing“ synchron beim Eingang senden, bevor der Prozess startet: Telegram zeigt
  „schreibt …“ am Namen nur 5 s (alle 4 s erneut senden), und synchrone Hinweise („Eingereiht“) überholen die
  Statuszeile aus dem Pool-Thread, wenn mehrere Updates in einem Abruf kommen – die Reihenfolge wirkt vertauscht.
- Trägheit messen: Die Brücken-Sitzung liegt im selben Ordner wie die eigene Terminal-Sitzung (beide cwd ~) →
  anhand Kopfzeitstempel und erstem Nutzerwunsch erkennen. Die Zeitstempel der Einträge gliedern die Wartezeit
  (Sitzungskopf = Prozessstart, `model_change`, erste Nutzernachricht = Auftrag gesendet, Assistentennachricht =
  Antwort); fehlen Auftrag-Zeilen im Journal, ist die Sitzungsdatei die einzige Zeitmessung.

## Typische Störungen

| Symptom | Ursache / Handgriff |
|---|---|
| keine Antwort, Journal „401 Unauthorized“ | Token falsch → `pi-telegram setup --reallow` |
| Nachricht bleibt unbeantwortet, Journal „403 … bot can't initiate conversation“ | Konto nicht freigeschaltet → dem Bot zuerst schreiben, Id per `pi-telegram status` prüfen, `pi-telegram allow <Id>` |
| „❌ Pi wurde beendet (Exit N)“ | Erweiterung/Modell lief nicht; `pi-telegram logs -f`, im selben Ordner `pi` im Terminal probieren |
| Statusnachricht bleibt stehen | Prozess hängt → `/stopp`, sonst `pi-telegram restart` (Sitzung bleibt erhalten) |
| viele „🔔 Hinweis“ | `chat.quiet` greift nur bis der Prozess steht – Meldung aus der Startphase einordnen: auftragsrelevant (Statuszeile) oder unterdrücken |
| Antwort vom falschen Modell, Bild wird trotz fehlendem Bild-Input nicht beschrieben | Befehl und Auftrag liefen parallel → Befehle nur über `_run_command`, `/modell` muss vor dem Auftrag fertig sein |
| „antwortet langsam“, kein „schreibt …“ am Namen | fast immer Pi-Kaltstart (20–40 s unter Last) ohne Schreib-Signal während des Starts → Sitzungsdatei nachmessen; Abhilfe: Prozess vorladen/warm halten, „typing“ ab Eingang |
| `/status` zeigt eine fremde oder leere Sitzung, neuer Chat-Ordner | `state.json` überschrieben (früher durch Tests) → Sitzungsdatei des Chats unter `~/.pi/agent/sessions/<default_cwd>--/` finden (Kopfzeitstempel, erster Nutzerwunsch), `state.json` von Hand ergänzen (`chats.<Chat-Id>.sessions.main.path`, Chat-Id aus `pi-telegram status`), `pi-telegram restart`, Journal auf „Pi für Chat … vorgewärmt“ prüfen |

## Schutzschild (telegram-guard, `extensions/telegram-guard.ts`)

Hook `tool_call` (einziger Hook vor der Ausführung; `block: true` verhindert den Aufruf, `reason` geht als Fehler ans Modell); prüft Werkzeugname plus Befehl (bash/powershell) bzw. den absolut aufgelösten Pfad (write/edit). **Nur im RPC-Modus wirksam** – in TUI/print/json läuft alles ungeprüft durch.
- Stufen: *gefährlich* fragt immer nach; *wirkungsvoll* fragt außer bei Treffer auf der Erlaubt-Liste – dazu zählt write/edit auf eine Datei außerhalb des Arbeitsordners (ctx.cwd). Wirkungsvoll-Standardmuster sind z. B. Pfade unter `…/.config/systemd/` und `rm -r …`. Listen im Ordner `PI_TELEGRAM_GUARD_DIR` (Standard `~/.config/pi-telegram`): `guard_dangerous.txt`, `guard_powerful.txt`, `guard_allow.txt`; eine vorhandene Datei ersetzt die Standardliste komplett. Muster: je Zeile ein Regex, `#` = Kommentar. In Telegram anzeigen/ändern: `/gefaehrlich`, `/wirkungsvoll`, `/erlaubt` (ohne Argument = anzeigen, `MUSTER` hinzufügen, `-MUSTER` entfernen).
- Ablauf: Dialog „Bestätigung nötig“ mit Tasten in Telegram, Zeitlimit 120 s; Nein oder keine Antwort → blockiert mit „Keine Bestätigung des Nutzers in Telegram innerhalb von 120 s“ und der Aufforderung, es nicht erneut zu versuchen. Die Frage geht immer nach Telegram, auch wenn der Nutzer gerade am Desktop sitzt – dort übersieht er sie leicht, und der Lauf wartet die vollen 120 s.
- Agentenregel für Brücken-Sitzungen: Schritte mit Bestätigungspflicht vorher ankündigen und bitten, die Telegram-Frage zu bestätigen, oder sie so bauen, dass das Muster nicht gebraucht wird (Dateien im Arbeitsordner, Auslöser ohne systemd-Unit, eigener Testordner in `/tmp` ohne `rm -r`). Nach einem Block nicht wiederholen, sondern die Alternative nehmen und den Schritt im Abschlussbericht als Frage nennen.

## Erweitern

Vor jeder Erweiterung `docs/PLAN.md` lesen (Ausbau: Fundament mit `registry.py`/`commands/core.py`/`features/<x>.py`;
Pakete Flüssigkeit, Reaktion/Zitat, Dateien/Export, Sprachnachrichten, Orte/Zeitpläne/Kontingent,
Gruppe). Ist das Fundament gemergt, ist ein neues Feature `pi_telegram/features/<x>.py` mit `register(reg)` +
Eintrag in der FEATURE-Liste + Tests. Solange nicht: neuer Brücken-Befehl = `_cmd_<name>` in `bridge.py` + Verzweigung in `_command` + HELP-Text (HTML-escaped!) +
README-Tabelle + Test in `tests/test_bridge.py` (FakePi, `wait_until`). Neues Ereignis: `_on_event`-Zweig.
Neues Zielkonto: `pi-telegram allow <Id>`. Sprach- und Videonachrichten sind nicht umgesetzt: den
Spracherkennungs-Motor nicht selbst wählen (lokal oder API ist eine Nutzerentscheidung; Auswahlkriterien und
Messverfahren in Skill selfhosted-speech-stack), erst nach der Entscheidung bauen.
