---
name: linux-gui-computer-use
description: GUI-Apps auf dem Linux-Desktop des Nutzers selbst steuern für automatisierte Handtests — XWayland erzwingen, xdotool/import/tesseract über nix shell, fensterscharfe Screenshots, isolierte App-Datenordner, RAM-Regeln. Use when the user asks the agent to run GUI handtests or control the computer itself on their Linux machine.
---

# linux-gui-computer-use

# linux-gui-computer-use

# GUI-Anwendungen auf dem Linux-Desktop des Nutzers fernsteuern (Handtests ohne Nutzer)

Use when the user asks to run GUI handtests / control the computer yourself (start app, click, type, read screen) on their Linux machine — Wayland session with XWayland, no system-wide installs allowed (Nix only).

## Verfahren

1. **Voraussetzungen prüfen:** `echo $XDG_SESSION_TYPE $DISPLAY $WAYLAND_DISPLAY`, `xauth list` (Cookie für `:0` nötig). Vorhanden: ImageMagick `import`, `tesseract`, `ffmpeg`. Fehlen typischerweise: `xdotool`, `xwininfo`, `playerctl` — nie systemweit installieren, sondern pro Lauf: `nix shell nixpkgs#xdotool nixpkgs#xwininfo -c '…'`.
2. **App unter XWayland zwingen** (xdotool wirkt nur auf X11-Fenster): `GDK_BACKEND=x11` plus für Tauri/WebKitGTK stabile Software-Sicht: `WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 NO_AT_BRIDGE=1`.
3. **Isoliert + RAM-begrenzt starten:** eigene Datenordnung der App nutzen, falls vorhanden (z. B. `LUMI_HOME=…` mit vorgefertigten JSON-Dateien: Einrichtung erledigt, Offline-Modus), sonst `XDG_DATA_HOME`/`XDG_CONFIG_HOME` umleiten. Start: `systemd-run --user --scope -q -p MemoryMax=3G … app > .tmp/…/app.log 2>&1 &` — Log auf Platte (`.tmp/`), RAM-Regeln des Rechners beachten (ein schwerer Schritt, vorher `free -m`).
4. **Wayland-Fokus holen — vor JEDER Interaktion:** XTest-Klicks/Tasten wirken nur, wenn der Wayland-Compositor (KWin) das Fenster wirklich fokussiert hat; `xdotool windowactivate` täuscht nur den X-Fokus vor und Klicks landen dann still woanders. Fix: `kdotool windowactivate '{uuid}'` (UUID via `kdotool search --name "<Fenstertitel>"`, `nix shell nixpkgs#kdotool -c …`, `{}`-Klammern strippen). Treiber-Skript mit Helfern: `ht_activate` (kdotool-Aktivierung), `ht_click` (activate → sleep → mousemove --window → click, GETRENNTE Aufrufe — kombinierter Aufruf warpt nicht), `ht_shot`, `ht_type`. Fenster-ID via `xdotool search --onlyvisible --class <klasse>`; Text `xdotool type --delay 60`; Tasten `xdotool key ctrl+k` (wirken global, nicht `--window`).
5. **Textfelder in WebViews per JS statt Maus:** Eingabefelder (Composer, Konsole embedded UIs) nehmen XTest-Klick-Fokus NICHT zuverlässig an, Buttons/Sidebar schon. Route: DevTools-Konsole öffnen und React/DOM direkt steuern — Dropdowns/Knöpfe per `element.click()` (JS-Klick wirkt immer, Pixel-Klick ist Lotterie), React-Inputs per nativem value-Setter + `input`-Event + Enter-`keydown`. DevTools (Strg+Shift+I) öffnet nur FRISCH nach App-Start UND in der richtigen Ansicht; nach DevTools-Gebrauch grabt sich auch Strg+K ab → App neu starten. Code in die Konsole: kleine JS-Datei per Clipboard (xclip + Strg+V nach Klick in den Prompt) oder `eval(atob('<base64>'))`; `xdotool type` und Clipboard-Paste verstümmeln langen Klartext-Code.
6. **Fenster in den Monitor zwingen:** nach JEDEM App-Start `xdotool windowsize <id> 1280 700` — ein 820px-Fenster auf einem 720p-Monitor hängt unten über den Rand, Klickziele dort schlagen still fehl.
7. **Lesen:** Screenshot nur des App-Fensters `import -window <id> shot.png`, dann mit dem read-Tool (Vision) auswerten — deutlich verlässlicher als tesseract (dessen tessdata oft fehlt). Elementkoordinaten aus PIL-Zeilen-/Spaltenprofilen (Grauwert-Schwellen, Segment-Cluster) gewinnen; OCR nur als Fallback.
8. **Prozess-Seite beobachten:** App-Log + Log-Ordner der App-Datenordnung tailen, Kindprozesse (z. B. Node-Hosts) per `pgrep -f` finden — Verhalten oft leichter am Log/Prozess belegbar als am Pixel. Achtung: Einstellungen der App können TROTZ isoliertem Datenordner ins echte Nutzer-Home laufen (z. B. Agent-Settings aus `$HOME/.pi/…`) — prüfen, welche Datei wo landet, bevor man Zustände wundern lässt.
9. **Dokumentieren:** je Handtest Screenshot + Vision-Lesung + Log-Auszug + Ergebnis in einen Bericht (Konvention des Projekts, z. B. `docs/reports/`), Checkliste erst nach Belag abhaken.

