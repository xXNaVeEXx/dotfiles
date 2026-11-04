---
name: llm-chat-performance
description: "KI-/LLM-Chat zu langsam: Wartezeit messen (Benchmark, Denk- vs. Tool-Anteil, gleiche Zeitfenster), echte Gespräche aus chat_messages/ai_usage_logs auswerten und Hebel umsetzen (Denkstufe, Runden bündeln, Katalog/Prompt verkleinern) — Use when the user complains that the AI/agent chat answers slowly, asks to analyse tool calls of real chats, or a change must be proven not to slow the chat down."
---

# llm-chat-performance

# LLM-Chat-Performance messen und verbessern

Klasse: „Die KI antwortet zu langsam“ — Ursache belegen (Denken vs. Tool-Runden vs. Prompt-Größe), Maßnahmen umsetzen,
Wirkung belastbar nachweisen. Gilt für Agenten-Chats mit Tool-Aufrufen (z. B. die KI im mag-tech-monorepo).

## 1. Messen, bevor optimiert wird
1. Vorhandenen Benchmark nutzen (im mag-tech-monorepo `apps/besichtigungs-app/docs/ki-benchmark.md`, Aufruf im
   Sperr-Wrapper mit `bash -c 'cd <app> && npx tsx --require ./scripts/ki-benchmark/server-only-stub.cjs …'`), je Aufgabe
   Gesamtzeit, Zeit bis zum ersten Token, Denkzeit-Anteil, Runden, Tool-Aufrufe (wiederholt/fehlgeschlagen), Prompt-,
   Katalog- und Systemprompt-Tokens, Cache-Quote.
2. Gültigkeit prüfen, bevor eine Zahl zählt: Korrektheitsquote, keine 429 im Log, gesendete Denk-Felder je Runde im
   Ergebnis-JSON (Nebenaufrufe wie Titel mit „Denken aus“ gehören nicht dazu), ≥ 2 Wiederholungen. n = 1 mit Ausreißer
   nicht berichten.
3. Vergleiche nur im SELBEN Zeitfenster: Basis (Ziel-Branch ohne Änderung) direkt vor oder nach dem Kandidaten messen.
   Grund: Die Anbieter-Latenz schwankt über den Tag um 20 % und mehr; eine Messung vom Abend gegen eine vom Nachmittag
   täuscht Regressionen vor. Abnahmegrenze vorab festlegen (z. B. ≤ +10 % gegen die gleichzeitige Basis).
4. Denk-Stufen getrennt messen (z. B. hoch und niedrig): Das trennt den Effekt von Code-Maßnahmen von dem der Einstellung.
5. Eine Maßnahme gilt nur als belegt, wenn die Benchmark-Aufgaben ihren Mechanismus auch auslösen. Für Ergebnis-Obergrenze,
   Zwischenspeicher oder Laufbremse braucht es Aufgaben mit großen Ergebnissen, wiederholten Lese-Aufrufen bzw. vielen
   Runden. Lösen sie ihn nicht aus, als „keine Verschlechterung“ berichten statt als Beschleunigung, und die Wirkung an
   echten Läufen nachmessen. Vor jedem Bericht an den Nutzer die Einschränkungen im Spur- oder Worker-Bericht lesen.
   Grund: Ohne Auslöser ist der Zeitunterschied reine Modellstreuung, und eine voreilige Erfolgszahl muss später
   zurückgenommen werden.

## 2. Echte Gespräche auswerten (ergänzt den Benchmark)
- Quellen: `chat_messages` (role, `tool_calls` jsonb, `tool_call_id`, `sort_order`, `created_at`) für Runden und
  Tool-Folgen je Antwort; `ai_usage_logs` (Tokens je Modellaufruf, `model`, `created_at`, `session_id`) für Zeit
  zwischen Runden und Prompt-Größe. Läuft die Abrechnung über ein Gateway, endet `ai_usage_logs`; dann liefern `ki_laeufe`
  (je Antwort: Dauer, Ende-Grund, Bremse, Cache-Treffer; FK auf `chat_messages`) und `ki_lauf_runden` (je Runde: Dauer,
  Prompt-/Ausgabe-Tokens, Tool-Aufrufe) die Zeiten. Nur lesend (SELECT), Ergebnisse aggregiert, keine Inhalte zitieren.
