---
name: review-turn
description: "Use when a review turn (Custom-Message hermes-review) runs or skills and memory entries are created or patched by hand — where a session lesson belongs (memory vs. skill vs. drop), the patch mechanics of skill_manage (fresh view before writing, concurrent edits by parallel sessions, single-line anchors, sequential patches), and the one-paragraph closing format."
---

# review-turn

# Review-Turn: Sitzungslektionen in Skills und Dauer-Gedächtnis überführen

Ein Review-Turn (Custom-Message `hermes-review`) ist ein Lern-Durchlauf im Hintergrund. Der Nutzer liest mit und
will keine Fragen und keine neue Arbeit — nur eine kurze Schlussmeldung, was gespeichert wurde und warum. Ein
Durchlauf ohne eine einzige Änderung ist eine verpasste Chance, „Nothing to save.“ nur bei wirklich leerer Sitzung.

## Ablauf

1. **Signale sammeln**: Korrekturen des Nutzers (Stil, Ablauf, Stand-Nachfrage), neue Techniken und Umwege, eine
   geladene Skill-Stelle, die falsch oder veraltet war. Pro Signal entscheiden, ob es dauerhaft ist.
2. **Zielort wählen** — eine Tatsache hat genau einen Ort:
   - gilt in JEDER Sitzung unabhängig von der Aufgabe → `memory` (`target=user` für die Person, `target=memory`
     für die Umgebung). Beide Dateien haben harte Zeichenobergrenzen: konsolidieren statt anhängen. Das Snapshot
     ist je Sitzung eingefroren, Wirkung ab der nächsten Sitzung.
   - Verfahren für eine Aufgabenklasse → Skill, in dieser Reihenfolge: die gerade geladene Skill patchen → passende
     vorhandene Umbrella → Unterstützungsdatei darunter (plus Zeiger in ihrer SKILL.md) → neue klassenbezogene
     Umbrella.
   - transient, umgebungsspezifisch (fehlendes Binary, Frischinstallationsfehler) oder ungelöst → nicht speichern;
     nur die funktionierende Alternative, nie die Sackgasse.
3. **Vor jedem Patch die Skill frisch ansehen** (`view`): Der Schreibschutz verlangt den Lese-Nachweis innerhalb
   des laufenden Review-Turns; ein View aus der Sitzung davor zählt nicht.
4. **Falsche Stelle an Ort und Stelle korrigieren**: den Satz ersetzen, der in die Irre geführt hat, keinen
   „UPDATE:“-Nachtrag darunter. Dieselbe Lektion zum zweiten Mal = dieselbe Regel schärfen, keine zweite anlegen.
   Eine Regel ist ein Imperativ plus ein Nebensatz zum Mechanismus, angeheftet an den Schritt, den sie betrifft —
   ohne Tickets, Daten und wörtlichen Nutzertext.
5. **Abschluss**: EIN kurzer Absatz (gespeichert/geändert + warum) oder „Nothing to save.“ Sonst nichts.

## Stolperfallen beim Patchen (skill_manage)

- „old_text not found“ kurz nach dem Ansehen: zuerst den echten Stand holen (`grep -n` auf den Anker, `ls -l` auf
  die Änderungszeit), dann auf dem jetzigen Text patchen. Bei diesem Nutzer laufen mehrere Sitzungen parallel, die
  ebenfalls Skills umschreiben — der angezeigte Stand kann schon eine Minute alt sein. Keinen Abschnitt neu
  schreiben, den gerade eine andere Sitzung bearbeitet; nur den eigenen Satz ergänzen.
- Die Ursache eines fehlgeschlagenen Patchens nicht raten, sondern die Zeile in der Datei ansehen. Eine vermutete
  Mechanik, die nicht an der Datei geprüft ist, wird nicht zur Regel — falsche Regeln zitiert man später gegen sich
  selbst.
- Anker einzeilig halten: `view` zeigt harte Zeilenumbrüche nicht unterscheidbar von Faltungen, mehrzeilige
  `old_text`-Spans brechen an umgebrochenen Zeilen.
- Mehrere Patches an dieselbe Skill nacheinander senden, nie parallel im selben Aufrufblock.
- Neue Skill: Name klassenbezogen (keine Fehlernummer, kein Projekt-Schlachtwort, kein Sitzungs-Artefakt),
  `description` ein Satz, Auslöser zuerst, höchstens 1024 Zeichen; Procedure zuerst, Fallstricke am jeweiligen
  Schritt.
