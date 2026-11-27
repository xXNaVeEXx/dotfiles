---
name: pi-telegram-bridge
description: "Die eigene Telegram-Brücke für den Pi-Coding-Agent einrichten, warten und erweitern (Repo ~/projects/pi-telegram, Starter ~/.local/bin/pi-telegram, systemd-User-Dienst pi-telegram) – RPC-Unterprozess, Warteschlange, Dialoge per Tasten, Sitzungen, Tests ohne Netz, Live-Prüfung; use when the Telegram bridge for Pi shall be set up or changed, the bot does not answer or spams, a Telegram account shall be allowed, or pi is to be driven via RPC mode (pi --mode rpc) from Python, or a tool call needs the user's Telegram confirmation (Schutzschild/guard) or got blocked for lack of it, or voice messages shall be understood or answers read aloud (Feature Stimme: /vor, /sprich), or the agent shall send the user a file (say --datei) or a sent file is unopenable on the phone, or the Telegram chat answers too slowly and the waiting time shall be measured."
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
   Teilmengen nur per `-k <Muster>` (`python3 -m tests -k dateien`): Modulnamen als Argument starten 0 Tests („NO TESTS RAN“) – das ist kein Ergebnis. Rote Tests außerhalb des eigenen Diff vor dem Merge am Ausgangsstand gegenprüfen (`git stash` → Teilmenge → `git stash pop`; gleiche Zahl = vorbestehend) und im Bericht so nennen.
   Zeitfehler der Suite nur unter Last oder nur in der vollen Suite = Zustandsleck zwischen Test-Brücken,
   kein Zeitproblem: (a) alle Test-Brücken teilten sich eine state.json → jede Brücke hat ihren eigenen Pfad
   (`make_bridge` übergibt `path`); nie `config.STATE_FILE` lesen, sondern `bridge.state.path`; (b) `State.save()`
   setzte die Zeitmarke erst nach dem Schreiben → eigener Schreibvorgang galt als fremde Änderung →
   `State.reload_if_changed()` vergleicht Inhalte; (c) `BridgeCase.setUp` legt die Brücke sofort an und ihr
   tick-Thread läuft los – Unterklassen, die `config.CONFIG_FILE` o. ä. patchen, müssen ERST patchen und DANN
   `self.bridge, self.tg = self.new_bridge()` aufrufen (Modul-Caches je Test zurücksetzen); (d) `close()` wartet
   auf den tick-Thread. Beweis führen mit 3 Prozessen parallel (je 8 Läufe) und einer Spur je Test (Hooks und
   `Config.load/save` umhüllen, Zeit/Thread/Aufrufer in eine Datei), nicht mit Einzelläufen.
3. `python3 -m tests.live_check [Ordner]` = echtes pi + nachgebautes Telegram, fünf Schritte mit Zeitangabe;
   `python3 -u -m tests.live_check_image <bild>` für den Bildweg (Modell mit und ohne Bild-Input).
4. Commit im Repo; Dienst neu starten (`pi-telegram restart`) – der Starter zeigt per Symlink aufs Repo.
   Neustart nur bei ruhigem Bot (Journal ohne laufenden Auftrag, keine offene Statuszeile): mitten im Auftrag
   verliert der Neustart die Antwort. `config.json` liest die Brücke nur beim Start (heiß gelesen werden allein die
   Sperren-Schlüssel in `features/sperre.py`) – nach Änderungen an der Konfiguration neu starten.

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
- Unerwartete Ausnahme im Arbeitspool (z. B. `FileNotFoundError` beim Prozessstart): `_run_job` fing nur
  `RpcError`, der Executor verschluckt alles andere → Auftrag blieb für immer „pending“ (Nutzer sieht ewig eine
  Statuszeile, Test wartet 20 s). Jetzt `except Exception` → `_fail(…)` mit „❌ Interner Fehler der Brücke“;
  Regressionstest `BrokenPi` in tests/test_bridge.py. Hängt ein Auftrag ohne Journalzeile: Ausnahme im Pool vermuten.
