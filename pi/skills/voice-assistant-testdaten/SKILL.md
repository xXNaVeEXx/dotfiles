---
name: voice-assistant-testdaten
description: "Sprachassistent-Testdaten auswerten: Harbor-Abruf, index/protokoll, Zurücerkennen mit dem App-ASR, ffmpeg-Messungen."
---

# voice-assistant-testdaten

Klasse: Gesprochen-Audio-Testdaten einer Sprachassistent-App systematisch auswerten und dabei den Anspruch „angehört“ maschinell einlösen: dieselbe Erkennung wie im Gerät über die Ausgabe-audio laufen lassen und Wort für Wort gegen den Soll-Text diffen.

## Datenlage (Lumi)
- Uploads liegen je Tester als ORAS-Artefakt im privaten Harbor-Projekt `lumi-analyse` (Abruf ohne Testzugang nur über den Einmal-Workflow im Quell-Repo der Admin-Secrets; siehe Skill signing-key-audit, Abschnitt Stolperfallen).
- Ein Upload enthält: `index.jsonl` (je Aufnahme: datei, zeit, text, dauer, pegel „Pegel -47 dBFS, Spitze 2 %“, phase, bei Antworten `lumi: true` + `vorgelesen`), `protokoll.txt` (App-Log, Zeilen ohne Präfix) und wav-Dateien: `du_*` = Nutzereingaben (ASR), `lumi_*` = TTS-Ausgaben.
- Aufnahmen sind **44,1 kHz** — die Erkennung braucht 16 kHz mono: vorher `ffmpeg -v error -y -i f.wav -ac 1 -ar 16000` in einen Parallelordner; das Skript nimmt die 16-k-Kopie, wenn vorhanden.
- Vor dem Löschen alter Uploads bedenken: Analyse braucht die Daten; beim Aufräumen je Tester den neuesten behalten.

## Umgebung fürs Zurückerkennen
1. Modell-URLs und -Versionen aus `apps/lumi/lib/config.dart` nehmen (HuggingFace, Parakeet int8: encoder/decoder/joiner/tokens) und einmalig nach `~/.local/share/lumi-analyse-models/asr` laden (672 MB, wiederverwendbar).
2. sherpa-onnx in **derselben Version wie die App** (pubspec) — sonst weicht die Erkennung systematisch ab. Funktionierender Weg als Flake, weil `nix shell nixpkgs#python313.withPackages(…)` an den Klammern scheitert („getting status of …/nixpkgs“):
   ```
   { inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
     outputs = { self, nixpkgs }: { packages.aarch64-linux.py =
       nixpkgs.legacyPackages.aarch64-linux.python313.withPackages (ps: [ ps.sherpa-onnx ps.numpy ps.soundfile ]); }; }
   ```
   `nix build <flake>#py -o /tmp/nixpy`, dann `/tmp/nixpy/bin/python3`.
3. Erkennen: `OfflineRecognizer.from_transducer(encoder=…, decoder=…, joiner=…, tokens=…, model_type='nemo_transducer', num_threads=4)`, Stream pro Datei, `accept_waveform(16000, audio)`.
4. Diff: beide Seiten normalisieren (Kleinbuchstaben, Satzzeichen raus, deutsche Zahlwörter zu Ziffern — Vorlage in `apps/lumi/tool/dev_analyse.py`), dann `difflib.SequenceMatcher` über Wortlisten. ratio < 0,8 oder fehlende Wörter am Ende = Abschneiden/unverständlich.

## Messungen ohne Zuhören (ergänzen, nicht ersetzen)
- Stille-Ränder: `ffmpeg -af silencedetect=-50dB:d=0.1 -f null -` je Datei; Anfangs-/Endstille und Lücken > 0,5 s zählen.
- Pegel/Übersteuerung: `volumedetect` (mean/max), 0,0 dBFS Spitze = Übersteuerung.
- Sprechgeschwindigkeit: Wörter(gettext)/dauer; Ausreißer nach beiden Seiten (Stille-Ränder vs. abgebrochen).

## Stolperfallen
- „Ich habe die Audios angehört“ ist erst wahr nach dem Zurückerkennen — Signal-/Textvergleiche (Dauer, Stille, index-Felder) decken Abschneiden und unverständliche Zahlwörter NICHT sicher auf. Erst auf Nachfrage des Nutzers dürftig; also von vornherein die Anhör-Schleife mitlaufen lassen.
- protokoll.txt enthält keine `I/flutter`-Präfixe (App-Protokoll, nicht logcat); `dev_analyse.py` kennt beide Formen und erwartet den Index unter `out/aufnahmen/` — Pfad als Parameter/mit Kopie anpassen.
- Im Write-Hook können Blocker-Meldungen nach erfolgreicher Korrektur als „Still unfixed“ stehen bleiben: mit `ruff check --select F,E9` + `py_compile` gegen die Datei auf Platte entscheiden, nicht gegen die Meldung.
