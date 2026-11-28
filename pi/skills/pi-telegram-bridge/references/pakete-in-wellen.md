# Mehrere Pakete gleichzeitig bauen lassen und ausrollen

Gilt, wenn der Nutzer mehrere Funktionen auf einmal bestellt. Arbeiter bauen, die Hauptsitzung nimmt ab,
mergt, rollt aus und meldet sich per Telegram.

## 1. Vor dem Schneiden der Pakete

1. Stand prüfen: `git -C ~/projects/pi-telegram log --oneline -3 main`, `wt list`, Dienst aktiv, Bot ruhig.
2. Rechner prüfen (`nproc`, `uptime`, `free -g`): bei Last nahe der Kernzahl oder belegtem Swap höchstens
   3–4 Arbeiter gleichzeitig, den Rest als zweite Welle auf dem gemergten Stand.
3. Kontingent beim Modell-Anbieter mitrechnen: Die Grenze gilt für das ganze Konto, über alle Sitzungen des
   Rechners hinweg (andere Leitstände zählen mit). Vier Arbeiter auf einem Anbieter liefen zwei Stunden
   durch; acht (zweite Welle dazu) endeten nach rund 25 Minuten alle gleichzeitig mit
   `HTTP 424 … "code":"bili_throttle_terminal" …`, davor `This request would exceed your account's rate
   limit`. Deshalb höchstens drei Arbeiter auf demselben Anbieter, den Rest auf den zweiten Anbieter legen
   (je Aufgabe `model`, z. B. `anthropic/claude-fable-5-2:high` und `zai-coding-cn/glm-5.4:high`); weitere
   starten, sobald einer fertig ist. Grund: ein gemeinsamer Anbieter macht alle Arbeiter zu einem einzigen
   Ausfallpunkt, und die Leitstands-Sitzung stirbt meist mit.
4. Hängt eine Funktion an der Telegram-Schnittstelle, zuerst das Änderungsprotokoll lesen
   (`fetch_content https://core.telegram.org/bots/api-changelog`, mit `findText` gezielt suchen) und den Bot
   selbst fragen (`getMe`, Token nie ausgeben). Grund: Die Schnittstelle wächst schnell; eine aus dem Gedächtnis
   geplante Umgehung (z. B. eigene Gruppe für Themen) ist oft schon überholt, und Schalter am Bot stehen
   ab Werk auf „aus“.
5. Bestand des Nutzers erkunden, ohne Geheimnisse zu lesen (z. B. Postfächer und Server aus der
   Einstellungsdatei des Mail-Programms, nicht dessen Passwortspeicher). Zugangsdaten gibt der Nutzer einmal
   selbst ein (Terminal mit getpass oder ein Dialog, dessen Nachricht sofort gelöscht wird und nie an pi geht).
6. Wellen so schneiden, dass Pakete mit Kern-Umbau (Senden, Warteschlange, Zustand je Chat) in der ersten
   Welle liegen und alle anderen Pakete nur über `ctx.send`/`bridge.send` und `bridge.enqueue` gehen – dann
   greift der Umbau später ohne Nacharbeit in jedem Paket.
7. Für spätere Wellen vorab die Anker in der echten Umgebung ansehen, auf die ein Paket baut (Aufbau fremder
   Zustandsordner an einem echten Beispiel, vorhandene Hilfsprogramme, Stellen im Kern) und im Auftrag als
   Fakten nennen – der Arbeiter rät sonst das Format.

## 2. Aufträge

- Je Paket ein Worktree (`cd ~/projects/pi-telegram && wt switch -c <name>`) und eine Datei `.pi/AUFTRAG.md`
  darin (`.pi/` erfasst git nicht). Der Aufgabentext des Arbeiters lautet nur „Lies .pi/AUFTRAG.md und
  arbeite sie ab“.
- Gemeinsame Regeln EINMAL schreiben (eigene Datei außerhalb von /tmp) und per `cat >>` an jede Auftragsdatei
  hängen. Inhalt: nur eigener Worktree; kein push/merge/systemctl/`pi-telegram restart`; nur
  Standardbibliothek; nie `~/.config/pi-telegram`, keine echten Nachrichten oder Konten; `python3 -m tests`
  mit Ausgabe in eine Datei unter `.tmp/`; ruff vor jedem Commit; früh und oft committen; Hintergrundarbeit
  nie im `tick`-Hook selbst; eigene Threads enden bei `shutdown`; Befehlsnamen nur a–z, 0–9, `_` (Umlaut als
  Alias); Tasten-Präfix mit `rg 'reg.callback\(' pi_telegram` auf Kollision prüfen; README-Zeile „N Tests“
  nicht ändern; genau EINE neue Zeile am Ende von `FEATURES`; Schlussbericht ≤ 20 Zeilen.
