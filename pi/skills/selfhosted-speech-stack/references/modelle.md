# Modell-Auswahl STT/TTS (Recherche-Stand Q4/2026 — vor neuer Auswahl erneut prüfen)

Zielsprachen der Recherche: Deutsch, Russisch, Englisch; nur CPU; kommerziell.

| Rolle | Wahl | Lizenz (Gewichte) | Kennwerte |
|---|---|---|---|
| STT | NVIDIA Parakeet TDT 0.6B v3, int8/Q8 (25 europ. Sprachen, Auto-Erkennung) | CC-BY-4.0 | WER DE 6,9 %, RU 10,7 %, EN 8,6 % (sherpa-onnx int8); 0,35 s je 3–10-s-Notiz auf 4 vCPU; ~1,0–1,3 GB RSS; erfindet auf Stille nichts |
| STT robust | Whisper large-v3-turbo Q8 | MIT | bester bei Lärm/Mischsprache, aber ~10 s je Notiz auf 4 vCPU (30-s-Fenster) |
| STT sparsam | Whisper base/small int8 | MIT | 0,3–0,5 GB, merklich mehr Fehler auf de/ru |
| STT nur Russisch | GigaAM v3 | MIT | Spezialist, nur falls RU-Qualität nicht reicht |
| TTS | Supertonic 3 (99M, ONNX, int8 in sherpa-onnx) | OpenRAIL-M | 31 Sprachen inkl. de/ru/en, Preset-Stimmen, Tags `<laugh>` `<breath>` `<sigh>`, schnell auf CPU |
| TTS sparsam | Piper-Stimmen (VITS) | je Stimme prüfen; Code GPL-3.0 als eigener Prozess | ~60 MB je Stimme, RTF ~0,02 auf x86 |
| VAD | Silero VAD | MIT | ~2 MB, Browser und Server |
| Laufzeit | sherpa-onnx | Apache-2.0 | STT + TTS + VAD, Python/Node/Go/C++ |

Verworfen: Kokoro (kein de/ru), Pocket TTS (kein ru), XTTS-v2 / F5-TTS / Fish S1–S2 (nicht kommerziell), Silero-TTS-
Hauptmodelle (CC-BY-NC; nur v5_cis_base MIT, ohne de), Chatterbox Multilingual / CosyVoice3 / Qwen3-TTS / VoxCPM2
(0,5–2 B Parameter, für 4-GB-CPU zu schwer), Qwen3-ASR 1.7B (3,4 GB RSS), Qwen3-ASR 0.6B (~20 % WER de).

Liquid AI LFM3-Audio-2B / LFM3-Omni-2B (STT + TTS + Sprach-Chat in einem Modell, llama.cpp-GGUF): verworfen, weil
Russisch als gesprochene Sprache fehlt (Omni kann Russisch nur als Text), Sprach-Chat und Live-ASR nur Englisch, TTS nur
„weiblich/männlich“ ohne Ausdrucks-Tags, ~1,7–2,1 GB allein, auf x86-CPU als 2B-Autoregressiv-Modell langsamer, und die
LFM Open License das kommerzielle Recht ab 10 Mio. USD Jahresumsatz entzieht. Qualität DE/EN etwas besser als Parakeet
(TypeWhisper 4-bit: EN 5,4 %, DE 6,3 %). Neu prüfen, sobald Russisch und eine Lizenz ohne Umsatzgrenze kommen.

## Eigene Messbefunde Parakeet TDT v3 (sherpa-onnx, Prüfset mit Codewörtern)
Prüfset: rund 1.700 Clips aus ~200 Sätzen de/ru/en, Supertonic- und Piper-Stimmen, 8 Bedingungen (sauber, Rauschen
SNR 20/10 dB, Hall, Codec-Rundreisen, leise −30 dBFS, übersteuert).
- **int8 gegen fp32:** fp32 erkennt Fachwörter und Denglisch-Verben spürbar besser (Größenordnung +8 bis +15
  Prozentpunkte je Kategorie), braucht aber rund +1,6 GB RSS (≈ 2,8 GB statt 1,2 GB). Auf 4-GB-Servern deshalb int8.
  Das fp16-Repo bei Hugging Face war leer; fp32 liegt als ONNX mit externer Gewichtsdatei (~2,4 GB) vor.