- Auf einem Cluster: `kubectl exec` in den Postgres-Pod mit `psql -f -` (SQL per stdin, erste Zeile
  `SET default_transaction_read_only = on;`). Zugang, Datenform der Tool-Teile und bewährte Abfragen:
  `references/chat-analyse-sql.md`. Fehlt der Zugang (kein kubeconfig,
  Schlüssel nicht freigegeben), den Nutzer EINMAL um eine dauerhafte Lösung bitten (öffentlichen Schlüssel zur Freigabe
  nennen oder kubeconfig-Pfad), nicht raten und nicht Passwörter erfragen.
- Kennzahlen je Antwort: Runden, Tool-Aufrufe, gleiche Aufrufe mit gleichen Argumenten, Fehlschläge, Kontroll-Abrufe
  direkt nach einem Anlegen, große Tool-Ergebnisse (Zeichen), Abstand zwischen Modellaufrufen, Prompt-Tokens je Runde.
- Kandidaten für neue Sammel-Werkzeuge finden: Werkzeugnamen je Antwort aus `chat_messages.tool_calls`
  (`jsonb_array_elements … with ordinality`, nur `type = 'tool-call'`) zählen, aufeinanderfolgende Paare bilden und die
  langsamsten Läufe (`ki_laeufe.dauer_ms` + Rundenzahl) mit ihrer Werkzeugfolge auflisten. Dasselbe Listen-Werkzeug
  mehrfach hintereinander heißt Blättern: Das Modell sammelt seitenweise, was ein aggregierendes oder filterndes
  Werkzeug in einem Aufruf liefern würde. Paare verschiedener Werkzeuge, die fast immer gemeinsam kommen (Datensatz →
  Verlauf), sind Kandidaten für ein „Akte in einem Aufruf“-Werkzeug. Vorschläge nach der Zahl betroffener Läufe und deren
  Dauer ordnen, nicht nach Bauchgefühl.
- Auch die Kundeninstanzen auswerten, nicht nur das Test-System: Echte Nutzer stellen andere Fragen (Einsatz- und
  Zeitplanung, E-Mail-Suche) als der Testende, und dort laufen oft ältere Fassungen ohne neuere Bremsen. Gibt es keine
  Lauf-Kennzahlen (ältere Fassung), die Antwortdauer als Abstand zwischen Assistent-Nachricht und der letzten
  Nutzer-Nachricht davor in derselben Sitzung schätzen (nur Abstände unter 1 h). Interaktive und Agenten-/Zeitplan-
  Sitzungen (`chat_sessions.agent_id`) getrennt ausweisen. Abfragen auf fremden Instanzen nur mit CTEs statt
  `CREATE TEMP VIEW`, weil die schreibgeschützte Transaktion keine Objekte anlegen darf.
- Antworten OHNE Werkzeug-Aufruf messen: Ihre Dauer ist reine Modell- und Denkzeit. Liegt sie hoch (eine Minute und
  mehr), hilft die Denkstufe (§3.1) mehr als jedes neue Werkzeug, und das gehört in die Empfehlung an den Nutzer.

## 3. Hebel in der Reihenfolge ihrer Wirkung
1. Denken: Bei hoher Denkstufe entfällt meist der Großteil der Wartezeit aufs Denken (gemessen 73–91 %). Denk-Stufe
   je Modell/Firma/Chat übersteuerbar machen und im Betrieb niedrig setzen; die Code-Maßnahmen allein bringen deutlich
   weniger.
2. Runden: unabhängige Abrufe in einer Runde bündeln (parallele Tool-Aufrufe), keine Kontroll-Abrufe nach Anlegen,
   Skill-/Hilfe-Laden mit mehreren Schlüsseln in einem Aufruf, Höchstschritte begrenzen, idempotente Anlege-Tools mit
   Hinweis gegen Doppelanlage.
