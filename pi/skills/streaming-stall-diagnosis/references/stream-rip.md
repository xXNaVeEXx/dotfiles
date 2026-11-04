# Serie/Staffel als Dateien laden (Stall-Gegenmittel)

Wenn die Diagnose auf Token-Expiry/Drosselung beim Hoster zeigt, ist das dauerhafte
Gegenmittel der Burst-Download der Folgen statt Browser-Wiedergabe. Rezept, inklusive
der Fallen obfuskatierter Embedded-Player (Alloha/Kodik-Stil):

## 1. Frische Stream-URL bekommt man nur aus dem echten Browser
- Player-JS reverse-engineeren ist Zeitverschwendung (obfuskiert, webpack, Decoys;
  yt-dlp hat für Mirror-Hoster keine Extractor). Headless-Brave lädt nur die Shell,
  ohne Play-Klick kommen keine Player-API-Calls.
- Zuverlässig: User-Brave einmal mit `--remote-debugging-port=9222` neu starten
  (Prozedur + Selbstkill-Falle: Skill browser-cdp-control). OOPIF-Player (iframe)
  erscheint als eigenes Target in `/json/list` — direkt damit verbinden.
- Alternativ/Beweis: `--log-net-log=/tmp/net.json` — daraus per grep alle
  `master.m3u8`-URLs UND die kompletten Request-Header (params.headers der
  URL_REQUEST-Events, JSON-objektweise zeilenweise parsen; die Datei ist beim
  laufenden Browser trunciert — kein json.load über die ganze Datei).

## 2. CDN-Spezifika
- Signierte URLs (Pfad `/0/<sig>/master.m3u8` auf vkvideo.cloud & Co.) laufen nach
  ~2–3 Minuten ab — exakt das Stall-Symptom im Browser; der Player holt via
  WebSocket-Session laufend neue URLs, ein statischer curl stirbt mittendrin (403).
- Der CDN-Call braucht oft Custom-Header (`Authorizations: Bearer …`,
  `Accepts-Controls: …`) plus Origin/Referer des Player-Iframes — exakt aus dem
  Netlog kopieren, sonst 403 nginx.
- Header-Set kann für alle Folgen der Session stabil bleiben; URL-Expiry ist der
  Flaschenhals, nicht der Bearer.

## 3. Burst-Download-Pro Episode (im Token-Fenster)
1. Master fangen (CDP `Network.responseReceived` auf `vkvideo…master.m3u8` oder
   Netlog-Poll). Master-Body → Child-Playlist (relativer Name) → Segmentliste.
2. Segmente parallel laden (ThreadPool 16× curl mit Header-Set, Retry 3, Ziel
   >1 KB-Größencheck) — 261 Segmente ≈ 500 MB in <1 min, gut im 2-min-Fenster.
3. Remux: `ffmpeg -f concat -safe 0 -i list.txt -c copy -bsf:a aac_adtstoasc out.mp4`.
4. Folgenwechsel triggern: im Player-Target per `Runtime.evaluate` den Button
   „Следующая серия"/„next episode" klicken (Buttons über innerText/title finden),
   danach sofort `video.muted=true; video.pause()` — sonst spielt Ton beim User.
   Der neue Folgenlauf mint automatisch die nächste master.m3u8, die der Fänger
   einsammelt. Schleife = Staffel.

## 4. Player-UI über CDP lesen
- `document.querySelectorAll('button')` mit innerText/title: Play, prev/next
  episode, Qualität (360p–1080p), Tonspur-Buttons — volle Fernbedienung ohne
  GUI-Tools (ydotool/xdotool unnötig, uinput bleibt root-only).
- `video.duration/currentTime/paused` verifizieren, welche Folge geladen ist.
