---
name: systematic-debugging
description: "Jeden Bug, Testfehler, Crash oder unerwartetes Verhalten ursächlich klären, BEVOR ein Fix vorgeschlagen wird — vier Phasen (Reproduzieren + Evidenz an Komponentengrenzen, Musterabgleich, einzelne minimal getestete Hypothese, Fix mit vorher rot geschriebenem Test), Red-Flag-Liste gegen Symptom-Fixes und 3-Fixes-Regel mit Architektur-Stop."
---

# systematic-debugging

# Systematic Debugging

Portiert aus obra/superpowers (MIT), angepasst an diese Umgebung.

**Eisernes Gesetz:**

```
KEINE FIXES OHNE ZUVOR ABGESCHLOSSENE URSACHEN-SUCHE
```

Wer Phase 1 nicht abgeschlossen hat, darf keinen Fix vorschlagen. Symptom-Fixes sind Fehlschläge — auch wenn sie „funktionieren".

## Wann

Jeder technische Defekt: Testfehler, Produktions-Bug, unerwartetes Verhalten, Performance-Probleme, Build-Abbrüche, Integrationsprobleme. Gerade unter Zeitdruck, wenn der Fix „offensichtlich" scheint, oder wenn bereits 2+ Fixes scheiterten.

## Phase 1 — Ursache finden (vor JEDEM Fix)

1. **Fehlermeldung komplett lesen** — Stack-Traces bis zum Ende, Zeilennummern, Codes notieren. Meldungen enthalten oft die Lösung.
2. **Zuverlässig reproduzieren** — exakte Schritte, tritt es immer auf? Nicht reproduzierbar → mehr Daten sammeln, nicht raten.
3. **Letzte Änderungen prüfen** — git diff/log, neue Abhängigkeiten, Config-Änderungen, Umgebungsunterschiede.
4. **Evidenz an Komponentengrenzen sammeln** (Multi-Layer-Systeme: CI→Build→Sign, API→Service→DB): JEDE Grenze instrumentieren (was geht rein, was raus, Env/Config-Propagation, Zustand je Schicht). Ein Lauf zeigt, WO es bricht; dann gezielt die fehlerhafte Komponente vertiefen.
5. **Datenfluss rückwärts verfolgen** — Wo entsteht der schlechte Wert? Wer übergibt ihn? Bis zur Quelle zurück; an der Quelle fixen, nicht am Symptom.

## Phase 2 — Musterabgleich

- Funktionierendes Analog im gleichen Codebase suchen (was ähnelt dem Kaputten und läuft?).
- Referenz-Implementierungen KOMPLETT lesen, nicht überfliegen.
- Jeden Unterschied zwischen funktionierend/kaputt auflisten — auch scheinbar irrelevante. Nicht annehmen, „das kann nicht matters".

## Phase 3 — Hypothese + minimaler Test

- EINE konkrete Hypothese ausschreiben: „X ist die Ursache, weil Y."
- Kleinste mögliche Änderung zu ihrer Prüfung, eine Variable gleichzeitig.
- Scheitert sie → NEUE Hypothese, nie Fixes auf Fixes stapeln.

## Phase 4 — Implementierung

1. **Zuerst failing Test**: einfachste Reproduktion als automatisierter Test (oder Einmal-Skript) — MUSS rot sein, bevor gefixt wird.
2. **Einzelner Fix** an der Ursache. Keine „while I'm here"-Nebenverbesserungen, kein gebündeltes Refactoring.
3. **Verifizieren**: Test grün, keine anderen Tests rot, Problem wirklich weg. Bei Rust: rust-crate-change-verify-Kette (check --all-targets → nextest → clippy).
4. **Fix scheitert?** Zählen: < 3 Fehlversuche → zurück zu Phase 1 mit den neuen Erkenntnissen.

## Die 3-Fixes-Regel (Architektur-Stop)

Nach **3 gescheiterten Fixes**: STOPP. Das Muster „jeder Fix enthüllt ein neues Problem an anderer Stelle / braucht Massen-Refactoring / erzeugt neue Symptome" heißt: falsche Architektur, nicht falsche Hypothese. Fundament infrage stellen und mit dem Nutzer besprechen, bevor Fix #4 versucht wird.

## Red Flags — sofort zurück zu Phase 1

- „Erstmal Quickfix, später untersuchen"
- „Probier doch mal X"
- „Mehrere Änderungen auf einmal, dann Tests"
- „Test überspringen, ich prüfe manuell"
- Fix-Vorschläge, bevor der Datenfluss verfolgt wurde
- „Noch ein Versuch" (nach 2+ Fehlversuchen)

## Wenn die Suche „keine Ursache" ergibt

Echt umgebungs-/timing-/extern-bedingt? Dann: Untersuchung dokumentieren, angemessenes Handling bauen (Retry, Timeout, Fehlermeldung), Monitoring/Logging ergänzen. Aber: 95 % der „keine Ursache"-Fälle sind unvollständige Untersuchung.

## Verwandte Skills hier

- `diagnose-crash` (Omarchy/.agents) — Coredump-Analyse, Backtrace-Symbolisierung
- `ci-flake-triage` (Skill) — sporadisch rote CI, verlorene Signale, deterministischer Regressionstest rot/grün
- bigpowers `diagnose-root` — formale 4-Phasen-RCA mit Bug-Doku specs/bugs/BUG-*.md
- `llm-chat-performance` — Performanz-Messungen statt Bauchgefühl
