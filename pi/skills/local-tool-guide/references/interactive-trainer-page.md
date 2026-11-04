# Interaktive Trainings-HTML für ein lokales Tool (Muster aus herdr-schulung.html)

Optionale Zusatz-Lieferung zur Markdown-Anleitung, wenn der Nutzer eine „anschauliche, intuitive, bedienbare" Seite mit Schulungs-Agent möchte. Konvention: `~/<tool>-schulung.html`.

## Aufbau (bewährt)

- **EINE self-contained Offline-Datei**, Vanilla JS/CSS, keine externen Dependencies; Deutsch; Farbwelt passend zum Tool-Theme (z. B. Gruvbox bei herdr).
- **Tabs** statt einer langen Seite: Konzept/Diagramm · Trainer+Quiz · Binding-Tabellen (durchsuchbar, Filter „nur Abweichungen von Upstream") · Chat-Agent · CLI/Config-Referenz.
- **Daten-getrieben:** `BINDINGS[]` (id, Gruppe, Aktion, keys[], Upstream-Default, Beschreibung) speist Tabellen, Trainer und Chat aus EINER Quelle. Zusätzlich `KB[]` (Wissenseinträge mit Such-Terms, Antwort, Vertiefung, Chips) und `QUIZ[]` (Frage, erwartete Binding-id, Hinweis).

## Chord-Auflösung & Tastatur-Capture

- Lookup-Maps aus BINDINGS bauen: `PREFIXMAP` (prefix+X → binding-id) und `DIRECTMAP` (Direkt-Chords); Range-Syntax `1..9` beim Map-Aufbau zu einzelnen Keys expandieren — sauber in EINER Schleife pro Map, keine Doppel-/Restloops ( produzieren Geister-Keys wie `alt+11`).
- `normChord()`: Modifier-Kleinbuchstaben, `shift+` bei Einzel-Satzzeichen strippen (`shift+?` → `?`), because Browser-Events liefern das Shift redundanzbehaftet.
- Echte Tastatur: keydown/keyup in **capture-Phase** abfangen, `preventDefault()` nur wenn Capture an und Target kein INPUT/TEXTAREA; `Esc` beendet Capture. Chord aus event ableiten (Strg/Alt/Shift + Key-Name, dt. Layouts berücksichtigen).
- Virtuelles Pad: Prefix-Aktionen zweistufig animieren — erst Prefix feeden, nach ~300 ms die Taste; direktes Futter für Direkt-Chords.
- Trainer-Feedback-Log mit Klassen ok/info/miss/err; sichtbarer Präfix-Zustand („TERMINAL" vs „PREFIX-MODE") ist das Kernlehrstück.

## Chat-Agent (ohne LLM, lokal)

- Fuzzy-Matching: de-Umlaut-Normalisierung + Levenshtein-Distanz gegen KB-Terms, Score-Schwelle ~1.2; Chips/Vorschläge als Fallback.
- `extractChords()`: Frage-Text → Chord-Tokens (`strg→ctrl`, `leertaste→space`, deutsche „pfeil"-Token verwerfen, nacktes „prefix" filtern → stattdessen KB-Eintrag). Chord-Antworten dreistufig einfärben: grün = live gebunden (+Default-Hinweis), gelb = nur Upstream-Default (Live-Alternative nennen), rot = unbekannt.
- Typing-Indikator + „mehr"-Vertiefung machen es agentisch; act-Buttons im Chat können Tabs wechseln oder Quiz starten.

## Fallstricke

- **Kein innerHTML mit zusammengebastelten Strings für dynamische Inhalte** — pi-lens wirft STOP (XSS-Regel), auch wenn Input nur lokal ist. Buttons/Spans per createElement + textContent bauen; statisches HTML-Markup in Daten-Strings ist OK.
- **JS-Syntax prüfen vor Auslieferung:** `<script>`-Block extrahieren (`awk '/<script>/{f=1;next}/<\/script>/{f=0}f'`) und `node --check` darüber laufen lassen — HTML-Dateien sonst ungetestet.
- Single-file heißt: keine module-Imports, alles in einem `<script>`; globale Funktionen für inline-onclick brauchen klassische Deklaration.
