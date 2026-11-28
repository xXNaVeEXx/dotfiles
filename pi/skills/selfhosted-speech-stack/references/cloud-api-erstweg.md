# Cloud-Sprach-API als Erstweg, lokale Modelle als Rückfall

Fall: Der Nutzer gibt einen API-Schlüssel eines Sprachdienstes (hier ElevenLabs) und will Erkennung und Sprachausgabe
darüber laufen lassen; ist das Guthaben leer oder der Dienst gestört, soll es ohne Zutun lokal weitergehen.

## Vorgehen
1. **Modellwahl gegen die Quelle prüfen, bevor gebaut wird.** Modellübersicht und Preisseite des Anbieters lesen und
   die vom Nutzer genannten Namen den Schnittstellen zuordnen (Aufnahme-Schnittstelle gegen Live-Kanal, Qualitäts- gegen
   Turbo-Stimme). Namen ähneln sich über Generationen hinweg, und ältere „Turbo“-Modelle sind teils abgekündigt; die
   Modellliste ändert sich oft, also nie aus dem Gedächtnis antworten.
2. **Rechte des Schlüssels proben** (`/v1/user/subscription`, `/v1/models`, `/v1/voices`). Ein eingeschränkter Schlüssel
   liefert dort 401 `missing_permissions`, obwohl Erkennen und Sprechen funktionieren. Folgen: Guthaben ist nicht
   abfragbar, Stimmen sind nicht auflistbar. Dann hängt der Rückfall am Fehler der eigentlichen Anfrage, und die Stimme
   wird fest per Einstellung gesetzt (eine, die in der Probe funktioniert hat).
3. **Jede Kombination einmal echt messen**, mit einer kurzen UND einer langen Aufnahme (≈ 1 min). Die lange Aufnahme
   ohne Kosten mit dem lokalen TTS erzeugen; Text mit Zahlen, Uhrzeit und einem Dateinamen wählen. Je Lauf Zeit, Text
   und Kosten notieren (Antwortkopf `character-cost`).
4. **Abweichung von der Wahl des Nutzers offen nennen**, aber seine Wahl als Standard bauen und den empfohlenen Weg als
   Zwischenstufe vor dem lokalen Rückfall; umschaltbar per Einstellung.
5. **Rückfall bauen** (für Erkennen und Sprechen getrennt gemerkt):
   - Guthaben leer oder Schlüssel abgelehnt → sofort lokal weiter und für eine Frist (z. B. 60 min) nicht mehr
     versuchen; den Nutzer einmal je Sperre informieren. Grund: Ohne Merker kostet jede Nachricht einen Fehlversuch
     samt Wartezeit.
   - Vorübergehender Fehler (Netz, 5xx, 429, Zeitüberschreitung) → nur diese Nachricht lokal, kein Merker.
   - Den Merker in einer eigenen kleinen Datei halten, nicht in der Konfiguration; er muss einen Neustart überstehen.
   - Auf das Fehlerfeld prüfen (`detail.status`/`code` = `quota_exceeded`), nicht nur auf die HTTP-Zahl.
   - Ein Befehl zeigt den aktiven Weg, die Sperre und den letzten Fehler und hebt die Sperre auf.
6. **Schlüssel ablegen**: aus einem Ablage- oder Temp-Ordner in den Konfigurationsordner der App kopieren, Rechte 600;
   nie in Protokoll, Fehlermeldung, Chat oder Auftragsdatei eines Arbeiters schreiben (dort nur den Pfad nennen).

## ElevenLabs: gemessene Eigenheiten
- **Sprechen**: `POST /v1/text-to-speech/{voice_id}?output_format=opus_48000_32` liefert eine fertige Ogg-Opus-Datei,
  die Telegram direkt als Sprachnachricht annimmt (kein ffmpeg). Das Turbo-Modell der neuesten Generation läuft auch
  über diese einfache HTTP-Schnittstelle, obwohl die Doku den Dialog-WebSocket nennt. Das Qualitätsmodell kostet das
  Doppelte und ist langsamer.
- **Erkennen, Aufnahme-Schnittstelle**: `POST /v1/speech-to-text` als multipart (`model_id`, `language_code`,
  `tag_audio_events=false`, `file`) nimmt die Ogg-Datei unverändert. Für fertige Sprachnachrichten der vom Anbieter
  empfohlene Weg; in der Messung schneller und genauer als der Live-Kanal.
- **Erkennen, Live-Kanal** (`wss://…/v1/speech-to-text/realtime?model_id=…&audio_format=pcm_16000&commit_strategy=manual`):
  braucht PCM s16le mono 16 kHz (ffmpeg) in Paketen `input_audio_chunk` mit `commit: true` im letzten. Der Dienst teilt
  lange Aufnahmen selbst und schickt MEHRERE `committed_transcript`, ohne Ende-Signal. Deshalb alle sammeln, bis nach dem
  eigenen Commit einige Sekunden nichts mehr kommt. Grund: Wer beim ersten aufhört, verliert den Schluss der Aufnahme,
  und eine kurze Probe zeigt den Fehler nicht.
- Guthaben leer zeigt sich im Live-Kanal als Ereignis `quota_exceeded`, nicht als HTTP-Fehler.
- WebSocket ohne neue Abhängigkeit: ein Client nur mit der Standardbibliothek genügt (TLS-Socket, Handshake, maskierte
  Frames, Ping/Pong); Tests laufen gegen einen kleinen lokalen Server oder eine eingeschobene Verbindungsklasse.
- Preise und Zeichengrenzen je Anfrage stehen auf der API-Preisseite (als lesbare Seite abrufen); lange Texte an
  Satzgrenzen in Stücke teilen, wenn für das Modell keine Grenze genannt ist.
