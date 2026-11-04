---
name: chromium-flags-tuning
description: Brave/Chromium-Feature-Flags (VA-API, Hardware-Decode u. a.) auf Omarchy/Asahi dauerhaft aktivieren und den Browser kontrolliert aus der Agent-Shell neu starten — Flags in brave-flags.conf mergen statt .desktop, GUI-Env aus /proc kopieren, pkill-Bracket-Trick, Wirkung per Prozess-Args, /dev/video-Zugriff und CPU-Delta verifizieren. Use when a browser feature flag or hardware acceleration must be enabled, checked, or a GUI app must be killed and restarted from an agent shell on this machine.
---

# chromium-flags-tuning

# Chromium/Brave-Flags auf Omarchy/Asahi aktivieren & GUI-App aus Agent-Shell neu starten

Ziel: Browser-Feature-Flags (z. B. VA-API-Hardware-Decode) dauerhaft und ohne Kollision mit der Omarchy-Standardkonfiguration aktivieren, den Browser kontrolliert neu starten und die Wirkung objektiv verifizieren.

## 1. Konfigurationskanal finden — Flags gehören in die conf, nicht ins .desktop
- `which brave` zeigt auf einen Wrapper (`/usr/bin/brave`), der `~/.config/brave-flags.conf` zeilenweise in Flags übersetzt und sie VOR die CLI-Argumente setzt (Chromium-Familie analog: `chromium-flags.conf`).
- Omarchy legt dort Standard-Flags ab (u. a. `--ozone-platform=wayland`, `--password-store=gnome-libsecret`, `--enable-features=...WebRTCPipeWireCapturer`, `--load-extension=/usr/share/omarchy/default/chromium/extensions/...`). Diese Zeilen NICHT ersetzen.
- **Merge-Regel**: Neues Feature in die BESTEHENDE `--enable-features=A,B`-Zeile kommasepariert eintragen. Chromium nutzt bei doppeltem Switch die letzte Instanz — eine zusätzliche eigene `--enable-features`-Zeile, ein .desktop-Override oder CLI-Übergabe würde die Wrapper-Features verlieren (bei conf+CLI gewinnt CLI, weil sie später kommen).

## 2. Kill ohne Selbsttötung
- `pkill -f '/opt/brave-bi[n]/brave'` — Bracket-Trick: Ohne `[n]` steht der Suchstring im eigenen `bash -c`-Kommando und pkill killt die eigene Shell (exit 143).
- Danach 2–3 s warten, mit `pgrep -f '/opt/brave-bi[n]/brave' | wc -l` auf 0 prüfen.

## 3. GUI-Relaunch aus der Agent-Shell
- Session-Env von einem laufenden GUI-Prozess kopieren (Agent-Shells haben keine Wayland-Session-Variablen):
  `tr '\0' '\n' < /proc/$(pgrep -x wezterm-gui | head -1)/environ | grep -E '^(WAYLAND_DISPLAY|XDG_RUNTIME_DIR|XDG_SESSION_TYPE|XDG_CURRENT_DESKTOP|HYPRLAND_INSTANCE_SIGNATURE|DBUS_SESSION_BUS_ADDRESS|DISPLAY|PATH)=' > /tmp/brave-env.sh`
- Start: `set -a; . /tmp/brave-env.sh; set +a; setsid nohup brave --restore-last-session >/dev/null 2>&1 &` — `--restore-last-session` bringt die Tabs zurück und erspart dem Nutzer Klick-Arbeit.
- Verifikation der Flags im Hauptprozess: `ps -eo pid,args | grep '/opt/brave-bi[n]/brave' | grep -v -- '--type=' | grep -o 'enable-features=[^ ]*'`

## 4. Wirkung verifizieren (nicht nur Flag-Präsenz)
- VA-API/Decode-Offload: Während ein Video läuft — `/dev/video*`-Zugriff prüfen (`fuser -v /dev/video0` bzw. lsof; Asahi-Decoder = V4L2-Gerät, wird nur bei aktiver HW-Nutzung geöffnet) UND Renderer-CPU vor/nher vergleichen (`ps aux --sort=-%cpu | head`). Vorher ~100 %+ auf einem Renderer = Software-Decode-Last; deutlicher Abfall = Flag wirkt.
- Auf Asahi vorhanden: `libva` + `asahi_drv_video.so` (HW-Decode H.264/HEVC). Kein HW-Encode → WebRTC-Screenshare bleibt CPU-Encode; bei Rucklern Screenshare-Auflösung senken statt an Flags drehen.

## Stolperfallen
- `.desktop`-Override in `~/.local/share/applications/` nur nutzen, wenn kein conf-Mechanismus existiert — sonst Flags dort NICHT pflegen (Merge-Konflikt mit conf, siehe Schritt 1).
- `vainfo` kann fehlen — Installationsversuch ist unnötig; `/dev/video*`-Zugriff + CPU-Delta sind der direktere Wirksamkeitsbeweis.
- Browser-Neustart killt Web-Apps im Browser (z. B. laufende Discord-Web-Calls): Nutzer vorher informieren, danach `--restore-last-session` und kurze Anleitung zum Rejoin.