- Im Auftrag stehen: Ziel in Worten, Befehle mit Beispielen, Einstellungen mit Standardwert, Grenzen
  („führt der Arbeiter nicht aus – macht die Hauptsitzung beim Ausrollen“), Prüfskript ohne Netz plus ein
  nur lesendes Prüfskript für die echte Umgebung, Dateien für Doku.
- Datei, die mehrere Pakete derselben Welle brauchen (z. B. die Schutzschild-Erweiterung): im Auftrag
  sagen, wer sie gerade ändert, und den anderen eine eigene Datei oder höchstens einen klar abgegrenzten
  Block vorschreiben – sonst entsteht beim Zusammenführen ein Konflikt mitten in sicherheitsrelevantem Code.
- Sicherheitsgrenzen ausdrücklich nennen, wo ein Paket nach außen wirkt: Versand (Mail, Merge) nur nach
  Tastendruck des Besitzers, auch im autonomen Modus; fremder Inhalt (Mail, Webseite) im Auftrag an pi klar
  als fremder Text abgegrenzt; kein Kommandozeilen-Weg, mit dem pi selbst versenden kann.
- Darf der Agent selbst aufräumen oder umsortieren (Postfach, Dateien, Ordner), gilt für die Kommandozeile,
  die er dafür bekommt: „Löschen“ heißt immer verschieben in den Papierkorb, ein Weg zum endgültigen Löschen
  existiert nicht; jeder Vorgang steht in einem Protokoll und lässt sich zurücknehmen; jeder ändernde Befehl
  kennt `--probe` (zeigt nur, was betroffen wäre); eine Obergrenze je Aufruf (Einstellung), darüber führt
  die Kommandozeile nichts aus, sondern legt dem Besitzer einen Vorschlag mit Tasten vor. Grund: der Agent
  liest dabei fremden Text, und ein eingeschleuster Satz darf keinen großen Eingriff auslösen, den niemand
  sieht. Diese selbst gesetzten Grenzen dem Nutzer in der nächsten Meldung nennen, mit dem Namen der
  Einstellung, über die er sie ändert.

## 3. Starten

`subagent` mit `workflow: "parallel"`, `async: true`, `args.tasks` (je `agent: "worker"`, `task`, `cwd`),
`label` als eigenes Feld und `options.timeoutMs` passend zur Größe (60–120 min; ohne Angabe endet der Lauf
nach 30 min mit „Subagent timed out“ mitten in der Arbeit). Danach dem Nutzer eine kurze Tabelle schicken
(Paket → was er am Handy bekommt) und die Festlegungen nennen, die er anders wollen könnte.

Gestoppte Läufe sind nicht fortsetzbar (Rate-Limit beim Anbieter, „Subagent stopped.“): `status` meldet
„Resume: unavailable; stopped runs are not resumable“. Dann frisch starten und je Worktree eine Datei
`.pi/FORTSETZUNG.md` schreiben. Inhalt: Ursache des Abbruchs; Teilstand beim Abbruch (`git status --short`,
`git diff --stat`, Zeilenzahl der neuen Dateien, letzter Satz des Vorgängers aus seiner Sitzungsdatei);
Reihenfolge (Auftrag lesen → Teilstand lesen → `python3 -m tests` und ruff → Teilstand committen → fehlende
Schritte bauen); ein jq-Einzeiler für die letzten Werkzeugaufrufe der alten Sitzungsdatei (`select(…
"toolCall" …) | cut -c1-400 | tail -25`). Aufgabentext: zuerst FORTSETZUNG, dann AUFTRAG. Grund: Der neue
Arbeiter hat keinen Verlauf und fängt ohne die Datei von Null an oder verwirft fremde Teilarbeit.