- **Beam statt greedy:** WER leicht besser, in einer echten Aufnahme ein richtiges Wort mehr, Zusatz-RAM ≈ 0 (isoliert
  gemessen), Latenz etwa +120 ms je 3-s-Clip.
- **Kontext-Biasing (Hotwords):** nie besser als Beam allein, ab mittlerem Score (≈ 3,5) Schaden an Nachbarwörtern
  („PDF“ → „DF“).
- **Allgemeine Nachbearbeitung** (einzeln gesprochene Buchstaben zusammenziehen, „12 a“ → „12a“): harmlos, aber
  geringe Wirkung (< 1 % der Clips verändert). Regeln nur auf Kleinbuchstaben-Folgen anwenden; sonst entstehen aus
  abgeschnittenen Wörtern neue Fehler („8 U[hr]“ → „8U“).
- **Korrektur durch ein schnelles Sprachmodell ohne Denken:** auf fehlerhaften Clips Zielbegriffe etwa 19 % → 44 %,
  kein Schaden an richtigen Kontrollsätzen, ~1,5–2,4 s und ~270 Tokens je Nachricht. Mit Denkmodus mehr Gewinn, aber
  4–11 s und bis ~700 Tokens. Gesprächskontext mitzugeben brachte kaum etwas.
- **Hinweis „Diktat“ an das antwortende Modell:** deutlich mehr richtige Deutungen von Fehlerkennungen, ohne
  Zusatzaufruf.
- **Bedingungen:** Lautstärke wirkt stärker als der Codec. Leise Aufnahmen bleiben die schwächste Gruppe, auch nach der
  Korrektur; ein sauberes, nahes Mikrofon ist der wirksamste Hebel.

## Quellen
- STT-Messung im CPU-Container (126 Clips de/en, Fallen zu Sprachhinweis/Stille): https://github.com/lampo-vr/lampo/blob/main/bench/stt/RESULTS.md
- STT-Benchmark de/en/ru, 66 Modelle (JS-Seite; Modellansicht per `?model=<id>&view=model`): https://typewhisper.github.io/typewhisper-benchmark/
- Lizenz-/Hardware-Index (40 Modelle, Mindest-RAM, kommerziell ja/nein): https://openvoiceindex.com/
- Langes Audio und int8 (SmoothQuant-Variante): https://huggingface.co/pantinor/parakeet-tdt-0.6b-v3-smoothquant
- Supertonic 3 (Sprachen, Lizenz, Tags): https://huggingface.co/Supertone/supertonic-3/blob/main/README.md
- sherpa-onnx TTS-Modelle je Sprache: https://k2-fsa.github.io/sherpa/onnx/tts/all/
- Piper-Stimmen für Testdaten (nicht ausliefern, Lizenz je Stimme): https://huggingface.co/rhasspy/piper-voices (`nix shell nixpkgs#piper-tts`)
- LFM3: https://docs.liquid.ai/lfm/models/lfm3-audio-2b, https://www.liquid.ai/lfm-license
- Qualitäts-Ranglisten: Hugging Face Open ASR / Open TTS Leaderboard.

## Recherche-Werkzeuge
- `web_search` mit 3–4 Blickwinkeln (Sprachen + CPU + Lizenz + Ausdruck), dann `fetch_content` und gezielt
  `get_search_content` mit `findText` (Tabellen „peak RSS“, „languages“, „license“), statt ganze Seiten zu lesen.
  Bei Hersteller-Doku zuerst die Spezifikationstabelle (Sprachliste, Lizenz) lesen: Sie entscheidet meist schon.
- Liefert eine JS-gerenderte Benchmark-Seite keinen lesbaren Inhalt, die Kennzahlen aus den Suchtreffer-Auszügen der
  Modellansichten nehmen.
