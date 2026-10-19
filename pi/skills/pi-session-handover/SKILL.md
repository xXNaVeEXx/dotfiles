---
name: pi-session-handover
description: Pi-Session auf anderen Rechner umziehen (JSONL-Resume inkl. Slug-/Fork-/cwd-Dialoge, tmux-Start, Prompt-Injektion) und dort als autonomer Agent mit Bridge-Zugriff auf die ursprüngliche, gerade nicht SSH-bare Maschine weiterlaufen lassen.
---

# pi-session-handover

# pi-session-handover — Pi-Session auf anderen Rechner umziehen + autonom weiterlaufen lassen

Use when die Maschine, auf der eine Pi-Session läuft, gleich neu startet / in ein anderes OS
bootet / gewechselt werden muss (OS-Installation, Reboot-Brücke, „mach auf Rechner X weiter"),
oder wenn eine laufende Session 1:1 auf einer zweiten Maschine resumed werden soll — inklusive
autonomem Agent-Betrieb dort und Bridge-Zugriff auf die ursprüngliche Maschine.

## Kernidee

Pi-Sessions sind reine JSONL-Dateien (`~/.pi/agent/sessions/<slug>/<timestamp>_<uuid>.jsonl`).
Kontext/Verlauf werden beim Resume daraus rekonstruiert — Session-Datei kopieren genügt, kein
begleitender Zustand (billion-context-Proxy startet auf dem Ziel neu). Der letzte Stand enthält
alle Nachrichten bis zum Kopierzeitpunkt: Übergabe-Anweisung vorher fertig formulieren, dann
kopieren.

## Prozedur

1. **Ziel vorbereiten** (per ssh, non-login-Shell): pi-Version prüfen, `~/.pi/agent/auth.json`
   muss existieren (Token wird NICHT gesynct — sonst `/login` oder auth.json einmalig kopieren),
   pi-sync-Stand frisch ziehen (extensions/skills/settings), tmux vorhanden.
2. **JSONL kopieren** (scp, SHA-256 auf beiden Seiten vergleichen). ZIEL-VERZEICHNIS = Slug des
   Ziel-CWD, nicht der Quell-Slug: Session lag in `--Users-gamzat--`, Ziel läuft mit `$HOME` →
   nach `~/.pi/agent/sessions/--home-gamzat--/` legen. Sonst fragt pi „Session found in different
   project — Fork this session into current directory?" und ein „y" erzeugt eine GABELN mit neuer
   ID statt Fortsetzung.
3. **Starten**: `tmux new-session -d -s <name> -c $HOME "/pfad/zu/pi --session <uuid-präfix>"`
   — Binaries (pi, tmux) unter non-login-ssh als VOLLPFAD aus `~/.nix-profile/bin/` aufrufen.
   Erwartbare Dialoge wegdrücken: „cwd from session file does not exist → Continue in current
   cwd" → `tmux send-keys Enter`.
4. **Übergabe-Prompt injizieren**: Prompt als Datei auf das Ziel scp'en, dann
   `tmux load-buffer -b hop <datei> && tmux paste-buffer -b hop && tmux send-keys Enter`.
   Interaktive Session (kein `-p`!) — der Agent behält Tool-Freiheit, bg-Tasks und TUI als
   User-Kanal.
5. **Übergabe-Prompt-Inhalt** (Selbst-contained, der Ziel-Agent hat sonst nur den resumed
   Verlauf): Situation in 2 Sätzen, MECHANISMUS als nummerierte Schritte mit konkreten Befehlen
   und IPs, REGELN (Langläufer als bg, TUI = User-Kommunikation, Aufräum-Pflicht: Server killen,
   tmux-Fenster schließen, keine Prozesse/Listener zurücklassen, Zielrechner selbst NICHT
   runterfahren, Session am Ende sauber beenden), Verweis auf mitkopierte Pläne/Dokumente.
6. **Brücke zur abwesenden Maschine** (wenn der Agent dort arbeiten soll, die Maschine aber nur
   per tty/Operator erreichbar ist): kleiner Python-stdlib-HTTP-Server auf dem Zielrechner im
   LAN — GET /key liefert authorized_keys-Pubkey, GET /ready loggt die Absender-IP in eine
   Datei (Agent pollt sie). User tippt auf der Zielmaschine einmalig:
   `mkdir -p /root/.ssh && curl -s http://<ziel>:8000/key >> /root/.ssh/authorized_keys &&
   curl http://<ziel>:8000/ready` — danach arbeitet der Agent per SSH autonom.
   Public-Pastebin-Uploads (0x0.st etc.) als Kanal sind unzuverlässig (Uploads oft gesperrt) —
   eigener LAN-Server ist die robuste Variante.
7. **User-Abfertigung**: tty-Befehle layoutsicher dokumentieren (US-Tastatur: y/z vertauscht,
   z. B. `loadkez` für `loadkeys`), Erfolgskriterium sichtbar machen („GUI erscheint = fertig"),
   alte Session auf der Quellmaschine schließen lassen — Duplikat-Sessions divergieren sonst.

## Pitfalls

- Slug-Verzeichnis entscheidet über Fork oder Fortsetzung: immer in den Slug des GEWÜNSCHTEN
  Ziel-CWD kopieren und pi mit genau diesem cwd starten.
- auth.json fehlt auf Zielsystemen regelmäßig (nicht Teil von pi-sync) — VOR dem Start prüfen,
  sonst läuft der resumed Agent ohne Provider-Zugang ins Leere.
- non-login-ssh kennt nix-profile-Pfade nicht: pi/tmux per Absolutpfad, `bash -lc` nur für Checks.
- Multi-line-Paste ins TUI: paste-buffer + EIN Enter; Prompt-Datei darf keine Zeilen enthalten,
  die allein stehend als Shortcut triggern.
- Der resumed Agent erbtKompressionsblöcke/Artefakt-Referenzen aus der JSONL — Pfade darin
  zeigen weiter auf die QUELL-Maschine; im Übergabe-Prompt explizit sagen, welche Dateien
  mitkopiert wurden und wo sie jetzt liegen.
- Nur EINE Instanz weiterführen: sobald der Handover läuft, Quell-Session stilllegen
  (schließen lassen), sonst schreiben beide divergierende Stände.