Nachsteuern eines laufenden Arbeiters (auch: der Nutzer wünscht sich mitten im Bau etwas dazu): Nachtrag
als Datei `.pi/NACHTRAG.md` in seinen Worktree legen (erste Zeile: erst den laufenden Baustein committen,
dann den Nachtrag) und per `subagent({action:"steer", id:<Kind-Id>, options:{mode:"follow_up"}})` darauf
hinweisen. „Steering queued“ heißt nur eingereiht: `subagent({action:"status", id})` zeigt in der Zeile
`Steering: … pending … delivered`, ob der Hinweis angekommen ist – solange er auf „pending“ steht, dem
Nutzer sagen, dass der Wunsch vorgemerkt, aber noch nicht in Arbeit ist. „delivered“ heißt nur angekommen:
ob der Nachtrag gebaut wurde, zeigt `git log` im Worktree. Kommt „child completed before
consuming follow-up“ oder endet der Lauf mit offenem Hinweis, hat ihn der Nachtrag nicht erreicht → per
`subagent({action:"resume", id, message, options:{timeoutMs}})` nachreichen. Welche Kind-Id in welchem
Worktree arbeitet, zeigt `pgrep -f "pi.*<Kind-Id>"` plus `readlink /proc/<pid>/cwd`.

Zeitlimit erreicht: im Worktree `git status`/`git log` lesen, Stand als wip-Commit sichern, Restpunkte als
Nachtrag schreiben, mit `resume` und neuem `timeoutMs` fortsetzen (der Arbeiter behält Verlauf und Worktree).

Die nächste Welle starten, sobald die fertigen Pakete der ersten auf main liegen – nicht auf einen
Nachzügler warten. Sein Worktree steht dann hinter main; beim Zusammenführen mit Konflikten rechnen.

## 4. Abnahme je Paket

1. Bericht lesen (`~/.pi/agent/sessions/--home-gamzat--/subagent-artifacts/<Lauf-Id>_worker_output.md`), dann
   den Diff der Kern-Dateien selbst lesen – Abweichungen und „Offenes“ des Berichts sind die Prüfliste.
2. `python3 -m tests` und ruff im Worktree; ein roter Test außerhalb des Diff zuerst auf main gegenprüfen.
   Rot in mehreren Worktrees UND auf main = vorbestehend (häufig: Prüfdaten mit festem Datum neben echter
   Uhr – Fristen aus derselben Uhr berechnen, die der Test benutzt) → in eigenem kleinen Worktree beheben.
3. Behauptete Schwellen messen, bevor sie in den Dienst gehen (z. B. Abbruch nach N s Stille: größte Pause
   zwischen Modellzeichen je Denkstufe mit einem kleinen RPC-Skript messen; Skript in einem Block schreiben,
   im nächsten starten).
4. Mehrere Pakete einer Welle zuerst in einem Abnahme-Zweig zusammenführen (`wt switch -c <welle>`, dann je
   Paket `git merge --no-ff`), nicht einzeln nach main: die Pakete berühren dieselben Stellen (`FEATURES`,
   README, `docs/PLAN.md`, Standardwerte in `pi_telegram/config.py`) – Konflikte dort als Vereinigung beider
   Seiten lösen, per Skript mit Marker-Prüfung in einer `&&`-Kette. Erst im Abnahme-Zweig zeigen sich
   Fehler, die kein Paket allein hat (mehr Hintergrund-Threads am selben Zustand). Dann Tests, ruff und die
   Node-Prüfskripte dort, ein einziger Merge nach main, README-Testzahl.
5. Ein Test, der nur manchmal und nur in der vollen Suite rot wird, ist nach dem Zusammenführen ein echter
   Befund, kein Anlass zum Wiederholen: Ursache suchen. Bekannte Muster: ein Hintergrund-Thread ändert den
   Zustand, während ein anderer ihn als JSON schreibt (`RuntimeError: dictionary changed size during
   iteration` → Text vor dem Schreiben bilden, bei diesem Fehler neu bilden; ein Schloss nur um `save()`
   reicht nicht, wenn Features den Zustand ohne Schloss ändern); beim Aufräumen des Test-Ordners schreibt
   noch ein Thread hinein (`OSError: [Errno 39] Directory not empty` →
   `tempfile.TemporaryDirectory(ignore_cleanup_errors=True)`).
6. Ergebnis einer Prüfkette an der Ausgabe ablesen, nicht am Exit-Code: ein `grep` ohne Treffer am Ende
   der Kette meldet Fehler, obwohl die Tests grün sind.

## 5. Ausrollen