3. Prompt-Größe: Tool-Katalog nach Bedarf auswählen (mehrdeutige Stichworte nicht alle Tools laden lassen), lange
   Abläufe nur bei Treffer einblenden, große Tool-Ergebnisse kürzen; Prompt-Cache-Quote im Blick behalten.
4. Neue Features, die Kontext in jeden Prompt legen (Seitenkontext, neue Tools), nur bei Bedarf zuschalten und mit
   Benchmark vorher/nachher abnehmen.
5. Zähl- und Quotenfragen („wie viele …“, „wie viel Prozent der Angebote werden zu Rechnungen“): ein eigenes
   Kennzahlen-Werkzeug, das in der Datenbank aggregiert (firmengebunden, Rechte je Bereich) und dessen Beschreibung das
   Modell bei solchen Fragen zuerst wählen lässt. Grund: Ohne es zählt das Modell über Listen-Werkzeuge in mehreren
   Runden mit vielen Aufrufen und wachsendem Prompt; das kostet Minuten und lädt zu Behelfen ein (Suche nach einzelnen
   Buchstaben). Dasselbe Muster für jede gefundene Schleife (§2): Zeitraum-Übersicht statt Einzelabruf je Datensatz
   (Einsätze mit Team, Fahrzeugen und Zeiten; Arbeitszeiten je Person nach Auftrag), Suche über alle Postfächer mit
   serverseitigem Abgleich statt Abgleich-/Auflisten-Schleife, „Neuigkeiten seit …“ statt mehrerer Änderungs-Abrufe,
   Sammel-Varianten für Suche und Rechnen. Regeln je neuem Werkzeug: nur lesend, eine Abfrage je Bereich statt je
   Datensatz, Rechte je Teil, abgeleitete Zahlen nur aus erlaubten Bereichen, kompakte Ergebnisse mit Obergrenze,
   Messung vorher/nachher mit dem echten Modell. Gemeinsame Regeln für parallele Worker als eine Datei schreiben, auf die
   jeder Auftrag verweist.
6. Antwortlänge: Fragen, deren Antwort gesprochen wird (Sprachnachricht, Gesprächsmodus), mit einem Hinweis „knapp,
   Kernzahlen zuerst“ beantworten lassen. Grund: Die letzte Runde ist reine Ausgabe; tausende Ausgabe-Tokens für eine
   Sprachfrage verlängern die Wartezeit, obwohl die Sprachausgabe ohnehin nur eine Zusammenfassung spricht.

## 3b. Robustheit der Werkzeug-Aufrufe
- Eine Werkzeug-Eingabe, die das Schema nicht besteht, darf nie die ganze Antwort abbrechen. Im AI SDK beendet ein
  `AI_InvalidToolArgumentsError` den Strom, wenn `experimental_repairToolCall` null liefert. Deshalb erst eindeutige
  Fehler reparieren (z. B. JSON-Text auspacken), alles Übrige auf ein internes Werkzeug umleiten. Dieses gibt die
  Prüfmeldung (Werkzeug, Feld, Regel, Wert) als Ergebnis zurück; das Modell korrigiert sich in der nächsten Runde.
  Grund: Sonst endet ein Lauf nach vielen erfolgreichen Runden mit einer Fehlermeldung, und der Nutzer verliert die
  ganze Wartezeit. Erkennen in den App-Logs: `[ai:chat] stream error` mit `AI_InvalidToolArgumentsError`; in den
  Lauf-Kennzahlen Ende-Grund „fehler“ nach vielen Runden.

## 4. Nachweis und Bericht
- Tabelle vorher / nur Code / Code + niedrige Denkstufe mit Korrektheit; Aufgaben mit auffälliger Abweichung einzeln
  nennen. Ergebnisdateien mit Label und Zeitstempel ablegen; ungültige Läufe löschen statt committen.
- Dem Nutzer sagen, welche Einstellung im Betrieb nötig ist, damit der Gewinn ankommt (z. B. Denk-Level senken).
