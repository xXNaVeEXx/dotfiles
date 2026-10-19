---
name: parity-gap-audit
description: Feature-Paritäts-Audit der eigenen App gegen Open-Source-Vorbilder per Researcher-Sub-Agents — Repos shallow klonen, strukturierte Briefs (Funktionsinventar, Abgleich gegen LC/LX-Doku, priorisierte Lückenliste, Top-5), Konsolidierung als GAP-ANALYSE-Doku-Commit. Use when geprüft werden soll, ob die eigene Software alle Funktionen von Vorbildprojekten (z. B. pi, DeepSeek Harness, T3 Code) abbildet oder ein Folge-Audit nach größerem Ausbau ansteht.
---

# parity-gap-audit

# parity-gap-audit

# Feature-Paritäts-Audit eigener Software gegen Open-Source-Vorbilder

Klasse: Prüfen, ob die eigene App die Funktionen eines oder mehrerer Open-Source-Vorbildprojekte
vollständig abbildet — als Erst-Audit („welche Features brauchen wir") oder als Zweit-Runde nach
größerem Ausbau („was fehlt jetzt noch"). Kernidee: Je Vorbild EIN Researcher-Sub-Agent mit
strukturiertem Brief; der Orchestrator konsolidiert nur.

## Procedure
1. **Vorbilder lokal bereitlegen:** Je Projekt einen flachen Klon (spart Platte/RAM):
   `git clone --depth 1 https://github.com/<org>/<repo> .tmp/vorbilder/<kurzname>`.
   Vorher `free -m` prüfen; Klone sind RAM-neutral, Analyse-LLMs nicht (RAM-Regeln des Rechners gelten).
2. **Vergleichsbasis benennen:** Die EIGENE Funktions-/Integrations-Doku mit stabilen IDs
   (z. B. FEATURES.md mit LC-Nummern, INTEGRATION_TODO.md mit LX-Nummern). Absolute Pfade in den Brief.
3. **Je Vorbild einen researcher-Delegate** (async, 45–60 min Timeout), Brief self-contained:
   - Repo-Pfad (lokal geklont) + 1 Satz Architektur-Kontext
   - Vergleichsbasis-Pfade der eigenen App + Hinweis auf Symbole (✅ umgesetzt / ➖ bewusst nicht)
   - Geforderte Report-Struktur: A) Funktionsinventar (je 1 Zeile) · B) abgedeckt mit ID-Verweis ·
     C) **LÜCKEN mit Priorität hoch/mittel/niedrig + 1 Satz Begründung** (Kernergebnis!) ·
     D) bewusst nicht umgesetzt (stichpunktartig) · E) Top-5-Empfehlungen
   - Regel: nur Belegbares, keine Spekulation; Sprache des Nutzers (hier Deutsch)
4. **Ergebnisse einsammeln** (Benachrichtigungen kommen automatisch, nicht pollen): Je Bericht die
   Sektionen C/E lesen und in der Antwort zusammenfassen.
5. **Konsolidieren und festhalten:** Eine Doku-Datei `<projekt>/docs/reports/GAP-ANALYSE-<datum>.md`:
   Kopf mit konsolidierter, QUER über alle Berichte gedachter Nachzieh-Priorität (gleiche Themen
   verschiedener Vorbilder zusammenführen, z. B. „Agenten-Orchestrierung" statt 2× Einzelitem),
   danach die Originalberichte 1:1 (`cat` der Delegate-Ausgabedateien). Als docs-Commit pushen.

## Pitfalls
- Briefs müssen self-contained sein: Delegates sehen die Konversation NICHT. Vergleichsbasis ohne
  absolute Pfade → Agent ratet. Struktur nicht erzwingen → ausufernde Berichte ohne priorisierte Lücken.
- Delegates sind read-only: Ergebnisse liegen in der Ausgabedatei (`/tmp/acp-delegate/<runId>.out`),
  vom Orchestrator in die Projektdoku kopieren — /tmp ist flüchtig.
- Drei parallele Researcher sind ok, mehr nur nach RAM-Lage; Build-Worker nie parallel zum Audit starten.
- Keine Zahlen erfinden: Deckungs-% nur nennen, wenn ein Test-/Audit-Bericht sie belegt.