- Reaktionen des Bots: Telegram nimmt nur bestimmte Emoji (🤔 und 👀 ja; 🕓, ⏳, 📋 → `Bad Request:
  REACTION_INVALID`). `Telegram.react()` fängt den Fehler selbst und protokolliert nur – Aufrufe wirken
  erfolgreich. Emoji immer direkt an der Schnittstelle beweisen (urllib `setMessageReaction`, danach mit
  `reaction: []` zurücksetzen, Pausen einhalten – sonst 429 oder Verbindungsabbrüche).
- Erweiterung für Terminal-Meldungen (`pi-telegram install`) nie als Verweis in `~/.pi/agent/extensions/`: pi-sync nimmt nur echte Dateien mit und löscht beim Zurückholen alles, was im dotfiles-Klon fehlt – der Verweis wäre nach dem nächsten Timer-Lauf still weg. Dauerhaft nur eine reguläre Ladedatei, die die Erweiterung aus dem Repo lädt, wo sie liegt (Rechner ohne Repo: still).
- Dienst-Kontext prüfen, ohne den Dienst zu stören: `systemd-run --user --quiet --wait --pipe --collect
  -E PYTHONPATH=<Repo> python3 -c '…'` (PATH, Wayland-Socket-Rückfall für grim).
- `tsc` liegt nur im nix-Store (nicht im PATH der Agenten-Shell): Node-Prüfskripte mit Typprüfung starten mit
  `TSC=$(ls /nix/store/*-typescript-5.9.3/bin/tsc | head -1) node tools/<check>.ts`.
- ruff format macht aus einem freistehenden mehrzeiligen Text (`"""…"""`) nach einer Zuweisung eine verkettete
  Zeichenkette (`""" ""`): Erklärungen zu Konstanten als `#`-Kommentare schreiben.
- Anderer Rechner (`/maschine`, Config `machines`): Fern-Pi hinter `ssh -o BatchMode=yes -o ServerAliveInterval=15
  -o ServerAliveCountMax=3 -o ConnectTimeout=10 [-l user] <host> "cd <Ordner> && <pi_bin> --mode rpc"`; Schutzschild
  und `/foto` nur lokal; Sitzungen und Dateien des Zielrechners per `find`/`base64` über ssh; dort muss `auth.json`
  vorhanden sein (einmal kopieren, 0600).
- Statuszeile gehört zum Auftrag: schon beim Erledigen des Auftrags aus dem Chat nehmen, sonst benutzt der
  nächste Auftrag dieselbe Nachricht und die Antwort überschreibt sie.
- Statuszeile und chat action „typing“ synchron beim Eingang senden, bevor der Prozess startet: Telegram zeigt
  „schreibt …“ am Namen nur 5 s (alle 4 s erneut senden), und synchrone Hinweise („Eingereiht“) überholen die
  Statuszeile aus dem Pool-Thread, wenn mehrere Updates in einem Abruf kommen – die Reihenfolge wirkt vertauscht.
- Trägheit messen: Die Brücken-Sitzung liegt im selben Ordner wie die eigene Terminal-Sitzung (beide cwd ~) →
  anhand Kopfzeitstempel und erstem Nutzerwunsch erkennen. Die Zeitstempel der Einträge gliedern die Wartezeit
  (Sitzungskopf = Prozessstart, `model_change`, erste Nutzernachricht = Auftrag gesendet, Assistentennachricht =
  Antwort); fehlen Auftrag-Zeilen im Journal, ist die Sitzungsdatei die einzige Zeitmessung.
- Wo die Wartezeit wirklich sitzt, zeigt die Sitzungsdatei in 30 s (JSONL, `type: message`, Rollen `user`/`assistant`/`toolResult`): auf das Modell gewartet = Zeitstempel Assistent − vorheriger Eintrag, Werkzeugzeit = Zeitstempel toolResult − Assistent, Denkmenge = Länge der `thinking`-Blöcke, Kontext = `usage.input`, Denkstufe im Eintrag `thinking_level_change`. Sitzen > 90 % in den Modellrunden (≈ 30 s je Runde), helfen nur Denkstufe, weniger Runden und kürzerer Kontext – nicht die Werkzeuge. Läufe ohne Nutzwunsch (CUSTOM_MESSAGE „AUTONOMOUS REVIEW TURN“ des Lernsystems, danach Assistentenrunden mit skill_manage/memory) blockieren die Warteschlange wie ein Auftrag: die nächste Nachricht wartet minutenlang (Journal „automatischer Lauf gestartet“). Hebel: `/denken medium` (bis zum Umbau nur englische Stufen; die Stufe gilt je Sitzung, `/neu` fällt auf die Modell-Vorgabe zurück), Lernläufe für neue Aufträge unterbrechen und Stufe dauerhaft setzen (Paket K in docs/PLAN.md), `/neu` bei neuem Thema.