1. Live-Einstellungen gegen neue Standardwerte halten (`~/.config/pi-telegram/config.json`): ein dort
   gesetzter alter Wert überschreibt den neuen Standard still (Beispiel: Wartepause des Pi-Prozesses) →
   Sicherung anlegen, Schlüssel entfernen oder anheben. Einstellungen, die ein Paket leer ausliefert und die
   nur die Hauptsitzung füllen kann (z. B. überwachte Repos), jetzt setzen. Zuerst aber Änderungszeit der
   Datei und `systemctl --user show -p ActiveEnterTimestamp pi-telegram.service` gegen die eigene Sitzung
   halten: Der Nutzer stellt währenddessen über den Bot um und startet selbst neu (z. B. `default_cwd` auf
   einen eigenen Arbeitsordner) – seine Live-Werte stehen über den Annahmen aus den Aufträgen. Pfad-Standardwerte
   neuer Pakete an seinem gewählten Arbeitsordner ausrichten (eine Ablage unter `~/…` läge sonst wieder
   direkt unter Home, obwohl er das gerade abgestellt hat) und die Änderung im Bescheid mit Einstellungsnamen
   nennen. Die Datei ist mit zwei Leerzeichen eingerückt und unsortiert; Schlüssel anhängen, Format und
   Rechte (0600) erhalten.
2. Ändert das Paket die Dienstdatei: `pi-telegram install` (erneuert die Datei, lädt systemd neu).
3. Schalter am Bot setzen, die der Arbeiter nicht setzen durfte (z. B. `pi-telegram themen an`), und mit
   dem zugehörigen `status` belegen.
4. Neustart nur bei ruhigem Bot, danach `pi-telegram say` mit den Befehlen zum Ausprobieren (Text wird als
   Markdown gelesen, `--plain` schaltet das ab) – der Nutzer testet sofort am Handy und will den Bescheid
   dort, nicht im Terminal. Sagen, was live ist und was noch im Bau ist.
5. Erste Meldungen eines neuen Hintergrund-Bausteins nach dem Neustart ansehen (dessen Zustandsdatei): was
   er als Erstes meldet, zeigt Fehlalarme sofort (z. B. kurzlebige Einheiten mit erzeugtem Namen – einmal
   melden, nie erinnern).
6. Worktrees entfernen (`.tmp/` vorher löschen, `wt remove`).

## Eingebaute Pakete, die beim Planen zählen

- Tempo: Pi-Prozess bleibt warm (`idle_minutes` 240, `vorstart` nach Brückenstart, `/neu`, `/wechsel`),
  Hinweis ans Modell zum Bündeln von Werkzeugaufrufen (`buendel_hinweis`), Abbruch einer stillen Runde nach
  `stille_limit` (60 s, einmal selbst neu senden; gemessen größte Pause ≈ 7 s, beim Denken ≤ 0,2 s),
  `runden_limit` 600 s, `CPUWeight=300` in der Dienstdatei.
- Stimme: ElevenLabs als Erstweg (Schlüssel `~/.config/pi-telegram/elevenlabs.key`, 600; Erkennung
  `elevenlabs_stt_modell`, Vorlesen `elevenlabs_tts_modell`, Stimme `elevenlabs_stimme`), lokal als Rückfall
  (Sperrfrist `elevenlabs_sperre_minuten` bei leerem Guthaben oder abgelehntem Schlüssel); `/stimme`,
  `/stimme stimmen`, `/stimme lokal|elevenlabs|auto|neu`; lokale Erkennung als Dauerprozess mit Entladen nach
  `stt_warm_minuten`. Grundsätze der Anbindung: Skill selfhosted-speech-stack.
- Themen: ein Telegram-Thema je Sitzung im Privatchat mit dem Bot (eigener pi-Prozess je Thema; `/neu`,
  `/thema`, `/themen`; Einstellung `themen`, Schalter am Bot `pi-telegram themen an|aus|status`). Neue
  Pakete müssen Zustand je Chat UND Thema führen.
- Zeitpläne und Kürzel: `/spaeter`, `/taeglich`, `/werktags`, `/woechentlich`, `/plaene`, `/morgen`,
  `/makro` (Zustand `state.zeitplan.json`).
- Wächter: Hintergrundprüfungen mit Tasten (`/waechter`, Einstellungen `waechter_*`, Zustand
  `state.waechter.json`); meldet einen Wechsel einmal, Anhaltendes frühestens nach 12 h, erst nach zwei
  gleichen Messungen. Muster für jede weitere Hintergrundprüfung.
