---
name: home-assistant-ops
description: "Use when the user's Home Assistant (HAOS VM on the Proxmox host) must be inspected or a smart-home device (Matter, Thread, Wi-Fi) will not pair or has gone offline — Zugang über den Proxmox-Gast-Agenten ohne SSH-Add-on, Zustand von Matter-Server und Thread-Border-Router belegen, Thread-Zugangsdaten ohne Geheimnis-Ausgabe vergleichen, Funkumgebung messen, Fehler zwischen Server, Handy und Funk einkreisen und dem Nutzer klare Handgriffe geben."
---

# home-assistant-ops

# Home Assistant: Zugang und Geräte-Kopplung diagnostizieren

Home Assistant läuft als HAOS-VM auf dem Proxmox-Host. Der Agent sieht nur den Server; Handy, Lampe und Funkstrecke bedient der Nutzer. Ziel jeder Diagnose: belegen, auf welcher der drei Seiten (Server / Handy / Funk) es hängt, dann dem Nutzer wenige konkrete Handgriffe nennen.

## 1. Zugang

1. `ssh root@proxmox` (Tailscale-Name, Key-Login). `ssh root@homeassistant` geht nicht, solange kein SSH-Add-on installiert ist — nicht daran aufhalten.
2. VM finden: `qm list` (Name `haos-*`), USB-Durchreichung prüfen: `qm config <id> | grep usb`.
3. Befehle im Gast über den Gast-Agenten, Ausgabe ist JSON:
   ```sh
   x(){ qm guest exec <id> --timeout 50 -- sh -c "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("out-data",""), d.get("err-data",""))'; }
   ```
   Mehrere Abfragen in EINEN `x`-Aufruf bündeln (jeder Aufruf kostet Sekunden). Verschachtelte Anführungszeichen sind die Hauptfehlerquelle — für alles Größere ein Skript per `scp` auf den Host legen und dort ausführen.
4. Im Gast verfügbar: `ha core info`, `ha addons` / `ha addons info <slug> --raw-json`, `docker ps`, `docker logs <container>`, `jq`. Konfigurationsspeicher: `/mnt/data/supervisor/homeassistant/.storage/` (`core.config_entries`, `core.device_registry`, `thread.datasets`).

## 2. Bestandsaufnahme (nur lesend)

- Versionen und Add-on-Zustand: Core, Matter-Server, OpenThread Border Router; `update_available` notieren, nichts ungefragt aktualisieren.
- Geräte: `jq` über `core.device_registry` — welche Matter-Knoten gibt es, welche Hersteller. Daraus folgt, ob schon ein Thread-Gerät existiert oder alles über WLAN läuft.
- Matter-Server-Log: `docker logs --tail 80 app_core_matter_server`. Erfolgreiche Einrichtung = „Matter commissioning of Node ID N successful“. Fehlt jeder Eintrag zum Problemgerät, kam der Versuch nie beim Server an → Ursache liegt auf Handy- oder Funkseite.

## 3. Thread-Netz prüfen

`C=app_core_openthread_border_router; docker exec $C ot-ctl <befehl>` mit:
`state` (leader/router = läuft), `channel`, `networkname`, `br state`, `ba state`, `srp server state`, `child table`, `neighbor table`, `srp server host`, `txpower`.

- Leere `child table` + leerer `srp server host` = noch kein Thread-Gerät im Netz. Dann muss das neue Gerät den Funkstick DIREKT erreichen (kein anderes Gerät leitet weiter) — für die Ersteinrichtung nah an den Server.
- Zugangsdaten vergleichen, ohne Geheimnisse auszugeben: TLV-Hex aus `thread.datasets` (`.data.datasets[].tlv`) und `ot-ctl dataset active -x` feldweise parsen (Typ, Länge, Wert) und je Feld nur GLEICH/UNTERSCHIED ausgeben; Netzwerkschlüssel (Typ 5) und PSKc (Typ 4) nie im Klartext drucken. Ein bloßer Hash-Vergleich der Hex-Strings täuscht Unterschiede vor, weil die Feldreihenfolge abweichen kann.
- Erreichbarkeit im LAN: eine mDNS-Suche nach `_meshcop._udp` von einem WLAN-Client (z. B. `avahi-browse -rtp _meshcop._udp`) zeigt den Border Router; `ip -6 route` auf einem WLAN-Client muss das Thread-Präfix über die HA-Adresse führen.