## Typische Störungen

| Symptom | Ursache / Handgriff |
|---|---|
| keine Antwort, Journal „401 Unauthorized“ | Token falsch → `pi-telegram setup --reallow` |
| Nachricht bleibt unbeantwortet, Journal „403 … bot can't initiate conversation“ | Konto nicht freigeschaltet → dem Bot zuerst schreiben, Id per `pi-telegram status` prüfen, `pi-telegram allow <Id>` |
| „❌ Pi wurde beendet (Exit N)“ | Erweiterung/Modell lief nicht; `pi-telegram logs -f`, im selben Ordner `pi` im Terminal probieren |
| Statusnachricht bleibt stehen | Prozess hängt → `/stopp`, sonst `pi-telegram restart` (Sitzung bleibt erhalten) |
| viele „🔔 Hinweis“ | `chat.quiet` greift nur bis der Prozess steht – Meldung aus der Startphase einordnen: auftragsrelevant (Statuszeile) oder unterdrücken |
| Antwort vom falschen Modell, Bild wird trotz fehlendem Bild-Input nicht beschrieben | Befehl und Auftrag liefen parallel → Befehle nur über `_run_command`, `/modell` muss vor dem Auftrag fertig sein |
| „antwortet langsam“, kein „schreibt …“ am Namen | fast immer Pi-Kaltstart (20–40 s unter Last) ohne Schreib-Signal während des Starts → Sitzungsdatei nachmessen; Abhilfe: Prozess vorladen/warm halten, „typing“ ab Eingang. Runden von ~30 s dagegen: Denkstufe `high` (`/denken medium`), Lernlauf des Lernsystems blockiert die Warteschlange, Kontext > 80 000 Token (`/neu`), Last > 15 durch andere Agenten (auch das warme Pi braucht dann 60 s) |
| `/status` zeigt eine fremde oder leere Sitzung, neuer Chat-Ordner | `state.json` überschrieben (früher durch Tests) → Sitzungsdatei des Chats unter `~/.pi/agent/sessions/<default_cwd>--/` finden (Kopfzeitstempel, erster Nutzerwunsch), `state.json` von Hand ergänzen (`chats.<Chat-Id>.sessions.main.path`, Chat-Id aus `pi-telegram status`), `pi-telegram restart`, Journal auf „Pi für Chat … vorgewärmt“ prüfen |
| Datei am Handy „unbekannter Dateityp“ | Textdatei mit anderer Endung (.conf, .service, .log, .nix …): Telegram und das Handy wählen die öffnende App nach der Endung. `Telegram.send_file` schickt lesbaren Text deshalb als `<Name>.txt` mit `text/plain` (`tg.openable_document`; `.txt` und `.pdf`, `.html`, `.ics` … behalten Name und Typ) – gilt für die Taste „📎 Datei schicken“, `/sende` und `pi-telegram say "<Text>" --datei <Pfad>` (so schickt der Agent dem Nutzer eine Datei). Kleine Textdateien gleich als Codeblock in die Antwort setzen: nennt sie nur den Pfad, bietet die Brücke darunter die Taste an – und der Nutzer klickt sie. Neuer Versandweg immer über `send_file`/`send_document`, nie direkt `_upload`; das FakeTelegram der Tests bildet die Regel nicht ab (prüfen am Anfragekörper wie in `TestUpload`). Nach der Reparatur Dienst neu starten – der laufende Prozess versendet sonst nach alter Regel. Beweis: Rückgabe von `send_file` (`document.file_name`, `document.mime_type`). |

## Schutzschild (telegram-guard, `extensions/telegram-guard.ts`)

