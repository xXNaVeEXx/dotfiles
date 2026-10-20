---
name: tty-handoff-bridge
description: Ein frisch installiertes/offline Zielgerät ohne Agent-Netzzugang via User-TTY übernehmen — HTTP-Key-Handoff vom Kontroll-Host, ready-Poll, SSH-Retry, TUI als User-Kommunikation. Use when a device needs agent control but only the user has physical access (fresh OS install, no network route to it).
---

# tty-handoff-bridge

---
name: tty-handoff-bridge
description: Ein frisch installiertes/offline Zielgerät ohne Agent-Netzzugang via User-TTY übernehmen — HTTP-Key-Handoff vom Kontroll-Host, ready-Poll, SSH-Retry, TUI als User-Kommunikation. Use when a device needs agent control but only the user has physical access (fresh OS install, no network route to it).
---

# TTY-Handoff-Bridge — Zielgerät via User-TTY übernehmen

Lage: Agent läuft auf einem Kontroll-Host (SSH-Key vorhanden); das Zielgerät
(frisches OS, nur tty) ist für den Agent nicht erreichbar, aber der User sitzt
physisch davor und kann Zeilen abtippen. Ziel: SSH-Key aufs Gerät bringen, damit
der Agent es übernehmen kann.

## Verfahren

1. **Handoff-Server auf dem Kontroll-Host** (nur stdlib, läuft in tmux-window
   oder bg): GET /key → eigener `~/.ssh/id_ed25519.pub`; GET /ready → Absender-IP
   + Zeitstempel in Ready-Datei schreiben (Poll-Signal). **An die eigene LAN-IP
   binden, nicht 0.0.0.0** — Security-Tooling (z. B. Lens) blockt oft Wildcard-
   Listener; BIND=hostaddress:port.
2. **Ready-Poll als bg_run**: while-Schleife (sleep 2, Timeout großzügig),
   Abbruch wenn Ready-Datei eine FREMDE IP enthält. Eigenen curl-Selbsttest
   einplanen — der erzeugt sonst einen Fehlalarm-Eintrag; Vergleichs-IP =
   Kontroll-Host-IP hardcoden.
3. **TUI-Anleitung für den User** (einziger Kommunikationskanal!): nummerierte,
   abtippbare Zeilen für das Zielgerät-tty. Regeln: tty startet oft in US-Layout
   → `loadkeys de` als erste Zeile (y/z vertauscht!), danach nur Zeilen OHNE
   Sonderzeichen, die im US-Layout identisch sind. Danach: `systemctl enable
   --now sshd`, `mkdir -p /root/.ssh && chmod 700 /root/.ssh`, `curl -s
   http://<kontroll-ip>:<port>/key >> /root/.ssh/authorized_keys`, `curl
   http://<kontroll-ip>:<port>/ready` (→ „READY OK“). Fallbacks nennen:
   `wget -qO-`, alternative IP (Tailscale o. ä.), Layout-Hinweis wiederholen.
   Der tty-Login ist oft NICHT root: Key-Append nach /root mit sudo braucht
   `sudo sh -c 'curl … >> /root/.ssh/authorized_keys'` — ein bloßes
   `sudo curl … >> /root/…` läuft mit dem Redirect als USER und scheitert
   still an /root (Permission denied). Robuster: Key nach `~/.ssh` des
   Login-Users appenden (keine sudo-Falle), root-Kopie später vom Agent aus
   nachholen (`echo <pw> | sudo -S sh -c '…'`, PW nur via stdin, nie in Dateien).
4. **Bei ready:** `ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes
   root@<absender-ip>` — dann Diagnose-Skript (Default-Target, Pakete, Logs,
   /home-Inhalt) als EIN ssh-Aufruf, Ausgabe lokal sichten.
5. **Bei `Permission denied (publickey)`:** NICHT raten. Einen Fix-Einzeiler ins
   TUI (`chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys; curl …/key
   >> …; systemctl restart sshd`) + bg-Retry-Loop (alle 15 s, ~10 min). Häufigste
   Ursachen: Tippfehler im US-Layout beim Append, fehlende 600 auf
   authorized_keys (StrictModes), sshd ohne Reload.
6. **Reverse-Tunnel, wenn direktes TCP ins Ziel timeoutet** (Firewall,
   Client-Isolation, sshd tot) und der User ein Terminal am Ziel hat: er
   tippt `ssh -R <port>:localhost:22 <user>@<kontroll-ip>` (PW-Login auf
   dem Kontroll-Host nötig; Kontroll-Host-PW, nicht Ziel-PW!) und lässt
   die Shell offen. Agent pollt localhost:<port> und loggt sich über den
   Tunnel ein — umgeht jede eingehende Blockade.
