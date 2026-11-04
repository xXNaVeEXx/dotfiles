---
name: streaming-stall-diagnosis
description: Streaming-/Video-Stalls (pausiert alle paar Minuten, erst Reload hilft) systematisch diagnostizieren — Tailscale/WLAN/DNS/Durchsatz lokal per Messung ausschließen, Video-Hoster per ss+whois identifizieren, Socket-Beweise (app_limited/cwnd) sammeln und Token-Expiry/Drosselung/AdBlock-Detector als Ursache bestimmen. Use when video or streaming playback stalls or buffers repeatedly, a stream only continues after page reload, or the user asks whether their internet, Wi-Fi, DNS, or Tailscale/VPN is at fault.
---

# streaming-stall-diagnosis

# Streaming-Stall-Diagnose (lokal vs. Hoster)

Ziel: Bei wiederkehrenden Video-Pausen (typisch: Stall alle paar Minuten, erst Seiten-Reload hilft) in wenigen Minuten messbar klären, ob lokales Netz (WLAN, Tailscale, DNS, Durchsatz) oder die Gegenseite (Video-Hoster) die Ursache ist. Läuft YouTube parallel problemlos, ist das schon ein starker Hinweis auf die Gegenseite — trotzdem erst lokal sauber ausschließen, dann den Hoster verurteilen.

## 1. Tailscale aus dem Datenpfad ausschließen
- `tailscale status` — Exit-Node aktiv? (Zeilen zeigen "exit node"/"using"). Kein Exit-Node → Internet-Traffic läuft direkt.
- Beweis: `ss -tnp | grep -Ei 'firefox|chrom|brave|zen'` — Quell-IP der Browser-Verbindungen = LAN-IP (z. B. 192.168.x.x), nicht 100.x → Tailscale steht nicht im Pfad.
- `tailscale dns status`: MagicDNS mit `~.` fängt nur DNS ab, nicht den Videodatenfluss; nur relevant, wenn CDN-Edge-Auswahl fraglich ist.

## 2. Lokale Leitung quantifizieren
- WLAN: `iw dev wlan0 link` (signal besser als −60 dBm = gut, Bitrate prüfen) + `iw dev wlan0 get power_save` (sollte off sein).
- Verlust/Latenz: `ping -c 5 -q <gateway>` und `ping -c 5 -q 1.1.1.1` — 0 % Verlust erwarten.
- Durchsatz: `curl -o /dev/null -s -w 'Speed: %{speed_download} B/s | remote: %{remote_ip}\n' https://speed.cloudflare.com/__down?bytes=20971520` — einmal default, einmal mit `-4`.
- Ab ~50 Mbit/s ist jede Serie (4K ≈ 25 Mbit/s) lokal problemlos → Durchsatz ist dann kein Kandidat.

## 3. Streaming-Hoster identifizieren
- Aktive Browser-Sockets einsammeln: `ss -tnp | grep -i <browser>` plus `ss -unp` (QUIC/UDP :443).
- Auflösen: `getent hosts <ip>` (rDNS) und `whois <ip> | grep -iE 'netname|org-name|country'`.
- Klassen lesen: Bulk-Hoster aus UA/AE/TH/MD mit rDNS wie `*.x4b.me` oder Namen wie TVSTAR/IQWEB = Mirror-/Serienstream-Hoster; Fastly/Cloudflare/Google/AWS-CDN-Präfixe = reguläre Anbieter.
- Eigene Agent-API-IPs (z. B. Anthropic `2607:6bc0::`) nicht als Video-Hoster fehldeuten.

## 4. Stall-Beweis auf Socket-Ebene
- `ss -tnpi dst <hoster-ip>` zweimal im Abstand ~8 s. Indikatoren für serverseitiges Trickeln: `app_limited`, `cwnd:10`, `bytes_received` nur im KB-Bereich und kaum Wachstum — bei messbar schneller Leitung.
- Live-Rate: `R1=$(cat /sys/class/net/wlan0/statistics/rx_bytes); sleep 10; R2=$(cat ...); echo $(( (R2-R1)/10/1024 )) KB/s` — KB/s während angeblichem Playback = Leerlauf = es kommt nichts an.
- Browser-History-DB kann leer sein (Inkognito-Fenster) — nie auf sie als Diagnosequelle verlassen.

## 5. Urteil + Verifikation für den Nutzer
- Befund „lokal sauber + Hoster-Bulk-Infrastruktur + Socket trickelt" → Ursache bei der Gegenseite, typische Mechanismen: (a) signierte Segment-URLs/Token-Expiry nach wenigen Minuten — Reload holt ein neues Token (Symptom: Reload hilft immer), (b) Free-Tier-Drosselung auf ~Bitrate ohne Puffer-Vorsprung, (c) AdBlock-Detector (Brave-Shields/uBlock), der den Stream nach X Minuten absichtlich stoppt, um Reloads/Ad-Impressions zu erzwingen.
- Selbsttests vorschlagen: beim nächsten Stall parallel ein YouTube-Video starten (läuft es weiter → serverseitig bestätigt), in der Episode einen anderen Hoster/Server wählen, Probe im privaten Fenster mit ausgeschalteten Shields.
- Live-Mitschnitt beim nächsten Stall: 60–90 s+ mit einem Monitor-Hintergrundlauf mitschneiden, um Token-Expiry vs. gestoppte Segment-Auslieferung zu unterscheiden — fertiges bg_run-Script plus Auswertungs-Regeln (Feld-Fallen, TX-Statik-Effekt): references/live-monitor.md.
- Dauer-Gegenmittel bei bestätigtem Hoster-Problem: Staffel per Burst-Download aus dem echten Browser herausreißen (CDP-Fänger + Parallel-Segmente + Folgen-Wechsel-Schleife): references/stream-rip.md.
