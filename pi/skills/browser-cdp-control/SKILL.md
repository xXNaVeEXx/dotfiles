---
name: browser-cdp-control
description: Den echten Chromium/Brave-Browser des Nutzers per Chrome-DevTools-Protokoll fernsteuern — Restart mit Debug-Port, iframe-/Player-Targets, Netzwerk-Fänger, Button-Klicks via Runtime.evaluate, Netlog-Header-Extraktion, inkl. pkill-Selbstkill-Falle und pure-Python-Websocket ohne pip. Use when a headless browser fails on obfuscated players/websites, when live browser network URLs or request headers are needed, or when a web player must be remotely controlled without GUI automation tools.
---

# browser-cdp-control

# browser-cdp-control

# Chromium-Familie (Brave/Chrome/Chromium) per CDP steuern

Klasse: Den User-Browser als fernsteuerbares Werkzeug nutzen — Tabs/Player
auslesen und klicken, Netzwerk-Events mithören, Stream-/Medien-URLs fangen —
ohne GUI-Automatisierung (kein ydotool/xdotool, kein pip). Auf dieser Maschine:
Arch/Omarchy, Brave ist Wayland-native, python3 ohne pip, nix für Extras.

## Wann
- Embedded-Player/obfuskierte Web-Apps bedienen (Folgen wechseln, Play triggern)
- Netzwerk-URLs live mitfangen (m3u8, API-Calls), die JS-Archäologie nicht hergibt
- Headless scheitert (Anti-Bot lädt nur Shell) — der echte User-Browser mit Profil
  und Session ist der zuverlässige Ausführungsort

## 1. Browser mit Debug-Port neu starten (User-Session!)
1. Laufende Instanz beenden — Selbstkill-Falle: `pkill -f <muster>` killt das
   eigene `bash -c`, wenn das Muster im Kommandotext steht. Muster zur Laufzeit
   bauen: `M=$(printf '/opt/brave-bi%s/brave' 'n'); pkill -f "$M"`.
2. ENV des Browsers übernehmen (Brave unter Omarchy braucht sie): Quell-Prozess
   (wezterm-gui) via `/proc/PID/environ` → `/tmp/brave-env.sh`, dann
   `set -a; . /tmp/brave-env.sh; set +a`.
3. Start: `setsid nohup brave --restore-last-session --remote-debugging-port=9222
   --log-net-log=/tmp/netlive.json &` — Restore bringt die Tabs zurück,
   Netlog läuft als Beweis-Backup mit. User vorher in EINEM Satz informieren.

## 2. Verbinden (ohne pip/websockets — reine Standardlib)
- `curl -s http://127.0.0.1:9222/json/list` → Targets. Iframes (OOPIF, z. B.
  Player-Domains) erscheinen als eigene Targets mit eigener
  `webSocketDebuggerUrl` — direkt verbinden, kein Auto-Attach nötig.
- Websocket-Client selbst schreiben (~80 Zeilen: Handshake, Client-Masking,
  Ping→Pong, CDP id/method-Protokoll). Falle: CDP-Klasse muss die volle
  `ws://host:port/path`-URL in host/port/PATH zerlegen — ganze URL als Pfad
  senden ergibt HTTP 404. Arbeitsvorlage: /tmp/cdp.py der Session (falls weg:
  neu schreiben, RFC6455 Basic reicht für localhost).
- nix-Shell für Python-Pakete (`nix shell "nixpkgs#python3.withPackages(...)"`)
  scheitert gern am Quoting der Funktions-Argumente — Standardlib vorziehen.

## 3. Steuern
- DOM/Buttons: `Runtime.evaluate` mit `returnByValue:true`; Buttons über
  `[...document.querySelectorAll('button')].find(x => x.title.includes(...) ||
  x.innerText.includes(...))` → `.click()`. Cross-origin-Player sitzen im
  eigenen iframe-Target — dort ist Same-Origin und alles erlaubt.
- Geste-geknöpfte Play-Buttons: `Input.dispatchMouseEvent` (mousePressed +
  mouseReleased auf Button-Mitte aus getBoundingClientRect) liefert vertraute
  Klicks — nötig, wenn der Player nach Reload eine echte Nutzereingabe verlangt.
- Netzwerk fangen: `Network.enable` auf dem Player-Target, dann Events lesen
  (`Network.responseReceived` → params.response.url). Für jeden Durchlauf
  Sockets-Timeout setzen und leere Lese-Runden tolerieren.
- Video-Element: `document.querySelector('video')` gibt paused/currentTime/
  duration/muted — Zustand verifizieren und höflich zurücksetzen (pause+mute
  nach eigenen Klicks, sonst spielt Ton beim User).
- Gepufferte/pausierte Spieler holen KEIN neues Manifest: play/pause triggert
  keinen Netz-Request, nur reload oder Folgenwechsel mint eine frische URL.
- iframe-reload TRENNT die Debugger-Websocket-Verbindung (EOF): danach neu
  verbinden (Targets neu listen, neue webSocketDebuggerUrl, Network.enable
  wiederholen) — während der Reconnect-Lücke frühe Events verloren sind.
- Mehrere iframes derselben Player-Domain (Duplikate/Slots): das ERSTE
  Target ist oft ein totes Duplikat — jedes Target auf `!!document.querySelector('video')`
  (bzw. Buttons) proben und das lebendige wählen.
- Achtung parallel: Netlog der laufenden Instanz ist trunciert — nur
  zeilenweise/grep parsen, kein `json.load` über die ganze Datei.

## 4. Netlog als Header-/URL-Quelle
- URL_REQUEST-Events enthalten `params.headers` (volle Request-Header inkl.
  Custom-Header wie `Authorizations: Bearer`, `Accepts-Controls`, Referer) —
  exakt kopieren, um CDN-Calls mit curl/ffmpeg zu replizieren.
- Events liegen zeilenweise (JSONL-artig) in der großen Datei: über Zeilen
  iterieren, `json.loads(zeile.rstrip().rstrip(','))` — nicht die Datei ganz laden.
