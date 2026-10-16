---
name: image-ocr-fallback
description: Text aus eingefügten Screenshots/Bildern per Tesseract-OCR erschließen, wenn das aktive Modell keine Bilder anzeigen kann, inkl. Vorverarbeitung und Verifikation der OCR-Ergebnisse gegen das Live-System. Use when the read tool reports the model does not support images, or when text must be extracted from a pasted screenshot/image (e.g. /tmp/pi-clipboard-*.png).
---

# image-ocr-fallback

# Text aus Bildern ziehen, wenn das Modell keine Bilder sieht

Klasse: Inhalt eingefügter Screenshots/Bilder erschließen, wenn `read` das Bild nicht anzeigen kann (Antwort enthält "[Current model does not support images]").

## Procedure

1. **Read trotzdem versuchen** — die Meldung kommt erst im Antworttext; nutzt nichts, kostet einen Call.
2. **OCR-Fallback prüfen:** `tesseract --list-langs`. Fehlt eng/deu (hier nur `afr`, `osd` installiert): `afr` trägt Lateinschrift und liest Deutsch/Englisch passabel — Befehl: `tesseract <bild> - -l afr`.
3. **Bei Matsch vorverarbeiten** mit ImageMagick:
   ```
   magick <bild> -colorspace Gray -resize 200% -unsharp 0x1 out.png
   ```
   Varianten: `--psm 4` (Spalten) oder `--psm 6` (Block), ggf. in horizontale Bänder croppen.
4. **OCR-Ergebnis gegen das Live-System verifizieren, nie blind glauben.** UI-Screenshots verhunzen Zahlen systematisch (18789→"1878A", PIDs→"1A46788"). Jede konkrete PID/Port/Zahl aus dem OCR per `ps`, `ss -tlnp`, `docker ps` gegenprüfen und die echte ID in die Analyse setzen. Textuelle Meldungen (Fehlerstrings) per `grep` im System reproduzieren statt aus dem OCR zu zitieren.

## Pitfalls

- Kein `-threshold`/`-negate` beim Vorverarbeiten dunkler Themes — beide können die gesamte Ausgabe leeren. Resize+Unsharp genügt fast immer.
- Nicht nach einem OCR-Versuch aufgeben: erster Durchlauf oft leer (falsches psm/kein preprocessing), zweiter brauchbar.
- Log-Level-Tokens wie "[inFa]" = `[info]` — Stufe aus dem Kontext erschließen, bevor etwas als "Fehler" an den Nutzer gemeldet wird.