- Arbeitsweise je Chat: `/schutz auto|gefaehrlich|strikt` (Feature `features/schutz.py`; Config `schutz` = Vorgabestufe, Standard strikt; `schutz_frist` = Sekunden, Standard 20, 0 = sofort). *auto* = keine Rückfrage: gefährliche Befehle laufen nach der Frist mit einer Warnung und der Taste „❌ Abbrechen“ weiter, wirkungsvolle ohne Nachricht, fremde Dialoge (confirm/select/input/editor) beantwortet die Brücke sofort mit einer Info-Zeile; *gefaehrlich* = nur gefährliche fragen; *strikt* = alles fragt. Die Stufe steht je Chat in state.json und in `schutz.json` (Ordner der Schutzschild-Listen, sonst Config-Ordner) und gelangt per `PI_TELEGRAM_SCHUTZ_DATEI`, `PI_TELEGRAM_CHAT_ID`, `PI_TELEGRAM_SCHUTZ` in den pi-Prozess; Schutzschild-Dialoge erkennt die Brücke am Titelvorspann „🛡 “ (Konstante beidseitig, Test vergleicht). `PI_TELEGRAM_NO_GUARD=1` (systemd-Drop-in) schaltet die Erweiterung ganz aus – nur vorübergehend; Drop-in nach dem Umstellen auf `/schutz auto` wieder entfernen (config.json liest die Brücke nur beim Start).

Hook `tool_call` (einziger Hook vor der Ausführung; `block: true` verhindert den Aufruf, `reason` geht als Fehler ans Modell); prüft Werkzeugname plus Befehl (bash/powershell) bzw. den absolut aufgelösten Pfad (write/edit). **Nur im RPC-Modus wirksam** – in TUI/print/json läuft alles ungeprüft durch.
- Stufen: *gefährlich* fragt immer nach; *wirkungsvoll* fragt außer bei Treffer auf der Erlaubt-Liste – dazu zählt write/edit auf eine Datei außerhalb des Arbeitsordners (ctx.cwd). Wirkungsvoll-Standardmuster sind z. B. Pfade unter `…/.config/systemd/` und `rm -r …`. Listen im Ordner `PI_TELEGRAM_GUARD_DIR` (Standard `~/.config/pi-telegram`): `guard_dangerous.txt`, `guard_powerful.txt`, `guard_allow.txt`; eine vorhandene Datei ersetzt die Standardliste komplett. Muster: je Zeile ein Regex, `#` = Kommentar. In Telegram anzeigen/ändern: `/gefaehrlich`, `/wirkungsvoll`, `/erlaubt` (ohne Argument = anzeigen, `MUSTER` hinzufügen, `-MUSTER` entfernen).
- Ablauf: Dialog „Bestätigung nötig“ mit Tasten in Telegram, Zeitlimit 120 s; Nein oder keine Antwort → blockiert mit „Keine Bestätigung des Nutzers in Telegram innerhalb von 120 s“ und der Aufforderung, es nicht erneut zu versuchen. Die Frage geht immer nach Telegram, auch wenn der Nutzer gerade am Desktop sitzt – dort übersieht er sie leicht, und der Lauf wartet die vollen 120 s.
- Agentenregel für Brücken-Sitzungen: Schritte mit Bestätigungspflicht vorher ankündigen und bitten, die Telegram-Frage zu bestätigen, oder sie so bauen, dass das Muster nicht gebraucht wird (Dateien im Arbeitsordner, Auslöser ohne systemd-Unit, eigener Testordner in `/tmp` ohne `rm -r`). Nach einem Block nicht wiederholen, sondern die Alternative nehmen und den Schritt im Abschlussbericht als Frage nennen.

## Erweitern

