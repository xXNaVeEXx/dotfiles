---
name: image-ocr-fallback
description: Bilder in Pi nutzbar machen — Einfügen (lokal/SSH/tmux via image-paste-Extension + WezTerm smart_paste, Platzhalter [[ image N ]]), Vision-Bridge für Modelle ohne Bild-Input und Tesseract-OCR-Fallback inkl. Verifikation gegen das Live-System. Use when the read tool reports the model does not support images, when text must be extracted from a pasted screenshot/image (e.g. /tmp/pi-clipboard-*.png), when the user cannot paste/attach images into Pi's input field (also over SSH), or when maintaining the image-paste extension or WezTerm image paste.
---

# image-ocr-fallback

# Text aus Bildern ziehen, wenn das Modell keine Bilder sieht

Klasse: Inhalt eingefügter Screenshots/Bilder erschließen, wenn `read` das Bild nicht anzeigen kann (Antwort enthält "[Current model does not support images]").

## Procedure

0. **Vision-Bridge zuerst:** Ist `~/.pi/agent/extensions/image-paste.ts` geladen, ersetzt sie Bilder für Nicht-Vision-Modelle automatisch durch Beschreibungen eines Vision-Modells (in Nachricht und read-Ergebnis, Block `<image described-by=…>`). Kommt trotzdem "[Current model does not support images]" an → Extension prüfen (`references/pasting-images-into-pi.md`), sonst manuell weiter mit OCR.
1. **Read trotzdem versuchen** — die Meldung kommt erst im Antworttext; nutzt nichts, kostet einen Call.
2. **OCR-Fallback prüfen:** `tesseract --list-langs`. Fehlt eng/deu (hier nur `afr`, `osd` installiert): `afr` trägt Lateinschrift und liest Deutsch/Englisch passabel — Befehl: `tesseract <bild> - -l afr`.
3. **Bei Matsch vorverarbeiten** mit ImageMagick:
   ```
   magick <bild> -colorspace Gray -resize 200% -unsharp 0x1 out.png
   ```
   Varianten: `--psm 4` (Spalten) oder `--psm 6` (Block), ggf. in horizontale Bänder croppen.
4. **OCR-Ergebnis gegen das Live-System verifizieren, nie blind glauben.** UI-Screenshots verhunzen Zahlen systematisch (18789→"1878A", PIDs→"1A46788"). Jede konkrete PID/Port/Zahl aus dem OCR per `ps`, `ss -tlnp`, `docker ps` gegenprüfen und die echte ID in die Analyse setzen. Textuelle Meldungen (Fehlerstrings) per `grep` im System reproduzieren statt aus dem OCR zu zitieren.

## Bilder überhaupt in Pi hineinbekommen

Nutzer kann keine Bilder einfügen, Bild-Paste über SSH/tmux, `[[ image N ]]`-Platzhalter, Vision-Bridge oder WezTerm-`smart_paste` warten → `references/pasting-images-into-pi.md` (Architektur der image-paste-Extension + WezTerm-Hook, Diagnose, Test-Harness außerhalb von Pi).

## Pitfalls

- Kein `-threshold`/`-negate` beim Vorverarbeiten dunkler Themes — beide können die gesamte Ausgabe leeren. Resize+Unsharp genügt fast immer.
- Nicht nach einem OCR-Versuch aufgeben: erster Durchlauf oft leer (falsches psm/kein preprocessing), zweiter brauchbar.
- Log-Level-Tokens wie "[inFa]" = `[info]` — Stufe aus dem Kontext erschließen, bevor etwas als "Fehler" an den Nutzer gemeldet wird.
