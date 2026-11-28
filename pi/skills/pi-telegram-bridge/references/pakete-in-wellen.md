# Mehrere Pakete gleichzeitig bauen lassen und ausrollen

Gilt, wenn der Nutzer mehrere Funktionen auf einmal bestellt. Arbeiter bauen, die Hauptsitzung nimmt ab,
mergt, rollt aus und meldet sich per Telegram.

## 1. Vor dem Schneiden der Pakete

1. Stand prüfen: `git -C ~/projects/pi-telegram log --oneline -3 main`, `wt list`, Dienst aktiv, Bot ruhig.
2. Rechner prüfen (`nproc`, `uptime`, `free -g`): bei Last nahe der Kernzahl oder belegtem Swap höchstens
   3–4 Arbeiter gleichzeitig, den Rest als zweite Welle auf dem gemergten Stand.
3. Hängt eine Funktion an der Telegram-Schnittstelle, zuerst das Änderungsprotokoll lesen
   (`fetch_content https://core.telegram.org/bots/api-changelog`, mit `findText` gezielt suchen) und den Bot
   selbst fragen (`getMe`, Token nie ausgeben). Grund: Die Schnittstelle wächst schnell; eine aus dem Gedächtnis
   geplante Umgehung (z. B. eigene Gruppe für Themen) ist oft schon überholt, und Schalter am Bot stehen
   ab Werk auf „aus“.
4. Bestand des Nutzers erkunden, ohne Geheimnisse zu lesen (z. B. Postfächer und Server aus der
   Einstellungsdatei des Mail-Programms, nicht dessen Passwortspeicher). Zugangsdaten gibt der Nutzer einmal
   selbst ein (Terminal mit getpass oder ein Dialog, dessen Nachricht sofort gelöscht wird und nie an pi geht).
5. Wellen so schneiden, dass Pakete mit Kern-Umbau (Senden, Warteschlange, Zustand je Chat) in der ersten
   Welle liegen und alle anderen Pakete nur über `ctx.send`/`bridge.send` und `bridge.enqueue` gehen – dann
   greift der Umbau später ohne Nacharbeit in jedem Paket.

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
- Sicherheitsgrenzen ausdrücklich nennen, wo ein Paket nach außen wirkt: Versand (Mail, Merge) nur nach
  Tastendruck des Besitzers, auch im autonomen Modus; fremder Inhalt (Mail, Webseite) im Auftrag an pi klar
  als fremder Text abgegrenzt; kein Kommandozeilen-Weg, mit dem pi selbst versenden kann.

## 3. Starten

`subagent` mit `workflow: "parallel"`, `async: true`, `args.tasks` (je `agent: "worker"`, `task`, `cwd`),
`label` als eigenes Feld und `options.timeoutMs` passend zur Größe (60–120 min; ohne Angabe endet der Lauf
nach 30 min mit „Subagent timed out“ mitten in der Arbeit). Danach dem Nutzer eine kurze Tabelle schicken
(Paket → was er am Handy bekommt) und die Festlegungen nennen, die er anders wollen könnte.

Nachsteuern eines laufenden Arbeiters: Nachtrag als Datei `.pi/NACHTRAG.md` in seinen Worktree legen und per
`subagent({action:"steer", id:<Kind-Id>, options:{mode:"follow_up"}})` darauf hinweisen. Kommt „child
completed before consuming follow-up“, hat ihn der Nachtrag nicht erreicht → nach dem Ende per
`subagent({action:"resume", id, message, options:{timeoutMs}})` nachreichen. Welche Kind-Id in welchem
Worktree arbeitet, zeigt `pgrep -f "pi.*<Kind-Id>"` plus `readlink /proc/<pid>/cwd`.

Zeitlimit erreicht: im Worktree `git status`/`git log` lesen, Stand als wip-Commit sichern, Restpunkte als
Nachtrag schreiben, mit `resume` und neuem `timeoutMs` fortsetzen (der Arbeiter behält Verlauf und Worktree).

## 4. Abnahme je Paket

1. Bericht lesen (`~/.pi/agent/sessions/--home-gamzat--/subagent-artifacts/<Lauf-Id>_worker_output.md`), dann
   den Diff der Kern-Dateien selbst lesen – Abweichungen und „Offenes“ des Berichts sind die Prüfliste.
2. `python3 -m tests` und ruff im Worktree; ein roter Test außerhalb des Diff zuerst auf main gegenprüfen.
   Rot in mehreren Worktrees UND auf main = vorbestehend (häufig: Prüfdaten mit festem Datum neben echter
   Uhr – Fristen aus derselben Uhr berechnen, die der Test benutzt) → in eigenem kleinen Worktree beheben.
3. Behauptete Schwellen messen, bevor sie in den Dienst gehen (z. B. Abbruch nach N s Stille: größte Pause
   zwischen Modellzeichen je Denkstufe mit einem kleinen RPC-Skript messen; Skript in einem Block schreiben,
   im nächsten starten).
4. Merge `--no-ff` nach main, Konflikte per Vereinigung in einer `&&`-Kette, Tests auf main, README-Testzahl.

## 5. Ausrollen

1. Live-Einstellungen gegen neue Standardwerte halten (`~/.config/pi-telegram/config.json`): ein dort
   gesetzter alter Wert überschreibt den neuen Standard still (Beispiel: Wartepause des Pi-Prozesses) →
   Sicherung anlegen, Schlüssel entfernen oder anheben.
2. Ändert das Paket die Dienstdatei: `pi-telegram install` (erneuert die Datei, lädt systemd neu).
3. Schalter am Bot setzen, die der Arbeiter nicht setzen durfte.
4. Neustart nur bei ruhigem Bot, danach `pi-telegram say` mit den Befehlen zum Ausprobieren – der Nutzer
   testet sofort am Handy und will den Bescheid dort, nicht im Terminal.
5. Worktrees entfernen (`.tmp/` vorher löschen, `wt remove`).

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
