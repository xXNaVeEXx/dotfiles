---
name: brainstorming
description: "Bei wirklich neuen Features/Projekten mit unklarem Warum oder unklarer Form zuerst die Anforderungen herausfragen, Ansätze gegenüberstellen und ein Design-Doc freigeben lassen, bevor gebaut wird — Häppchen-Rückspielung, Sokratisches Fragen, Spikes; Routine-Aufgaben laufen bewusst ohne Gate autonom durch."
---

# brainstorming

# Brainstorming

Portiert aus obra/superpowers (MIT), angepasst an die autonome Arbeitsweise dieser Umgebung: Das Design-Gate greift NUR bei wirklich neuen Vorhaben mit unklarem Warum/Wie — Routine-Aufgaben und klar spezifizierte Features laufen ohne Rückfragen durch (research → build → verify in einem Zug).

## Erst prüfen: Was weiß ich eigentlich?

- **Alles Wesentliche steht im Auftrag** → normal durchziehen, sagen was getan wurde.
- **Es fehlt etwas Tragendes** (Warum, Zielgruppe, Form, Erfolgskriterium) → Gespräch starten.

## Vor dem ersten Wort: nachsehen

Liegt Kontext vor (Spec, Plan, Übergabe, gezeigte Dateien, früherer Verlauf): erst hineinlesen, bis ich erklären kann, wie die berührten Teile heute funktionieren. Nie fragen, was Projekt oder Kontext schon beantworten; nie entscheiden wieder aufmachen, was schon entschieden ist.

## Erste Nachricht

- **Auftrag ist schon spezifiziert**: In eigenen Worten zurückspielen (Was/Wofür/Warum), was die Recherche ergab (wie es heute funktioniert, was die Änderung berührt), auffällige Konflikte/billigere Pfade offen nennen. Eine Einladung zur Korrektur am Ende. Wenn nichts Wesentliches offen ist: den Kurzentwurf (Ansatz + Warum die anderen nicht passen, wenige Zeilen) direkt mitschicken und zur Freigabe bitten.
- **Auftrag ist vage**: EINE offene Frage in den Worten des Nutzers zum größten ungeklärten Punkt — und sagen, was die Antwort am Ergebnis ändern würde. Z. B. Bäckerei-Webseite: „Soll die Seite vor allem zum Reinkommen einladen (Öffnungszeiten + Auslage vorn) oder Bestellungen annehmen? Das wäre eine andere Seite."

Nur eine Frage gleichzeitig. Prozessschritte (wo Dateien hin, wie ich aufschreibe, was ich noch ansehe) sind eigene Entscheidungen: tun und sagen, nicht fragen.

## Das Gespräch

- **Erst beschreiben lassen**: solange das Warum unklar ist, offene Fragen OHNE Antwort-Optionen — die eigenen Worte des Nutzers tragen Absichten, die meine Optionen nicht tragen.
- **Dann skizzieren**: sobalt Auswahlmöglichkeiten benennbar sind, jede konkret mit Trade-offs + meiner Empfehlung.
- **Sokratisch fragen**: jede Frage baut auf der letzten Antwort oder einem Fund auf, hilft eine Konsequenz zu denken („Abstimmung schließt vor dem Termin, zwei sind neu dazu — stimmt mit, wer mittendrin beitritt?").
- **Fragen nur, wenn die Antwort bauen ändert** — sonst Entscheidung als korrigierbaren Vorschlag treffen und weiter.
- **Fachjargon vermeiden** — auch Codenamen/Vertragskürzel ausschreiben (Nutzer-Regel).
- **Territorium abdecken** (nicht als Fragenliste ablesen): Was ist das Besondere, warum jetzt, Erfolg/Anti-Ziele (was es auch bei technischem Erfolg wäre-Fehlschlag), Vorbilder (geliebt/gehasst), Ist-Zustand, Details die ihm wichtig sind.
- **Recon machen**: Codebase, eigene Dateien, Web — sagen was ich suchte und fand.
- **Ansätze ausbreiten** (vor dem Aufschreiben): 2–3 echte Alternativen konkret skizzieren, Trade-offs je Ansatz, eine empfehlen + Warum, Nutzer wählen lassen. Nur ein sinnvoller Weg → sagen und die anderen begründen verwerfen.

## Zeigen statt erzählen

Wenn Sehen mehr bringt als Lesen: wenige Zeilen Text-Skizze dessen, was er sehen würde (Screen, Ablauf, Layout). Mockups/Side-by-Side nur anbieten, wenn das Aussehen seine Entscheidung ist.

## Spikes

Ein Wegwerf-Bau ist oft der billigste Weg zu lernen, was gewollt ist. Anbieten, wenn es hilft; wenn gewollt: aus dem Weg gehen — Spikes ohne Tests, ohne Plan-Prozess, klar als Wegwerf gelabelt. Ergebnis zurück ins Gespräch bringen. Spike behalten wollen = neuer Auftrag durchs Gate.

## Zurückspielen in Häppchen

Sobald ein Teil verstanden ist: ihn in 200–300 Worten zurückspielen, dann weiterfragen. Nur was der Nutzer sagte, gilt als seines; alles von mir Eingegebene als mein Vorschlag mit Begründung. Jedes Häppchen endet mit „was fehlt / was ist falsch?"

## Größe bestimmen & Design-Doc

| Größe | Doku |
|---|---|
| Kleine Änderung | Kurzentwurf: das Besprochene in wenigen Zeilen |
| Projekt | Volles Design-Doc |

Design-Doc-Inhalt: Warum/Ziel, Goals/Non-Goals/Anti-Goals, Constraints, betrachtete Ansätze + Wahl + Begründung, entschiedene Wie-Teile, was dem Baumeister überlassen bleibt. Ablage im Software-Repo: `docs/specs/YYYY-MM-DD-<thema>-design.md` (committed), sonst sinnvoller Ort + sagen wo.

**Builder-Check (nur Projekt-Größe)**: frischen Sub-Agent (acp_delegate reviewer/planner oder subagent) als „Baumeister" das Doc prüfen lassen. Fragen sortieren: schon beantwortet → rein; klein → selbst entscheiden und als eigene Entscheidung markieren; seins → gebündelt in einer Nachricht an den Nutzer, wichtigste zuerst.

## Gate (nur bei neuen Vorhaben)

<NICHT BAUEN BIS DESIGN FREIGEGEBEN> — gilt für Produktcode, Scaffolding, Dependencies, Projektanlage. Ausnahmen: (a) Nutzer hat die Fragen abgelehnt/ausgeschlossen → normal durchziehen; (b) genehmigter Spike (bleibt Wegwerf, Behalten = neuer Auftrag durchs Gate); (c) Routine- und klar spezifizierte Aufgaben — die laufen autonom durch.

Nach Freigabe des Designs: Plan-Phase — hier bigpowers `scope-work`/`slice-tasks`/`plan-work` oder eigener Plan, kein weiteres Brainstorming.

## Red Flags

| Gedanke | Realität |
|---|---|
| „Ich biete ein Menü an Optionen an" | Optionen lenken — erst beschreiben lassen |
| „Ich fülle sinnvolle Defaults" | Gut — aber laut sagen; unhörbare Defaults sind unabwählbar |
| „Klingt gut" heißt freigegeben | Freigabe deckt nur das Gezeigte; ungesehenes Doc ist nicht freigegeben |
| „Spike läuft, ich baue darauf weiter" | Behalten = neuer Auftrag durchs Gate |