## Stolperfallen

- Wayland-Nativfenster sind für xdotool unsichtbar — ohne `GDK_BACKEND=x11` (GTK) bzw. X11-Backend der App scheitert die Steuerung still.
- Es ist der LIVE-Desktop des Nutzers: nur das Zielfenster aktivieren/fokussieren/anklicken, Screenshots nur fensterbezogen (`import -window`), nie Vollbild — sonst liest man private Inhalte und klickt fremde Fenster.
- Nach Rechner-Neustart ( Stromausfall) erst Maschine prüfen (`free -m`, `uptime`, `git status`) bevor schwere Läufe starten; Hintergrund-Wächter des Nutzers (systemd-oomd, ram-watch) killen bei Swap-Druck die größte Gruppe — App-Binaries mit `MemoryMax`-Scope starten.
- OCR-Strings der UI vorher aus dem Quelltext/i18n-Dateien holen (exakte erwartete Texte), statt OCR-Output frei zu interpretieren — tesseract verhunzt deutsche Umlaute gern; mehrere akzeptierte Schreibweisen prüfen. Lieber Vision (read-Tool auf Screenshot) + PIL-Profile als tesseract ohne tessdata.
- AT-SPI exportiert bei WebKit/GTK-Hybriden oft nur den GTK-Teil (Menüleiste), nicht das Web-DOM — für Web-Inhalte unbrauchbar, direkt die DevTools-JS-Route nehmen.
- Sound-Tests: WebKitGTK-Apps brauchen `ALSA_PLUGIN_DIR=<pipewire-nix-store>/lib/alsa-lib` (Fehler „libasound_module_pcm_pipewire.so"), danach App neu starten.
- `nix shell` lädt Kanal-Auspacken beim ersten Aufruf (Minuten) — Treiber-Skript so schreiben, dass EIN `nix shell … -c` alle xdotool-Aufrufe bündelt oder die Shell offen hält.
- Binary-Alter prüfen: `ls -l binary` vs. letzte Quelländerung (`git log -1 --format=%cd -- <src>`), sonst testet man einen alten Stand; inkrementeller Rebuild über das RAM-sichere Buildskript des Projekts im Hintergrund.

## Eskalation

Klappt die Steuerung nicht (kein X11-Backend möglich, native Wayland-only App), ofere der Nutzer kein Einlenken: dann Pi-Extension „computer use" bauen (Screenshot via GNOME-Shell-D-Bus-Screenshot-API oder Portal, Eingabe via ydotool/libei) — nur auf ausdrücklichen Auftrag, wie vom Nutzer formuliert.