7. **GUI-Ferndiagnose über SSH (Wayland), wenn das Ziel einen Desktop
   zeigt:** hyprctl als root braucht die User-Env: `SIG=$(ls
   /run/user/<uid>/hypr | head -1)` und `runuser -u <user> -- env
   HYPRLAND_INSTANCE_SIGNATURE=$SIG XDG_RUNTIME_DIR=/run/user/<uid>
   hyprctl …`. Screenshot für eigene Inspektion: WAYLAND_DISPLAY aus
   `/run/user/<uid>/` ableiten (Socket heißt wayland-1, nicht immer
   wayland-0), `runuser … grim /tmp/s.png`, per scp zurückholen und
   SELBST ansehen — ein Blick auf den Screenshot ersetzt zehn User-
   Rückfragen. User-Units: `runuser -u <user> -- env
   XDG_RUNTIME_DIR=… systemctl --user …`.
8. **Nach Abschluss aufräumen** (User-Auftrag immer einholen, meist gewünscht):
   Handoff-Server killen, tmux-windows schließen, keine Listener/Hintergrund-
   Prozesse auf dem Kontroll-Host zurücklassen. Kontroll-Host selbst NICHT
   herunterfahren.

## Pitfalls

- scp-Kopien mit „No result provided“-Antwort sind UNVERIFIZIERT — nie als
  angekommen werten; über zweiten Kanal (Zieldatei lesen) nachprüfen.
- Ein lang übergebener Prompt kann in der Zielsession ZEILE FÜR ZEILE als
  User-Nachrichten nachkommen (Replay). Richtig: minimal quittieren, NIE etwas
  doppelt starten; der Original-Auftrag in der Zielsession ist maßgeblich.
- `/key`-Abruf ohne folgendes `/ready` heißt: jemand hat nur den Key geholt
  (oder erster Versuch scheiterte). Ready-Datei nach Absender-IP sortieren,
  neuesten vollständigen Handshake nehmen.
- Zwischen-IPs wechseln (WLAN-Reconnect): nach jedem Reboot des Ziels Ready-
  Eintrag neu erwarten; known_hosts akzeptiert neue Host-Keys nur mit
  accept-new.
- Setup-/Installer-Skripte, die beim Step-Aufruf `git checkout -B <branch>
  FETCH_HEAD` o. ä. Self-Updates machen, RESETTEN lokale Patches im Checkout.
  Nie darauf verlassen, dass ein Patch einen Step-Aufruf überlebt: entweder
  Patch nach dem Reset erneut anwenden oder das Zielskript (z. B. install.sh)
  direkt starten; Patch-Backup als `<datei>.orig` nebenlegen.
- Läuft das Installer-Skript als User mit vielen sudo-Aufrufen: temporäres
  `ALL=(ALL) NOPASSWD: ALL` in /etc/sudoers.d/ (chmod 440) setzen, nohup-run
  als `runuser -u <user> -- bash -lc 'cd … && bash install.sh'` mit Log nach
  /var/log starten, per bg-Poll auf die Schlusszeile des Logs warten — und
  die NOPASSWD-Datei NACH Abschluss garantiert wieder löschen.
- pacman meldet `target not found: <pkg>` aus einem Installer, der hart-
  kodierte Repo-Targets hat: Upstream-Bruch prüfen und ggf. umgehen —
  Debug-Prozedur in `references/pacman-upstream-debug.md`.
- Nach einem Ziel-Reboot kann die alte IP einem ANDEREN Gerät gehören: die
  ARP-MAC der bekannten IP prüfen (OUI-Vendor), bevor man sie weiter nutzt;
  mDNS (`avahi-resolve`) kann STALE-Cache-Antworten vom Kontroll-Host
  liefern, obwohl das Ziel offline ist. Ziel wiederfinden: Port-22-Sweep
  übers Subnetz, dann BatchMode-SSH-Probe auf alle Kandidaten — und das
  Ziel IMMER per `hostname`-Ausgabe im Probe-Command identifizieren; ein
  passender Username oder eine „Please login as the user X“-Nachwort sind
  KEIN Beweis (fremde Server im selben Netz können denselben User haben).
  Sind beide Geräte im selben Overlay-Netz (Tailscale o. ä.), zeigt
  `tailscale status` beim aktiven Peer `direct <lan-ip>:<port>` — die
  aktuelle LAN-IP direkt ablesen statt zu scannen; OS-Wechsel auf
  Dual-Boot-Maschinen vergibt oft unterschiedliche DHCP-Leases pro OS,
  beide Kandidaten-IPs pollen.
- Exit-Codes von bg-Ketten prüfen: ein `skript.sh | tail -5` liefert den
  Exit-Code von tail (immer 0) — Fehlschläge sehen „completed“ aus. Ketten
  ohne Pipe starten oder `set -o pipefail` im Skript.
- Distrosetups härten SSH oft am Ende (PermitRootLogin no + Hinweis-Banner):
  Key auf den USER-Account legen und `sudo -n` testen; funktionierendes
  root-Login von vor der Installation ist nach dem ersten System-Setup
  nicht garantiert.
- WLAN, das am tty nur interaktiv per nmtui verbunden wurde, ist oft eine
  reine User-Connection: nach dem nächsten Reboot (und erst recht hinter
  FDE-Unlock) ist das Ziel OHNE Netz, bis der User sich anmeldet. Beim
  Handoff die Connection systemweit machen (`nmcli connection modify <con>
  connection.permissions ''` als root + autoconnect yes), sonst steht der
  Agent nach dem Reboot vor einem offline-Gerät.