## 4. Funk messen

- `ot-ctl scan energy 300` → Pegel je Kanal 11–26; `ot-ctl scan` → fremde Netze. Werte um −30 dBm und lauter auf dem eigenen Kanal bedeuten eine Störquelle direkt am Stick.
- Kanalzuordnung zum Einordnen: Bluetooth-Werbekanäle 2402/2426/2480 MHz treffen 802.15.4-Kanal 15 bzw. 26; WLAN-Kanal 1/6/11 überdeckt etwa 11–14 / 16–19 / 21–24.
- `lsusb -t` auf dem Host zeigt, ob der Stick neben Bluetooth-/WLAN-Adaptern am selben Hub steckt. Der Scan misst Spitzen, keinen Mittelwert: als Verdacht melden, nicht als bewiesene Ursache. Dauerhafte Abhilfe ist ein USB-Verlängerungskabel; Kanalwechsel nur auf Ansage des Nutzers, weil alle Thread-Geräte mitziehen müssen.

## 5. Kopplungsversuch beobachten

- Vor dem Versuch: `ot-ctl log level 4` (nur Laufzeit, endet mit Add-on-Neustart) und Uhrzeit notieren; dem Nutzer diese Änderung nennen.
- Nach dem Versuch: `docker logs --since <zeit>` von Border Router und Matter-Server lesen. „Failed to process UDP: Security“ im Border-Router-Log = das Gerät versucht mit anderen Thread-Zugangsdaten beizutreten, also Handy-Daten prüfen.

## 6. Handy-Seite (Android)

Stand dieses Abschnitts: aus Hersteller-Support und Home-Assistant-Forum übernommen, hier noch nicht durch eine gelungene Kopplung bestätigt — dem Nutzer als wahrscheinlichste Ursache nennen, nicht als Befund. Sobald ein Versuch das bestätigt oder widerlegt, diesen Abschnitt anpassen.

Android richtet Matter-Geräte selbst per Bluetooth ein und nutzt dafür die in den Google-Play-Diensten gespeicherten Thread-Zugangsdaten. Fehlen sie oder sind sie alt, scheitert es laut diesen Quellen mit „Gerät braucht einen Thread Border Router“ oder hängt bei der Thread-Verbindungsprüfung, obwohl der Server gesund ist.

1. Home-Assistant-App → Einstellungen → Companion App → ganz nach unten scrollen bis zum vorletzten Block (englisch „Need help?“) → Eintrag mit Käfer-Symbol (englisch „Troubleshooting“, Untertitel „Logs and other tools to diagnose issues“) → „Sync Thread credentials“. Den Weg über Position und Symbol beschreiben, nicht über ein deutsches Wort: die Übersetzungen liegen nicht im App-Quellcode, der deutsche Wortlaut ist also nicht nachschlagbar. Den Punkt gibt es nur in der „full“-Variante der App (Variante steht in `core.config_entries` beim `mobile_app`-Eintrag unter `app_version`). Die App meldet danach das Ergebnis im Klartext (Netz übernommen / gleiches Netz / unterschiedliche Netze / nichts zu synchronisieren) — den Wortlaut zurückmelden lassen.
2. Hilft das nicht: Daten und Cache der Google-Play-Dienste löschen, Handy neu starten, Sync wiederholen (löscht auch andere dort gespeicherte Daten — erst als zweiten Schritt nennen).
3. Gerät vorher in den Kopplungsmodus setzen (Hersteller-Reset nachschlagen), Bluetooth und Standort an, Handy im Heim-WLAN.

Diese Schritte erst empfehlen, wenn Abschnitt 2–3 den Server als gesund belegt haben.

## 7. Meldung an den Nutzer

- Zuerst das Ergebnis in einem Satz (Server bereit / Fehler gefunden), dann Befunde, dann nummerierte Handgriffe, dann was er zurückmelden soll (Stelle und Wortlaut der Fehlermeldung).
- Einfache Wörter statt Fachkürzel; jede eigene Änderung am System und jede bewusst NICHT ausgeführte Option (Update, Kanalwechsel) ausdrücklich nennen.
- Herstellerangaben und Forenlösungen als solche kennzeichnen, solange sie hier nicht selbst belegt sind.
