# App-Kopien an Domänen-Evolution anpassen (zentrio-app und künftige Kopien)

Kontext: App-Kopien (zentrio-app) sind alte Snapshots der Haupt-App (besichtigungs-app). Sie importieren per `workspace:*` dieselben geteilten Domänen-Pakete (`@monorepo/domain-*`, auth, db, ui, config). Evolvieren die Pakete weiter, ohne dass die Kopie mitgezogen wurde, bricht die Kopie — Typfehler (tsc), Laufzeitfehler in eigenen Tests (Jest) und Migrationslücken (datenbank-Check).

## Grundprinzip: Portieren nach Zwilling, nicht flicken

- Jede kaputte Datei der Kopie hat einen **Zwilling** in der Haupt-App (`apps/besichtigungs-app/src/…`), der die evolvierte Fassung ist. Erst Zwilling lesen, dann SEMANTIK portieren (kleine Diffs) oder Komponente/Modul/Test samt Abhängigkeiten als Ganzes übernehmen (große Diffs) — nie die alte Kopie weiterflicken.
- Transitiv mitziehen: Komponentenordner, mitgelieferte Tests, Barrel-Exports in actions, helper-libs (Formular-/Ansichts-/Text-libs), hooks. GEMEINSAME Artefakte (z. B. `apps/umzugsoffice-mobile/api/openapi.json`, generierter Dart-Client) lesen BEIDE Apps — Regenerierung per App-Generator-Skript (`--pruefen` = CI-Modus), danach Vertrags- und Routen-Tests grün fahren.
- Kopien dürfen eigene Erweiterungen BEHALTEN, die die Haupt-App nicht hat (z. B. zentrio: Pflichtenheft-Rechte in permissions.ts, eigene Migrationsnummern) — beim Twin-Port Basiskopie machen + eigene Blöcke wieder einfügen, nicht blind überschreiben.
- Wer eigene Rechte hat, braucht sie auch im Rechte-Katalog-Wächter: Wirkort-Scan des Tests auf BEIDE App-Quellbäume ausweiten, sonst failt „Recht ohne Wirkort".

## Verifikations-Geber-Wahrheit (nicht lens)

- Ground Truth sind ausschließlich: `pnpm exec tsc --noEmit` IM App-Verzeichnis und `pnpm run test` (Jest) der Kopie. tsc OHNE Projekt (-p) und pi-lens analysieren außerhalb des tsconfig-Kontexts und produzieren Schein-Funde (fehlende Module, Cascades, „as unknown as"-Regeln) — solche Funde auf frisch kopierten Dateien zuerst gegen den Zwilling/Bestand beweisen (`git diff --quiet origin/test -- <datei>` → identisch heißt Vorbestand), dann dauerhaft überspringen.
- Komponenten-Test-Fehler „Cannot read properties of undefined (reading 'X')" = fehlender Subkomponenten-Mock (Mock-Datei des Twins kopieren, z. B. datetimePickerStub mit DateField/ZeitraumFeld).
- ESM-Import-Fehler „Unexpected token 'export'" aus einem npm-Paket (z. B. next-intl über packages/ui) = Jest-Snapshot der Kopie kennt die moduleNameMapper/transformIgnorePatterns-Regeln der Haupt-App nicht → jest.config.ts-Zeilen des Twins portieren + Mock-Datei + messages/de.json mitkopieren.
- Suite einer Kopie NIE nur per tsc grün erklären — die Kopie hat gleichnamige eigene __tests__-Suiten; ein CI-„Runner-Umgebung"-Verdacht ist zuerst ein „falsche App getestet"-Verdacht (Log-Zeile „<app>#test: pnpm run test exited" zeigt die App).

## Migrationsnachzug

Eigene Migrationskette der Kopie endet früher als der Schema-Stand der geteilten Pakete → fehlende .sql der Haupt-App ab ihrem Fork-Punkt als Kopie mit hochlaufender Nummer übernehmen (Reihenfolge im Dateinamen zählt, Replay verträgt Nachzügler, wenn keine Abhängigkeit verletzt ist — der Check beweist es). Zählweise beim Kopieren: vierstelliger Präfix (name[:4]), nicht dreistellig.
