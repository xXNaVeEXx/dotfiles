---
name: llm-extraktion-prompts
description: "Use when building or fixing prompts that extract structured data (actions, entities, items) from text or images with schema validation and subsequent execution — covers context-list shortening pitfalls, deterministic post-processing, and live A/B measurement proofs."
---

# llm-extraktion-prompts

# llm-extraktion-prompts

Klasse: Prompts, die aus Bild/Text strukturierte Daten (Aktionen, Entitäten) ziehen, die danach schemavalidiert und ausgeführt werden — typischerweise KI-Features in Geschäftsanwendungen (Auswertung, Übernahme, Prüfung).

## Grundregeln
- Kontextlisten im Prompt (Vorhandenes, Vokabular, Vorlagen) wirken wie Auswahllisten: Das Modell kürzt ausgelesene Werte auf den nächsten Kontext-Eintrag („Sofa 3-Sitzer“ → „Sofa“), weil die Liste wie ein Namensvorrat gelesen wird. Deshalb im Prompt ausdrücklich: Kontexteinträge sind nur Hinweis für spätere serverseitige Anreicherung; der Wert wird TROTZDEM exakt wie geschrieben übernommen, inklusive Zusätze (Maße, Material, Mengen), mit 2–3 konkreten Beispielen (bleibt X, nicht Y). Grund: Abkürzungen verlieren Informationen, die für Folgeschritte (Volumen, Demontage, Preis) zählen.
- Ob das Modell „denkt“ (Reasoning-Modus), hängt am Betrieb (Extra-Body, Anbieterkonfiguration) — sich darauf nie verlassen. Kern-Invarianten deterministisch im Code prüfen/ergänzen, NACH der Schema-Validierung und VOR der Rückgabe, so dass alle Verbraucher (Vorschau, Ausführung, API) dieselbe Liste sehen. Typischer Fall: referenzierte Ziele fehlen (Aktion nennt eine Entität, die weder im Kontext noch im Batch angelegt wird) → deterministisch vor der ersten betroffenen Aktion anlegen; Namensvergleich über genau eine normalisierte Funktion.
- Prompt-Regeln nummerieren und im Unit-Test die Kernregeln wörtlich asserten (String-Contains), damit Refactoring sie nicht still entfernt.
- Prompt-Fixes sind nie bewiesen ohne Messung: je Stand N echte Läufe (≥ 10) davor/danach, zählen, wie viele Werte exakt übernommen wurden, Zahlen ehrlich berichten (Modell bleibt nichtdeterministisch — Stichprobe, keine Garantie; so im Bericht sagen). Zielwert vorher festlegen.
- Echtdaten-Antworten des Modells (mit und ohne Reasoning) als Fixtures in Unit-Tests übernehmen: Sie sind die einzigen Belege für echtes Modellverhalten; Mocks testen nur die eigene Logik.
- Fehlerbilder der Ausführung („Raum nicht gefunden“, „Entität fehlt“) deuten auf fehlende deterministische Ergänzung, nicht auf Prompt-Verschlechterung — zuerst zählen, wie viele Aktionen an fehlenden Entitäten scheitern, dann Ursache (Reasoning an/aus) variieren und vergleichen.

## Procedure
1. Ist-Zustand messen (N Läufe, Protokolldatei je Lauf mit allen ausgelesenen Werten).
2. Prompt schärfen (Kontextlisten-Hinweis + Beispiele) ODER deterministische Ergänzung ergänzen — nie beides auf einmal, sonst ist die Messung nicht zuordenbar.
3. Nachher-Messung mit gleichem Maßstab; Zielwert prüfen; nur bei Verfehlen einmal iterieren.
4. Unit-Tests: Prompt-Assertionen + Echtdaten-Fixtures + deterministische Funktion + Einbindung in die Auswertungsfunktion.
5. Doku: Messreihe als Tabelle (Modell, Modus, N, exakt/gesamt), Grenzen benennen.
