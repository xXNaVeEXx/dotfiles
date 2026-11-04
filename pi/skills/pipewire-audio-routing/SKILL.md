---
name: pipewire-audio-routing
description: Applikations-Audio (mpv, Browser, beliebige Player) über virtuelle PipeWire-Sinks/Quellen in Discord-/Konferenz-Screenshares bringen, wenn der Fenstergrabber keinen Ton überträgt — Setup der module-null-sink/loopback/virtual-source-Kette, Laufzeit-Umleitung per pactl move-sink-input, Discord-Web-Fallstricke (Device-Reload, Noise Suppression). Use when screenshared video has no or terrible sound, when a player's audio must become a virtual microphone, or when local playback must stay audible while streaming.
---

# pipewire-audio-routing

# pipewire-audio-routing

# Linux-Audio-Routing für Screenshare/Streams (PipeWire)

Klasse: Applikations-Audio in Discord/Meet/Streaming bringen, wo die
Bildschirmfreigabe (Portal/PipeWire-Grabber) kein Fenster-Audio überträgt —
und lokale Wiedergabe trotzdem hörbar bleibt. Umgebung: PipeWire + PulseAudio-
Kompat (`pactl`), Discord als Web-App im Browser (kein nativer Client).

## Symptom → Ursache
- WICHTIG Qualitätswahl: Für Video aus einem Browser-Tab ist Tab-Share mit
  „Audio teilen" die bessere Route (Discord-Screenshare überträgt Stereo im
  Musikmodus, keine Sprachfilter) — Film/Video also bevorzugt im Browser
  abspielen und den TAB teilen. Die Virtual-Mic-Route hier ist der Behelf für
  natives Fenster-Video (mpv & Co.) ohne Browser-Tab; sie klingt im Voice-Kanal
  zwangsläufig wie Telefon (Sprach-Codec), nie HiFi.
- Screenshare-Video kommt an, Ton nicht: Wayland-Portal-Fenstergrab liefert
  keinen Audio-Kanal; „Ton sehr schlecht" = Mikrofon nimmt Lautsprecher ab
  ODER Discord-Sprachfilter (Rauschunterdrückung/Eingangsempfindlichkeit
  automatisch) zerlegt Musik — erst die Filter prüfen, dann die Route bauen.

## Setup (3 Module, in dieser Reihenfolge)
```bash
pactl load-module module-null-sink sink_name=discord_stream \
  sink_properties=device.description=Discord-Stream
pactl load-module module-loopback source=discord_stream.monitor \
  sink=$(pactl get-default-sink) latency_msec=50        # lokal mit hören
pactl load-module module-virtual-source source_name=discord_mic \
  source_properties=device.description=Discord-Mikrofon uplink_sink=discord_stream
```
- null-sink = Ziel für den Player; loopback spielt alles lokal mit;
  virtual-source macht daraus eine echte Mikrofon-Quelle (taucht sicherer in
  Browser-Pickern auf als „Monitor of …").
- Module sind session-scoped (Weg nach Reboot); rebootfest = WirePlumber-
  config-Snippet (copy) oder Skript im Autostart.

## Player verbinden
- Beim Start: `mpv --audio-device=pulse/Discord-Stream datei.mp4`; Wrapper in
  `~/.local/bin/mpv-discord` hält das bequem (`pactl list short sinks` für Namen).
- Zur Laufzeit umleiten, ohne Neustart: Sink-Input-ID via
  `pactl list sink-inputs | grep -B/-A application.process.binary|node.name`
  (mpv heißt `application.name = "mpv"`), dann
  `pactl move-sink-input <id> <discord_stream-id>`.
- `mpv --audio-device=help` listet die gültigen Device-Strings.

## Gegenstelle (Discord Web)
- Sprach-Einstellungen → Eingabegerät: die virtuelle Quelle (z. B.
  „Discord-Mikrofon") — nach Anlegen der Module SEITE NEU LADEN, sonst fehlt sie.
- Rauschunterdrückung/Sprachisolation für die Dauer AUSschalten: Discord
  behandelt den Kanal als Stimme und filtert Musik/Filmaudio kaputt.
- Verifikation: Mikrofon-Pegel im Sprachpanel muss beim Abspielen ausschlagen.