Vor jeder Erweiterung `docs/PLAN.md` lesen. Das Fundament ist gemergt (`registry.py`, `commands/core.py`,
`features/<x>.py`; Features: komfort, reaktionen, dateien, sperre, sitze, rechner, stimme). Neues Feature =
`pi_telegram/features/<x>.py` mit `register(reg)` + Eintrag in `FEATURES` (`features/__init__.py`), bei Bedarf
neues Ereignis in `registry.EVENTS`, Befehle per `reg.command(...)`, Tests in `tests/test_<x>.py`.
Pakete bauen Arbeiter in eigenen Worktrees (agent „worker“; Brief = Paketzeile aus PLAN + Ziele + DATEI-GRENZEN
+ REGELN: kein push/merge, `python3 -m tests` + ruff vor jedem Commit, Betreff ≤ 72 Zeichen, keine echten
Telegram-Nachrichten, Abschlussbericht ≤ 20 Zeilen). Abnahme: Diff lesen, Tests + ruff im Worktree, Merge
`--no-ff` nach main, Tests auf main, Neustart bei ruhigem Bot, Journal auf „Befehlsmenü mit N Befehlen gesetzt“.
Erwartete Konflikte beim Merge paralleler Pakete: `FEATURES`-Liste, `EVENTS`-Tuple, README (Befehlstabelle,
Config-Zeilen, Zeile `# N Tests`), PLAN-Zeilen → Vereinigung; Auflöse-Skript und `git add && git commit` in
EINER `&&`-Kette und Konfliktmarker vor dem Commit zählen (ein abgebrochenes Skript + separate Commit-Zeile hat
einmal Marker committet). Wächter nie durch Rohre führen (`ruff check | tail` maskiert den Exit-Code). Arbeiter starten mit `subagent`: `label` ist ein eigenes Feld neben `options`, nicht darin (sonst Abbruch vor dem Start). Der Telegram-Pi arbeitet selbst im Repo (eigener Worktree, mergest nach main): vor eigenem Merge und Neustart `wt list` und `git log --oneline -3 main` prüfen; Neustart erst, wenn sein Auftrag beendet ist.
Zeitüberschreitung eines Arbeiters: uncommittete Arbeit sichern, `main` hinein mergen, selbst fertigstellen –
und Arbeiter früh steuern, wenn sie einem Zeitfehler der Suite nachjagen (Ursachen unter „Ändern und prüfen“).
Was der Arbeiter zuletzt tat, zeigt seine Sitzungsdatei (JSONL unter
`~/.pi/agent/sessions/--home-gamzat--/<eigene Sitzung>/<Lauf-Id>/run-0/session.jsonl`; je Zeile `message.role` und
`content[]` mit `type` toolCall, `name`, `arguments`): die letzten Werkzeugaufrufe lesen und genau dort
weitermachen – zweimal lag nach 90 min nur noch README, Plan oder Prüfskript offen.
Neues Zielkonto: `pi-telegram allow <Id>`. Sprache: Werkzeuge `tools/stt` (Parakeet v3 int8,
Umgebung `~/.local/share/pi-telegram/stt-env`) und `tools/tts` (Supertonic 3, Modellordner des Nutzers) sind
gebaut und als Paket „Stimme“ eingebaut (`features/stimme.py`: Sprachnachrichten über den Hook `attachment` →
`tools/stt` → Auftrag, `/vor`, `/vor immer|aus`, `/sprich <Text>`; Config `stt_command`, `tts_command`,
`ffmpeg_command`); im Auftrag kündigt die Zeile „🎤 Sprachnachricht (automatisch umgeschrieben, kleine Erkennungsfehler möglich):“ gesprochene Eingaben an – mit Erkennungsfehlern rechnen und nie von „nicht eingebaut“ ausgehen, ohne rekursiv im Code gesucht zu haben (`grep -rn <Muster> pi_telegram`, Features liegen im Unterordner).
Messwerte und Stolperfallen (Opus-Dateien werden schlechter erkannt als WAV, Teilstücke kippen
ins Englische; Telegram verlangt Ogg Opus; 110 s je Stück; Kette im Dienstkontext mit `systemd-run` und
`PATH=/usr/bin:/bin` prüfen) in `docs/fakten/spracherkennung.md` und `docs/fakten/sprachausgabe*.md`. Ansichten
(OpenUI): pi-Seite und Brückenseite auf main und im Dienst (`extensions/telegram-ansicht.ts`, Werkzeug
`telegram_ansicht`; `pi_telegram/ansichten.py` lauscht nur auf 127.0.0.1:8797, Id unratbar, Eingaben nur mit
geprüfter `initData`). Der Taste fehlt noch die HTTPS-Adresse: `tailscale serve --bg 8797` endet ohne root mit
„Access denied: serve config denied“ – der Nutzer setzt einmalig `sudo tailscale set --operator=$USER`, danach
`tailscale serve --bg 8797`, in config.json `"ansicht_basis": "https://<Rechner>.<Tailnet>.ts.net"`, Neustart,
Handy-Test (Handy braucht die Tailscale-App). Fakten in `docs/fakten/ansichten.md`.
